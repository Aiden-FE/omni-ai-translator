# MEMORY — Issue #25 LLM 翻译流式响应

| 项 | 内容 |
|---|---|
| Issue | #25 【AI】【全栈】LLM 翻译 - 流式响应 |
| PRD Issue | #24 [v0.2-6] LLM 翻译流式响应 llm-streaming |
| 版本 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| 类型 | 全栈（AI/前端/后端） |
| 基础分支 | master |
| MR 基线策略 | base-branch（直接从 master 创建 MR，无 stacked） |
| 并发安全等级 | parallel-safe |
| 上游依赖 | 无 |
| 推荐合并顺序 | 无（单任务单 MR） |
| 日期 | 2026-07-03 |

## PRD 摘要

为 LLM 翻译引入流式响应：划词翻译触发后，译文 token 边产生边渲染到浮层，用户即时看到翻译进展，不再干等完整响应。仅 LLM 源（openai-compatible / anthropic / ollama）流式；传统源（google / microsoft）保持非流式一次性返回。扩展功能事项 1 的 `TranslationProvider` 契约与 background↔content 消息层，不改既有非流式链路行为。

## 核心技术约束

1. **MV3 Service Worker 约束**：SW 会被回收，流式 port 连接需处理 SW 中断与清理；content-script 不直接 fetch，流式 fetch 仍在 background 内进行。
2. **流式 fetch**：MV3 background SW 支持 `fetch` + `response.body.getReader()` 读取流式响应。
3. **向后兼容**：`translateStream` 为可选方法，传统 provider 不实现（`undefined`）；既有 `translate(req)` 非流式契约保留。
4. **三协议流式解析**：
   - OpenAI 兼容 SSE：`stream:true`，解析 `choices[0].delta.content`，遇 `data: [DONE]` 结束
   - Anthropic SSE：`content_block_delta` 取 `delta.text`，`message_stop` 结束
   - Ollama NDJSON：`stream:true`，按行取 `message.content`
5. **port 协议（content↔background）**：
   - content → background：`{type:'request', text, targetLang, sourceLang}`
   - background → content：`{type:'chunk', deltaText}` / `{type:'done', result}` / `{type:'error', result}`
   - `port.onDisconnect` → 浮层清理（SW 回收归入 network 错误）

## 四类 ErrorType 错误模型

| errorType | 触发场景 | 归一化规则 |
|-----------|----------|------------|
| `no-config` | 未配置任何源或当前源未启用 | 适配层入口未匹配到 provider |
| `network` | fetch 抛异常、超时、SW 回收 | classifyError 无 HTTP 状态码时 fallback |
| `rate-limit` | 源返回 429 | classifyError status === 429 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | classifyError status >= 400 |

## UX 关键设计

- 流式进行中显示闪烁光标 `▋`（CSS animation），流结束移除（辅助视觉，非唯一状态指示）
- `aria-live="polite"` 通告译文进展，不打断用户当前任务
- 错误反馈含「❌」前缀，不依赖颜色
- 流式中断默认保留已渲染译文 + 追加错误提示行
- chunk 节流合批（requestAnimationFrame），避免高频重排
- 浮层沿用现有视觉：深色背景 `#1F2937` + 浅色文字 `#F9FAFB`，最大宽度 360px

## 验收标准

1. 三种 LLM 源浮层渐进渲染译文，首字早于完整响应 (P0)
2. 传统源一次性返回译文，行为与 v0.2 一致 (P0)
3. translate 流程经 port 推送 chunk，content 渐进渲染 (P0)
4. 流式中断归入四类 errorType，浮层差异化反馈 (P0)
5. v0.1/v0.2 划词翻译 e2e 全绿 (P0)
6. 长文本流式渲染无明显卡顿，节流合批 (P1)

## 不包含

- 流式中途取消（延后 v0.3+）
- 多源流式自动降级（v0.3+）
- 传统源流式（接口不支持）

## 现有代码结构

- `shared/types.ts`：TranslateRequest / TranslateResult / ProviderConfig / ErrorType / Message 类型
- `shared/translator/types.ts`：TranslationProvider 接口（translate + test）
- `shared/translator/llm-provider.ts`：callOpenAICompatible / callAnthropic / callOllama / createLLMProvider
- `shared/translator/index.ts`：translateWithAdapter / testWithAdapter / getActiveSources / setActiveSource
- `shared/translator/error.ts`：classifyError / errorFeedback / errorTypeMessage
- `shared/translator/registry.ts`：createProvider（按 category 路由 LLM/traditional）
- `entrypoints/background.ts`：onMessage 监听 translate/test-provider/settings/providers/active-sources
- `entrypoints/content.ts`：划词触发按钮 + 浮层 + sendMessage translate
- `assets/content.css`：浮层样式
- 测试：vitest 单元测试（shared/translator/__tests__/）、playwright e2e（e2e/translate.spec.ts + mock-server.ts）

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| 既有 sendMessage translate 路径 | 保留 sendMessage 用于 test-provider，新增 port 用于 translate-stream | PRD 7.2.3：连通性测试仍走 sendMessage，translate 流程改 port | 无 | 恢复 background.ts/content.ts 到 master |
| 流式中断部分译文处理 | 保留已渲染译文 + 追加错误提示行 | PRD 7.2.6 与 UX 章节明确「默认保留」 | 无 | 改为清除仅显示错误 |
| 端到端交付范围 | 单 MR 内全栈交付（provider 契约 + 三源流式 + port 消息层 + 浮层渐进渲染） | Issue #25 明确 parallel-safe + base-branch + 同一 MR 端到端交付 | 无 | 拆分为多 MR |
