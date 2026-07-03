# PLAN — LLM 翻译流式响应执行计划

| 项 | 内容 |
|---|---|
| Issue | #25 |
| 版本 | v0.2 — 功能事项 6 |
| 状态 | approved（无人值守自动批准） |
| 日期 | 2026-07-03 |

## 任务拆解

### Phase 1: 类型与契约扩展

- [x] 1.1 `shared/types.ts`：新增 `TranslateChunk` 接口 + `StreamPortMessage` 类型（port 消息契约） [P0, 低]
- [x] 1.2 `shared/translator/types.ts`：`TranslationProvider` 新增可选 `translateStream?(req, onChunk): Promise<TranslateResult>` [P0, 低]

### Phase 2: LLM 流式实现

- [x] 2.1 `shared/translator/llm-provider.ts`：新增 `callOpenAICompatibleStream` — body 加 `stream:true`，SSE 解析 `data:` 行取 `choices[0].delta.content`，遇 `[DONE]` 结束，累加 delta [P0, 中]
- [x] 2.2 `shared/translator/llm-provider.ts`：新增 `callAnthropicStream` — body 加 `stream:true`，SSE 解析 `content_block_delta` 事件取 `delta.text`，`message_stop` 结束，累加 delta [P0, 中]
- [x] 2.3 `shared/translator/llm-provider.ts`：新增 `callOllamaStream` — body 改 `stream:true`，NDJSON 按行取 `message.content`，流结束，累加 delta [P0, 中]
- [x] 2.4 `shared/translator/llm-provider.ts`：`createLLMProvider` 增加 `translateStream` 实现，路由到三个流式变体，错误经 `classifyError` 归类 [P0, 中]

### Phase 3: 适配层流式入口

- [x] 3.1 `shared/translator/index.ts`：新增 `translateWithAdapterStream(req, onChunk)` — 读取生效源、创建 provider、provider 有 translateStream 则调流式、否则回退 translate() 吐单 chunk [P0, 中]

### Phase 4: Port 消息层

- [x] 4.1 `entrypoints/background.ts`：新增 `chrome.runtime.onConnect` 监听 `translate-stream`，调 `translateWithAdapterStream`，经 port.postMessage 推送 chunk/done/error，完成或出错时 port.disconnect() [P0, 中]
- [x] 4.2 保留既有 `sendMessage` translate 路径用于 test-provider（不变） [P0, 低]

### Phase 5: 浮层渐进渲染

- [x] 5.1 `entrypoints/content.ts`：`doTranslate` 改 `chrome.runtime.connect({name:'translate-stream'})` 建连，发送 request 消息 [P0, 中]
- [x] 5.2 `entrypoints/content.ts`：`port.onMessage` 监听 — `chunk` 渐进追加译文 + 闪烁光标 `▋`；`done` 移除光标定稿；`error` 保留已渲染译文 + 错误行（复用 errorFeedback） [P0, 高]
- [x] 5.3 `entrypoints/content.ts`：chunk 节流合批（requestAnimationFrame），一帧内多 chunk 合并为一次 DOM 更新 [P1, 中]
- [x] 5.4 `entrypoints/content.ts`：`port.onDisconnect` 清理浮层态（SW 回收归入 network 错误反馈） [P0, 中]
- [x] 5.5 `entrypoints/content.ts`：浮层容器设 `aria-live="polite"` 通告译文进展 [P0, 低]
- [x] 5.6 `assets/content.css`：新增流式光标 `▋` CSS animation 样式 [P0, 低]

### Phase 6: 单元测试

- [x] 6.1 `shared/translator/__tests__/llm-provider.test.ts`：OpenAI SSE 流式解析 — 多 chunk delta 累加、`[DONE]` 结束、空 delta 行跳过 [P0, 中]
- [x] 6.2 `shared/translator/__tests__/llm-provider.test.ts`：Anthropic SSE 流式解析 — `content_block_delta` 取 delta.text、`message_stop` 结束 [P0, 中]
- [x] 6.3 `shared/translator/__tests__/llm-provider.test.ts`：Ollama NDJSON 流式解析 — 按行取 message.content、流结束 [P0, 中]
- [x] 6.4 `shared/translator/__tests__/llm-provider.test.ts`：流式错误归类 — 非 2xx 状态码、fetch 异常、流中断归入四类 errorType [P0, 中]
- [x] 6.5 `shared/translator/__tests__/adapter.test.ts`：`translateWithAdapterStream` 回退分支 — 传统源（无 translateStream）回退 translate() 吐单 chunk [P0, 中]
- [x] 6.6 `shared/translator/__tests__/adapter.test.ts`：`translateWithAdapterStream` 流式分支 — LLM 源调 translateStream 逐 chunk 推送 [P0, 中]
- [x] 6.7 `shared/translator/__tests__/adapter.test.ts`：`translateWithAdapterStream` no-config — 无可用源返回 errorType，不调 onChunk [P0, 低]

### Phase 7: E2E 测试

- [x] 7.1 `e2e/mock-server.ts`：新增 SSE 流式端点（OpenAI /chat/completions + Anthropic /v1/messages）和 NDJSON 流式端点（Ollama /api/chat），逐 chunk 返回 [P0, 中]
- [x] 7.2 `e2e/translate.spec.ts`：流式渲染测试 — OpenAI 源划词翻译浮层渐进渲染译文，最终显示完整译文 [P0, 中]
- [x] 7.3 `e2e/translate.spec.ts`：传统源回归 — microsoft 源划词翻译一次性返回译文，行为与 v0.2 一致 [P0, 中]
- [x] 7.4 `e2e/translate.spec.ts`：既有测试回归 — 现有 e2e 用例适配 port 流程后全绿 [P0, 高]

### Phase 8: 构建与校验

- [x] 8.1 运行 `pnpm typecheck` 确保类型无误 [P0, 低]
- [x] 8.2 运行 `pnpm test` 确保单元测试全绿 [P0, 低]
- [x] 8.3 运行 `pnpm lint` 确保代码规范 [P0, 低]
