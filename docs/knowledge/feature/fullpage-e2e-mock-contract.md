---
id: feature:fullpage:e2e-mock-contract
type: feature
status: active
owner: project
updated: 2026-08-03
confidence: 0.9
sources:
  - e2e/mock-server.ts
  - e2e/fullpage.spec.ts
related:
  - runbook:e2e:fullpage-trigger-assertions
  - feature:fullpage:orchestrator
  - feature:fullpage:segmenter-pool
  - context:system:tech-stack
---

# 全文翻译 e2e mock server 契约（v0.4.0）

> 以 `e2e/mock-server.ts` 当前代码为准。v0.4.0 为全文翻译 e2e 在既有 mock server 上扩展三类断言能力：按路由请求计数、按请求体标记的失败开关、非流式可观测延迟。既有导出与路由行为不变，划词翻译 e2e（`translate.spec.ts`）零回归。

## mock server 基线（既有契约，不变）

- 模拟四路由：OpenAI 兼容 `POST /v1/chat/completions`、Anthropic `POST /v1/messages`、Ollama `POST /api/chat`、微软 `POST /translate`；另有 `GET /health` 健康检查。
- 流式分支：`stream: true` 时返回 SSE（OpenAI/Anthropic）或 NDJSON（Ollama），固定译文「你好,世界」按字符拆 chunk，`CHUNK_DELAY_MS = 100`。
- 既有导出：`startMockServer()`（随机端口 `127.0.0.1`）、`getLastRequestBody()`、`getLastRequestHeaders()`。

## v0.4.0 新增导出契约

| 导出 | 签名 | 语义 |
|---|---|---|
| `NONSTREAM_DELAY_MS` | `const = 300` | 非流式**成功**响应统一 300ms 可观测延迟（四路由一致），使「先译完的段落先渲染」可被相对时序断言捕获 |
| `getRequestCount` | `(route?: string) => number` | 按路由（pathname，去 query）累计请求数；传 pathname（如 `/v1/chat/completions`）返回该路由计数，无参返回总数 |
| `resetRequestCount` | `() => void` | 清空计数（用例间隔离） |
| `setFailMode` | `(on: boolean) => void` | 失败开关：开启后 OpenAI 兼容路由**仅对请求体含 `__FAIL__` 子串的请求返回 500**（快速失败，无延迟） |

### 计数语义

- 计数 key：`req.url` 去 query 的 pathname；在请求体解析后、路由分发前统一累计。
- **含失败请求**：`__FAIL__` 触发的 500 也计数——缓存复用 / 免重译断言的语义是「未发起新请求」，与成功失败无关。
- 配合 `waitForSettled`（见 `runbook:e2e:fullpage-trigger-assertions`）在计数断言前确保全部请求落盘。

### 失败开关语义：部分失败隔离

- 决策：按请求内容匹配 `__FAIL__` 子串返回 500，而**非全局 500**。全局 500 会使 fixture 的 `__FAIL__` 文本标记失去意义，且无法验证「部分失败隔离」——失败重试用例中只有 `__FAIL__` 段失败（保留原文 + 失败徽标 + 重试按钮计数 1），其余段正常译出。
- 500 立即返回、不加 300ms 延迟：失败路径与渐进渲染无关，快速失败让失败用例更快、失败徽标更早出现。
- fixture 侧契约：测试页 `e2e/fixtures/fullpage-test-page.html` 的 `#para-fail` 段纯文本含 `__FAIL__`，经 prompt 原样进入请求体（下划线无需 JSON 转义），mock 按子串匹配。

### 延迟语义

- 300ms 只加在非流式成功响应（OpenAI/Anthropic/Ollama/microsoft 四路由统一的响应前 `await sleep(NONSTREAM_DELAY_MS)`）；流式分支不动。
- 与并发池 `concurrency=3` 配合形成 300ms 批次间隔，支撑渐进渲染相对时序断言（见 `runbook:e2e:fullpage-trigger-assertions`）。
- 既有用例兼容：`translate.spec.ts` 超时 15s 完全容纳 300ms，零回归（实测 7 用例全绿）。

## 模块状态共享与复位约定（关键）

Playwright `workers=1` 时单 worker 进程内 Node 模块缓存共享：`fullpage.spec.ts` 与 `translate.spec.ts` 的 mock-server 模块级状态（`requestCounts` / `failMode`）**跨 spec 文件互通**。强制约定：

- `beforeEach` 调 `resetRequestCount()` —— 计数断言与执行顺序 / 其它文件解耦；
- `afterEach` 调 `setFailMode(false)` —— 失败开关用后必须复位，防泄漏到后续用例。

## 用例消费映射（fullpage.spec.ts）

| 能力 | 消费用例 | 断言方式 |
|---|---|---|
| 300ms 延迟 | 用例 1 渐进渲染 | 相对时序：`#para-1` 译出时 `#para-4` 仍原文 |
| 请求计数 | 用例 3 切换模式 | replace→bilingual DOM 翻转且 `getRequestCount(CHAT_ROUTE)` 不变（免重译） |
| 请求计数 | 用例 6 增量翻译 | 新段译出后计数恰好 +1 |
| 请求计数 | 用例 7 缓存复用 | 恢复后再触发 0 新请求（首触发 9 请求） |
| 失败开关 | 用例 5 失败重试 | `__FAIL__` 段保留原文 + ⚠ 徽标 + 重试按钮；复位后重试译出 |

测试页段清单（9 段，jsdom + collectSegments 实测固化）：3 nav 行内链接 + 4 正文块级段（含 `#para-fail`）+ footer + `#add-paragraph` 按钮；`INITIAL_REQUEST_COUNT = 9`。

## 复用场景

后续 e2e 需要构造以下场景时复用同一 mock 契约，勿另起平行实现：

- **部分失败**：文本中嵌入 `__FAIL__` 标记 + `setFailMode(true)`，用后复位；
- **缓存复用 / 免重译**：`getRequestCount(route)` 前后差值断言「零新请求」；
- **渐进时序**：依赖 `NONSTREAM_DELAY_MS` 的批次间隔做相对时序断言；
- 新增路由时沿用「计数含失败请求、延迟只加成功响应」两条既有语义，保持契约一致。

## 安全约束

e2e 不配置真实 API Key；mock 不记录 / 不输出任何凭证（沿用既有约束，见 `AGENTS.md` 开发约定）。

## 来源证据

- `e2e/mock-server.ts`：`NONSTREAM_DELAY_MS = 300` 及四路由响应前 sleep、`requestCounts` Map 与 `getRequestCount` / `resetRequestCount`（含失败请求计数注释）、`setFailMode` 与 `__FAIL__` 子串 500 分支（快速失败无延迟）、既有流式分支未改动。
- `e2e/fullpage.spec.ts`：`beforeEach resetRequestCount` / `afterEach setFailMode(false)` 复位约定、`INITIAL_REQUEST_COUNT = 9`、用例 3/6/7 计数断言与用例 5 失败隔离断言。
- `docs/iterations/v0.4.0/tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md`：§2.1 失败开关语义决策（否决全局 500）、§2.2 延迟只加成功响应、§2.5 跨文件共享模块状态对策、§3.1 数据契约表。
