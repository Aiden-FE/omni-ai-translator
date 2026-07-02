// Background Service Worker（MV3）
// 负责：接收翻译请求、经适配层统一入口调用翻译、管理配置。
// 注意：SW 会被回收，状态不依赖内存，配置走 storage。
// 本文件不含源类型 if-else 分支，所有源类型路由由适配层（shared/translator）处理。

import { getProviders, getSettings } from '@/shared/storage';
import { translateWithAdapter, testWithAdapter } from '@/shared/translator';
import type { Message } from '@/shared/types';

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
          default:
            sendResponse({ error: 'unknown message type' });
        }
      } catch (err) {
        sendResponse({ error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });
});
