# LLM 翻译流式响应采用 Port 长连接 + ReadableStream

v0.2 功能事项 6 为 LLM 翻译引入流式响应。content↔background 的 translate 流程从 `chrome.runtime.sendMessage` 请求-响应改为 `chrome.runtime.Port` 长连接；background 用 `fetch` + `response.body.getReader()` 读取 SSE/NDJSON 流，逐 chunk 经 `port.postMessage` 推送，content 渐进渲染。`TranslationProvider` 契约新增可选 `translateStream(req, onChunk)`，传统源不实现、由适配层 `translateWithAdapterStream` 回退 `translate()` 吐单 chunk（「一次性流」），非流式链路行为不变。

**状态**: accepted

**考虑过的选项**:

content↔background 流式通道：

| 方案 | 描述 | 结论 |
|------|------|------|
| A. Port 长连接 + ReadableStream | content↔background 改 `chrome.runtime.Port`，background 用 `fetch` + `getReader()` 读流，逐 chunk 经 port 推送 | 采用 — 原生 MV3 能力，无第三方依赖，支持双向通信与断连检测 |
| B. 保留 sendMessage + 分块响应 | 多次 `sendMessage` 推送 chunk | 否决 — sendMessage 是请求-响应模型，不适合持续推送，无法检测断连 |
| C. content 直接 fetch 流式 | content-script 直接读流 | 否决 — 违反架构约束（content 不直接 fetch 第三方接口），CORS 问题 |

流式解析统一为「按行读取 → JSON.parse → 提取 delta」模式，三源差异仅在 delta 字段路径与结束信号：

| 源 | 流格式 | delta 提取 | 结束信号 |
|---|---|---|---|
| OpenAI 兼容 | SSE (`data: {...}`) | `choices[0].delta.content` | `data: [DONE]` |
| Anthropic | SSE (`event:` + `data:`) | `content_block_delta` 事件 `delta.text` | `message_stop` 事件 |
| Ollama | NDJSON（每行 JSON） | `message.content` | 流关闭（reader done） |

provider 契约用可选 `translateStream` 而非新增独立流式接口：传统源（google/microsoft）接口不支持流式，可选字段使其无需任何改动即可被适配层以「一次性流」回退，保持 `translate()` / `test()` 非流式契约不变。

**后果**:

- translate 流程改走 port（`translate-stream`），但 `sendMessage` translate 路径保留作连通性测试 `test-provider` 兼容，未整体移除。
- `port.onDisconnect` 是 SW 回收等异常路径的清理点，归入 `network` errorType；不保证断点续传。
- `translateStream` 为可选方法，新增 provider 默认无需实现；LLM 源实现时须自行累加 delta 得到完整 `translatedText` 填入最终 `TranslateResult`。
- chunk 追加须节流合批（`requestAnimationFrame`），否则高频 delta 引起浮层重排卡顿。
- 回滚方式：删除 `translateStream` / `TranslateChunk` / `translateWithAdapterStream`，恢复 `background.ts` / `content.ts` 到 master 版本，CSS 光标样式无害可保留。
