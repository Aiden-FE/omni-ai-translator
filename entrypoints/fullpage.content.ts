// Content Script — 全文翻译
// 独立 content script 入口（WXT 支持多 content script）：与 entrypoints/content.ts（划词翻译）
// 各自独立注入、互不干扰、无共享运行时状态。
// 只负责接收 background 命令（右键菜单「全文翻译」经 tabs.sendMessage 下发）并调用编排器；
// 全部翻译状态在 shared/fullpage/orchestrator（唯一状态持有者）。

import { isBackgroundCommand, start } from '@/shared/fullpage/orchestrator';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((msg: unknown) => {
      // unknown + 类型守卫：只消费 fullpage-translate 命令，其余消息（如划词通道）忽略
      if (isBackgroundCommand(msg)) {
        start(msg.mode).catch((err: unknown) => {
          // 启动失败（如存储读取异常/非常规 DOM）：content script 无用户反馈通道，
          // 仅告警不阻断宿主页面（错误不含 API Key——Key 只存 background 侧存储）
          console.warn('[llm-translator] fullpage translate start failed', err);
        });
      }
    });
  },
});
