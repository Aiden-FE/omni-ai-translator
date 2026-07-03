# PRD — Issue #22 LLM 适配层 anthropic 响应风格支持（研发任务）

| 项 | 内容 |
|---|---|
| ISSUE_ID | #22 |
| 文档类型 | 研发任务需求文档（引用 PRD Issue #6 的 PRD） |
| 版本 | v0.2 |
| 创建日期 | 2026-07-03 |
| 适用范围 | LLM Translator v0.2 功能事项 5 — 研发任务 #22 |
| 上游 PRD | [knowledges/product-wiki/releases/v0.2/5-llm-anthropic-style/PRD.md](../../../../../knowledges/product-wiki/releases/v0.2/5-llm-anthropic-style/PRD.md) |

## 1. 需求来源

本任务由 PRD Issue #6 驱动，完整 PRD 已由 prodflow-prd 落档于 `knowledges/product-wiki/releases/v0.2/5-llm-anthropic-style/PRD.md`。本文件引用该 PRD 并补充研发任务 #22 的实现范围与验收细化，不重写需求。

**PRD 核心目标**：在不影响既有 openai 风格源的前提下，让 LLM 适配层支持原生 Anthropic Messages API 端点，用户通过一个「响应风格」配置项即可切换。

## 2. 实现范围（来自 #22 + PRD）

### 2.1 后端 — 类型与适配层

- `shared/types.ts`：`ProviderConfig` 新增 `responseStyle?: 'openai' | 'anthropic'`（默认 openai，向后兼容，存量配置缺省按 openai）。
- `shared/translator/llm-provider.ts`：
  - `callOpenAICompatible` 内按 `provider.responseStyle` 分流，或拆出独立 `callAnthropic` 函数（设计阶段定，见 DESIGN.md）。
  - anthropic 风格请求构建：`x-api-key` 头 + `anthropic-version: 2023-06-01` + body 含 `max_tokens` + 顶层 `system` 承载翻译指令 + 原文作 user message + `temperature: 0.3`。
  - anthropic 风格响应解析：`data.content[0].text`。
  - 失败经 `classifyError` 归一化四类 errorType（429→rate-limit，4xx/5xx→unreachable，fetch 异常→network），不新增错误类型。

### 2.2 前端 — 配置页 UI

- `entrypoints/options/App.vue`：源卡片在类型为 `openai-compatible` 时展示响应风格单选（openai / anthropic，默认 openai）。
- 切换为 ollama / 传统源时隐藏并复位为 openai。
- 说明文案区分两种风格（openai=OpenAI 兼容端点；anthropic=原生 Anthropic Messages API 端点，如 Claude 官方）。
- 连通性测试复用 `test-provider` 通道，覆盖 anthropic 风格。

### 2.3 测试

- Vitest 单测覆盖 openai/anthropic 两条风格路径（请求构建 + 响应解析 + 错误归类）。
- Playwright e2e 扩展 mock server 新增 Anthropic `/v1/messages` 路由，验证 anthropic 风格划词翻译 + 连通性测试。
- openai 风格回归用例不退化。

## 3. 不包含

| 功能 | 延后原因 | 预计版本 |
|---|---|---|
| anthropic 流式响应（streaming） | 增量复杂度，非首版必需 | v0.3+ |
| 其他厂商原生协议 | 按需扩展 | v0.3+ |
| 自动协议探测（免用户选风格） | 增加误判风险，显式选择更可控 | 不规划 |
| 隐私声明更新 | 发布前产物，不在 #22 代码范围 | 发布前 |

## 4. 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 类型扩展 | `ProviderConfig.responseStyle` 新增，默认 openai，向后兼容（存量配置无该字段时按 openai） | P0 |
| openai 风格回归 | 既有 openai 风格维持现状，连通性测试 + 划词翻译 e2e 不退化 | P0 |
| anthropic 风格请求 | x-api-key + anthropic-version: 2023-06-01 + max_tokens + 顶层 system + 原文作 user message，单测覆盖 | P0 |
| anthropic 风格响应 | 解析 `data.content[0].text`，单测覆盖 | P0 |
| anthropic 错误归类 | 429→rate-limit，4xx/5xx→unreachable，fetch 异常→network，不新增错误类型，单测覆盖 | P0 |
| 配置页 UI | OpenAI 兼容类型展示响应风格单选，默认 openai，切换类型复位为 openai，说明文案明确 | P0 |
| anthropic e2e | mock 路由划词翻译 + 连通性测试通过 | P0 |
| 可访问性 | 单选键盘可达、label 关联、对比度满足 WCAG AA | P0 |
| 可选真实联调 | 真实 Anthropic 端点 + anthropic 风格连通性测试与划词翻译正常（无真实 Key 时用 mock，不阻塞） | P1 |

## 5. 无人值守澄清结论

以下细节在 PRD/Issue 中未完全显式，按无人值守默认决策策略推断并留痕：

1. **max_tokens 值**：Anthropic Messages API 必填字段，采用 1024 作为默认值（翻译场景译文长度有限，足够且不过大）。
2. **callAnthropic 实现位置**：拆出独立 `callAnthropic` 函数，由 `createLLMProvider` 在 openai-compatible 类型下按 responseStyle 路由（openai→callOpenAICompatible，anthropic→callAnthropic）。理由：独立函数更清晰、可独立单测，符合 ADR-001 工厂函数风格。
3. **apiKey 缺失时 anthropic 行为**：仍发请求（不带 x-api-key 头），由端点返回 401→classifyError 归类为 unreachable。与 openai 风格 apiKey 可选行为一致，不擅自新增 no-config 错误类型。
4. **responseStyle 复位时机**：在 `onTypeChange` 中，当类型从 openai-compatible 切换为其它类型时，将 responseStyle 复位为 openai（避免残留无效风格）。
