// Background Service Worker（MV3）
// 负责：接收翻译请求、经适配层统一入口调用翻译、管理配置。
// 注意：SW 会被回收，状态不依赖内存，配置走 storage。
// 本文件不含源类型 if-else 分支，所有源类型路由由适配层（shared/translator）处理。

import { getProviders, getSettings } from '@/shared/storage';
import {
  translateWithAdapter,
  translateWithAdapterStream,
  testWithAdapter,
  getActiveSources,
  setActiveSource,
} from '@/shared/translator';
import type { Message, StreamPortMessage } from '@/shared/types';

export default defineBackground(() => {
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
