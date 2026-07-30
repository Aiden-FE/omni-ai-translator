---
id: adr:002-llm-streaming-port-and-readablestream
type: adr
status: active
owner: project
updated: 2026-07-30
confidence: 0.8
sources:
  - entrypoints/background.ts
  - entrypoints/content.ts
  - shared/translator/index.ts
  - shared/types.ts
  - knowledges/adr/002-llm-streaming-port-and-readablestream.md
related:
  - context:system:plugin-architecture
  - feature:translator:unified-adapter
---

# ADR-002 LLM 流式响应采用 Port 长连接 + ReadableStream（初始化草稿）

**状态**：accepted

## 背景

v0.2 为 LLM 翻译引入流式响应。content↔background 的 translate 流程从 `sendMessage` 请求-响应改为 `chrome.runtime.Port` 长连接。

## 决策

background 用 `fetch` + `response.body.getReader()` 读取 SSE/NDJSON 流，逐 chunk 经 `port.postMessage` 推送，content 渐进渲染。`TranslationProvider` 契约新增可选 `translateStream(req, onChunk)`；传统源不实现，由适配层 `translateWithAdapterStream` 回退 `translate()` 吐单 chunk（「一次性流」），非流式链路行为不变。

## 考虑过的选项

| 方案 | 结论 |
|------|------|
| A. Port 长连接 + ReadableStream | 采用 — 原生 MV3 能力，无第三方依赖，支持双向通信与断连检测 |
| B. sendMessage + 分块响应 | 否决 — 请求-响应模型不适合持续推送，无法检测断连 |
| C. content 直接 fetch 流式 | 否决 — 违反架构约束（content 不直接 fetch 第三方），CORS 问题 |

## 流式解析（按行 → JSON.parse → 提取 delta）

| 源 | 流格式 | delta 提取 | 结束信号 |
|---|---|---|---|
| OpenAI 兼容 | SSE (`data: {...}`) | `choices[0].delta.content` | `data: [DONE]` |
| Anthropic | SSE (`event:` + `data:`) | `content_block_delta` 的 `delta.text` | `message_stop` |
| Ollama | NDJSON | `message.content` | reader done |

## 后果

- translate 流程改走 port（`translate-stream`），`sendMessage` 的 `test-provider` 路径保留作连通性测试。
- `port.onDisconnect` 是 SW 回收等异常路径清理点，归入 `network` errorType；不保证断点续传。
- chunk 追加须节流合批（`requestAnimationFrame`），否则高频 delta 引起浮层重排卡顿。

## 来源证据

- `entrypoints/background.ts`：`onConnect` 监听 `translate-stream`，调 `translateWithAdapterStream` 并 `postMessage` chunk/done/error。
- `shared/types.ts`：`StreamPortMessage`（request / chunk / done / error）与 `TranslateChunk`。
- `shared/translator/index.ts`：`translateWithAdapterStream` 对无 `translateStream` 的源回退单 chunk。
