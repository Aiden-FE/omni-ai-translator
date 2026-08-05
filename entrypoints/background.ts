// Background Service Worker（MV3）
// 负责：接收翻译请求、经适配层统一入口调用翻译、管理配置。
// 注意：SW 会被回收，状态不依赖内存，配置走 storage。
// 本文件不含源类型 if-else 分支，所有源类型路由由适配层（shared/translator）处理。

import { getProviders, getSettings } from '@/shared/storage';
import {
  translateWithAdapter,
  translateWithAdapterStream,
  translateBatchWithAdapterStream,
  testWithAdapter,
  getActiveSources,
  getTranslationCapabilities,
  setActiveSource,
} from '@/shared/translator';
import type {
  BackgroundCommand,
  BatchStreamPortMessage,
  BatchTranslateResult,
  DisplayMode,
  Message,
  StreamPortMessage,
} from '@/shared/types';

type BatchStreamRequestMessage = Extract<BatchStreamPortMessage, { type: 'request' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDenseNonEmptyArray(value: unknown[]): boolean {
  if (value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isBatchStreamRequestMessage(value: unknown): value is BatchStreamRequestMessage {
  if (!isRecord(value)
    || value.type !== 'request'
    || typeof value.requestId !== 'string'
    || typeof value.targetLang !== 'string'
    || !Array.isArray(value.chunks)
    || !isDenseNonEmptyArray(value.chunks)) {
    return false;
  }

  return value.chunks.every((chunk) => isRecord(chunk)
    && typeof chunk.chunkId === 'string'
    && typeof chunk.segmentId === 'string'
    && Array.isArray(chunk.parts)
    && isDenseNonEmptyArray(chunk.parts)
    && chunk.parts.every((part) => isRecord(part)
      && Number.isInteger(part.partId)
      && Number.isInteger(part.sliceIndex)
      && typeof part.text === 'string'));
}

export default defineBackground(() => {
  // 右键菜单「全文翻译」点击事件（v0.4.0 入口）。
  // MV3 约束：onClicked 监听必须顶层同步注册——SW 被菜单点击事件唤醒时，
  // 只有顶层同步注册能保证监听器在事件分发前已绑定；放进异步回调会丢事件。
  browser.contextMenus.onClicked.addListener((info, tab) => {
    // 菜单 id → 显示模式契约：fullpage-replace / fullpage-bilingual（后续任务以此为准）
    const modeMap: Record<string, DisplayMode> = {
      'fullpage-replace': 'replace',
      'fullpage-bilingual': 'bilingual',
    };
    // info.menuItemId 类型为 string | number，先收窄为 string 再查映射
    const mode = typeof info.menuItemId === 'string' ? modeMap[info.menuItemId] : undefined;
    if (!mode) return;
    // 空值守卫：devtools 等上下文下 tab / tab.id 可能缺失
    const tabId = tab?.id;
    if (tabId === undefined) return;
    const command: BackgroundCommand = { type: 'fullpage-translate', mode };
    // 经 tabs.sendMessage 下发给目标页 content script（t5 以 runtime.onMessage 消费）；
    // 接收端可能不存在（如 content script 未注入的页面），消化 reject 避免 SW 未处理 rejection
    browser.tabs.sendMessage(tabId, command).catch(() => {
      /* 无接收端，忽略 */
    });
  });

  // 菜单创建必须放在 onInstalled 内：仅安装/更新时执行一次，SW 重启不重复创建，
  // 否则 contextMenus.create 会因 duplicate id 报错。父项「全文翻译」+ 两个子项，contexts: ['page']。
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'fullpage',
      title: '全文翻译',
      contexts: ['page'],
    });
    browser.contextMenus.create({
      id: 'fullpage-replace',
      parentId: 'fullpage',
      title: '翻译此页（替换）',
      contexts: ['page'],
    });
    browser.contextMenus.create({
      id: 'fullpage-bilingual',
      parentId: 'fullpage',
      title: '翻译此页（双语对照）',
      contexts: ['page'],
    });
  });

  browser.runtime.onMessage.addListener(async (message: Message) => {
    try {
      switch (message.type) {
        case 'translate': {
          return await translateWithAdapter(message.payload);
        }
        case 'test-provider': {
          return await testWithAdapter(message.payload);
        }
        case 'get-settings': {
          return await getSettings();
        }
        case 'get-providers': {
          return await getProviders();
        }
        case 'get-translation-capabilities': {
          return await getTranslationCapabilities();
        }
        case 'get-active-sources': {
          return await getActiveSources();
        }
        case 'set-active-source': {
          await setActiveSource(message.payload.id);
          return { ok: true };
        }
        default:
          return { error: 'unknown message type' };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 流式翻译 port 长连接：content-script 经 browser.runtime.connect({name:'translate-stream'}) 建连
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === 'fullpage-translate-batch-stream') {
      let requestAccepted = false;
      let disconnected = false;
      let terminalSent = false;

      port.onDisconnect.addListener(() => {
        disconnected = true;
      });

      const disconnectOnce = () => {
        if (disconnected) return;
        disconnected = true;
        try {
          port.disconnect();
        } catch {
          // The peer can disappear between the state check and disconnect().
        }
      };

      const postMessage = (message: BatchStreamPortMessage): boolean => {
        if (disconnected) return false;
        try {
          port.postMessage(message);
          return true;
        } catch {
          disconnectOnce();
          return false;
        }
      };

      const finalize = (message: BatchStreamPortMessage) => {
        if (disconnected || terminalSent) return;
        terminalSent = true;
        if (postMessage(message)) disconnectOnce();
      };

      port.onMessage.addListener((msg: unknown) => {
        if (disconnected || requestAccepted || !isBatchStreamRequestMessage(msg)) return;
        requestAccepted = true;
        const { requestId, targetLang, chunks } = msg;

        translateBatchWithAdapterStream(
          { targetLang, chunks },
          (chunk) => {
            const message: BatchStreamPortMessage = { type: 'chunk', requestId, chunk };
            if (!postMessage(message)) {
              throw new Error('Batch translation port disconnected');
            }
          },
        )
          .then(
            (result) => {
              const message: BatchStreamPortMessage = result.error
                ? { type: 'error', requestId, result }
                : { type: 'done', requestId, missingChunkIds: result.missingChunkIds };
              finalize(message);
            },
            (err) => {
              const result: BatchTranslateResult = {
                missingChunkIds: chunks.map((chunk) => chunk.chunkId),
                error: err instanceof Error ? err.message : String(err),
                errorType: 'network',
              };
              finalize({ type: 'error', requestId, result });
            },
          );
      });
      return;
    }

    if (port.name !== 'translate-stream') return;

    port.onMessage.addListener((msg: StreamPortMessage) => {
      if (msg.type !== 'request') return;

      translateWithAdapterStream(
        { text: msg.text, targetLang: msg.targetLang, sourceLang: msg.sourceLang },
        (chunk) => {
          port.postMessage({ type: 'chunk', deltaText: chunk.deltaText });
        },
      )
        .then((result) => {
          if (result.error) {
            port.postMessage({ type: 'error', result });
          } else {
            port.postMessage({ type: 'done', result });
          }
          port.disconnect();
        })
        .catch((err) => {
          port.postMessage({
            type: 'error',
            result: {
              translatedText: '',
              error: err instanceof Error ? err.message : String(err),
              errorType: 'network',
            },
          });
          port.disconnect();
        });
    });
  });
});
