# CHANGELOG — Issue #25 LLM 翻译流式响应

| 项 | 内容 |
|---|---|
| Issue | #25 |
| 版本 | v0.2 — 功能事项 6 |
| 日期 | 2026-07-03 |

## 新增功能

- **LLM 流式翻译**：三种 LLM 源（openai-compatible / anthropic / ollama）翻译时采用流式响应，译文 token 边产生边渲染到划词浮层，替代静态「翻译中…」文案
- **Provider 契约扩展**：`TranslationProvider` 新增可选 `translateStream(req, onChunk)` 方法 + `TranslateChunk` 类型，向后兼容（传统 provider 无需改动）
- **适配层流式入口**：`translateWithAdapterStream(req, onChunk)` — provider 支持流式时调流式方法，否则回退 `translate()` 吐单 chunk（非流式源对上层表现为「一次性流」）
- **Port 消息层**：translate 流程从 `chrome.runtime.sendMessage` 请求-响应改为 `chrome.runtime.Port` 长连接，background 监听 `translate-stream` 连接，经 port.postMessage 推送 chunk/done/error
- **浮层渐进渲染**：content-script 经 port 接收 chunk，渐进追加译文 + 闪烁光标 `▋`，done 移除光标定稿，error 保留已渲染译文 + 错误提示行
- **节流合批**：chunk 追加使用 requestAnimationFrame 合批，避免高频 DOM 重排
- **可访问性**：浮层容器设 `aria-live="polite"` 通告译文进展；错误反馈含「❌」前缀不依赖颜色；流式光标为辅助视觉非唯一状态指示

## 三源流式协议

| 源 | 流式格式 | delta 提取 | 结束信号 |
|---|---|---|---|
| OpenAI 兼容 | SSE (`data: {...}`) | `choices[0].delta.content` | `data: [DONE]` |
| Anthropic | SSE (`event:` + `data:`) | `content_block_delta` 事件 `delta.text` | `message_stop` 事件 |
| Ollama | NDJSON（每行 JSON） | `message.content` | `done: true` / 流关闭 |

## Bug 修复

无

## API 变更（API Changes）

- `TranslationProvider` 接口新增可选字段 `translateStream?(req, onChunk): Promise<TranslateResult>`
- `TranslateChunk` 新增类型：`{ deltaText: string }`
- `StreamPortMessage` 新增类型：port 消息契约（request / chunk / done / error）
- `translateWithAdapterStream(req, onChunk)` 新增导出函数
- 既有 `translate()` / `translateWithAdapter()` / `test()` / `testWithAdapter()` / `sendMessage` translate 路径保留不变

## 破坏性变更

无。所有新增均为可选字段或新函数，向后兼容。

## 部署注意事项

- 流式 fetch 使用 MV3 background SW 的 `fetch` + `response.body.getReader()`，SW 回收时 port 断开归入 network 错误
- 既有 e2e 测试已适配 port 流程，全部通过（6 e2e + 103 单元测试）
- 流式光标 CSS 动画无害，不影响非流式场景
