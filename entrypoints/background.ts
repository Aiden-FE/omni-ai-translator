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
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    // 异步处理需返回 true 保持消息通道开启
    (async () => {
      try {
        switch (message.type) {
          case 'translate': {
            sendResponse(await translateWithAdapter(message.payload));
            return;
          }
          case 'test-provider': {
            sendResponse(await testWithAdapter(message.payload));
            return;
          }
          case 'get-settings': {
            sendResponse(await getSettings());
            return;
          }
          case 'get-providers': {
            sendResponse(await getProviders());
            return;
          }
          case 'get-active-sources': {
            sendResponse(await getActiveSources());
            return;
          }
          case 'set-active-source': {
            await setActiveSource(message.payload.id);
            sendResponse({ ok: true });
            return;
          }
          default:
            sendResponse({ error: 'unknown message type' });
        }
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });

  // 流式翻译 port 长连接：content-script 经 chrome.runtime.connect({name:'translate-stream'}) 建连
  chrome.runtime.onConnect.addListener((port) => {
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
