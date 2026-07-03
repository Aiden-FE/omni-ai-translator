# PRD — LLM 翻译流式响应（Issue #25 开发任务）

| 项 | 内容 |
|---|---|
| 文档类型 | 开发任务需求文档（引用 PRD Issue #24） |
| Issue | #25 【AI】【全栈】LLM 翻译 - 流式响应 |
| PRD Issue | #24 [v0.2-6] LLM 翻译流式响应 llm-streaming |
| 版本 | v0.2 — 功能事项 6 |
| 状态 | confirmed（无人值守自动批准） |
| 日期 | 2026-07-03 |

## 需求来源

PRD Issue #24 已落档完整 PRD（`knowledges/product-wiki/releases/v0.2/6-llm-streaming/PRD.md`），包含 8 段结构 + UX 设计章节。开发任务 #25 从该 PRD 拆出，为全栈端到端交付。本文件引用 PRD 关键内容并补充开发澄清。

## 需求摘要

LLM 翻译引入流式响应：译文 token 边产生边渲染到划词浮层，替代静态「翻译中…」。仅 LLM 源流式；传统源经适配层「一次性流」回退，行为不变。

## 开发范围（Issue #25 → PRD 对齐）

1. **Provider 契约扩展**：`TranslationProvider` 新增可选 `translateStream(req, onChunk)` + `TranslateChunk` 类型（向后兼容，传统 provider 无需改动）
2. **三源流式实现**：OpenAI SSE / Anthropic SSE / Ollama NDJSON
3. **适配层流式入口**：`translateWithAdapterStream(req, onChunk)`，provider 不支持流式时回退 `translate()` 吐单 chunk
4. **消息层 Port 化**：background 监听 `translate-stream` port 连接，经 `port.postMessage` 推送 chunk/done/error
5. **浮层渐进渲染**：content 改 port 建连，onMessage 渐进追加译文 + 闪烁光标，done 定稿，error 保留译文 + 错误行
6. **单元测试 + e2e**：SSE/NDJSON 解析、delta 累加、错误归类、回退分支、流式渲染、中断反馈、传统源回归

## port 协议契约

- content → background：`{type:'request', text, targetLang, sourceLang}`
- background → content：`{type:'chunk', deltaText}` / `{type:'done', result}` / `{type:'error', result}`
- `port.onDisconnect` → 浮层清理（SW 回收归入 network 错误）

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| LLM 流式 | 三种 LLM 源翻译时浮层渐进渲染译文，首字早于完整响应 | P0 |
| 非流式回退 | 传统源一次性返回译文，行为与 v0.2 一致 | P0 |
| 消息层 port 化 | translate 流程经 port 推送 chunk，content 渐进渲染 | P0 |
| 错误归类 | 流式中断归入四类 errorType，浮层差异化反馈 | P0 |
| 划词回归 | v0.1/v0.2 划词翻译 e2e 全绿 | P0 |
| 性能 | 长文本流式渲染无明显卡顿（节流合批） | P1 |

## UX 验收补充

- 流式光标流式进行中显示、定稿移除
- 错误反馈含「❌」前缀不依赖颜色
- 流式译文进展有 aria-live 通告；对比度满足 WCAG AA

## 不包含

- 流式中途取消（v0.3+）
- 多源流式自动降级（v0.3+）
- 传统源流式（接口不支持）
