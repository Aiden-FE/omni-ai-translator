// Background Service Worker（MV3）
// 负责：接收翻译请求、读取配置、调用 LLM 适配层。
// 注意：SW 会被回收，状态不依赖内存，配置走 storage。

import { getProviders, getSettings } from '@/shared/storage';
import { translate, testProvider } from '@/shared/llm';
import type { Message } from '@/shared/types';

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    // 异步处理需返回 true 保持消息通道开启
    (async () => {
      try {
        switch (message.type) {
          case 'translate': {
            const settings = await getSettings();
            const providers = await getProviders();
            const provider = providers.find((p) => p.id === settings.activeProviderId);
            if (!provider) {
              sendResponse({ translatedText: '', error: '未配置或未启用 LLM 提供方' });
              return;
            }
            sendResponse(await translate(provider, message.payload));
            return;
          }
          case 'test-provider': {
            sendResponse(await testProvider(message.payload));
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
