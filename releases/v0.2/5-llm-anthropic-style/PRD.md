# PRD — LLM 适配层 anthropic 响应风格支持（5-llm-anthropic-style）

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（PRD） |
| 状态 | draft |
| 负责人 |  |
| 创建日期 | 2026-07-03 |
| 最近更新 | 2026-07-03 |
| 适用范围 | LLM Translator v0.2 — 功能事项 5（新增，Issue #6 驱动） |
| 关联材料 | [../../../knowledges/startup-summary.md](../../../knowledges/startup-summary.md)、[../../../knowledges/product-wiki/strategy/index.md](../../../knowledges/product-wiki/strategy/index.md)、[../../../knowledges/product-wiki/roadmap/index.md](../../../knowledges/product-wiki/roadmap/index.md)、[../index.md](../index.md)、[../1-unified-adapter/PRD.md](../1-unified-adapter/PRD.md)、[../../../knowledges/adr/001-unified-translator-adapter-layer.md](../../../knowledges/adr/001-unified-translator-adapter-layer.md) |

---

## 1. 摘要

本 PRD 为 LLM Translator 的 LLM 适配层新增「响应风格」维度：在 `ProviderConfig` 上增加可选字段 `responseStyle: 'openai' | 'anthropic'`（默认 `openai`，向后兼容），使原生 Anthropic Messages API 端点（Claude 官方端点或 Anthropic 兼容代理）可作为 OpenAI 兼容源的一种风格直接配置使用，按风格切换请求构建与响应解析路径。这是 v0.2「翻译源配置闭环」的增量改进，不改变既有 openai 风格行为，不影响传统源与免 Key 兜底源。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 / 负责人 | 待定 | 增量改进，由 prodflow-prd 推进 |
| 研发（前端/扩展） | 待定 | MV3 + WXT + Vue 3 + TS |
| UX | 待定 | 复用现有配置页设计系统，无新视觉原型 |

## 3. 背景

v0.2 已建立统一翻译源适配层（功能事项 1，[ADR-001](../../../knowledges/adr/001-unified-translator-adapter-layer.md)）：LLM 类源（`openai-compatible` / `ollama`）经 `shared/translator/llm-provider.ts` 的 `createLLMProvider` 接入，`callOpenAICompatible` 按 OpenAI Chat Completions 格式构建请求（`Authorization: Bearer`、`messages` 数组）并解析 `data.choices[0].message.content`。`shared/llm.ts` 已降级为 `@deprecated` 兼容层，内部委托适配层。

但部分用户希望使用原生 Anthropic Messages API 端点（如直连 Claude 官方 `https://api.anthropic.com/v1/messages`，或自建的 Anthropic 兼容代理）。现有适配层只有 OpenAI 一种请求/响应格式，无法对接：请求按 OpenAI body 发出、响应按 OpenAI 结构解析，均失败。用户只能通过中间转换代理（把 Anthropic 端点包装成 OpenAI 兼容接口）间接使用，门槛高。

**为什么现在做**：v0.2 适配层已把 LLM 调用收敛到 `createLLMProvider` → `callOpenAICompatible` 单一路径，在此处按风格分流成本最低；[#5](https://github.com/Aiden-FE/llm-translator/issues/5)（baseUrl 不再追加固定 path）已修复并合并，用户可填完整端点路径，为直连 Anthropic 端点扫清了 URL 障碍。

## 4. 目标

**目标**：在不影响既有 openai 风格源的前提下，让 LLM 适配层支持原生 Anthropic Messages API 端点，用户通过一个「响应风格」配置项即可切换。

**对齐愿景**：产品策略中「模型无关的适配层设计，新模型快速接入」是核心防御性能力。Anthropic 是主流 LLM 之一，支持其原生协议是适配层扩展能力的直接体现。

**关键结果（SMART）**：

| 编号 | 关键结果 | 衡量方式 |
|---|---|---|
| KR1 | `ProviderConfig` 新增 `responseStyle: 'openai' \| 'anthropic'`，默认 `openai`，存量配置缺省按 openai 处理 | 类型定义 + 单元测试 |
| KR2 | `callOpenAICompatible` 路径按 `responseStyle` 分流；anthropic 风格用 `x-api-key` + `anthropic-version` 头、`max_tokens` + 顶层 `system` 的 body、解析 `data.content[0].text` | 单元测试覆盖两条风格路径 |
| KR3 | 配置页源卡片在类型为 OpenAI 兼容时展示响应风格单选（openai / anthropic，默认 openai）；Ollama 不展示 | 配置页审查 + e2e |
| KR4 | 配置真实 Anthropic 端点 + anthropic 风格，连通性测试与划词翻译均正常 | e2e（mock 路由 + 可选真实端点联调） |
| KR5 | 既有 openai 风格源回归通过（连通性测试 + 划词翻译 e2e 不退化） | e2e 回归全绿 |

## 5. 细分市场

本 PRD 服务于既有「技术用户 / 开发者」群体中偏好 Anthropic 原生协议的子集：

- **自带 Key 的技术用户**（待完成任务：用 Claude 官方端点或自建 Anthropic 兼容代理翻译）：现状要求他们额外部署 OpenAI 兼容转换代理，门槛高；本 PRD 让他们直接填端点 + Key + 选 anthropic 风格即可用。
- **普通阅读用户**：不受益（默认走免 Key 兜底源），本 PRD 不影响其开箱即用体验。

**约束**：

- MV3 Service Worker 无状态，配置走 `chrome.storage.local`，`responseStyle` 作为 `ProviderConfig` 可选字段持久化。
- Anthropic 端点跨域请求需在 manifest `host_permissions` 声明（动态源域名，沿用现有动态 host 处理，不硬编码厂商域名）。
- content-script 不直接 fetch，翻译统一由 background 调适配层。

## 6. 价值主张

| 客户任务 / 需求 | 客户获得 | 客户避免的痛点 | 我们做得更好的地方 |
|---|---|---|---|
| 想用原生 Anthropic 端点翻译 | 直接配置端点 + Key + 选风格即可 | 自建 OpenAI 兼容转换代理的运维负担 | 适配层内建风格分流，无需外部组件 |
| 想让适配层支持更多原生协议 | 风格维度可扩展，新增协议成本低 | 每加一种协议就要改上层 | 风格切换收敛在 LLM provider 内部，上层无感 |

## 7. 解决方案

### 7.1 UX / 原型

本 PRD 在配置页源卡片内新增一个「响应风格」单选，无独立新界面，沿用现有配置页设计系统（见 [knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)「提供方卡片」、输入框/单选样式）。不单独产出视觉原型；UI 差异仅体现为源卡片内条件渲染一组单选按钮。详见下文「UX 设计」章节。

### 7.2 核心功能

**7.2.1 ProviderConfig 扩展**

`shared/types.ts` 的 `ProviderConfig` 新增可选字段：

- `responseStyle?: 'openai' | 'anthropic'` — 仅对 LLM 类（`openai-compatible`）有意义；缺省时按 `'openai'` 处理（向后兼容，存量配置无需迁移）。
- `ollama` 类型固定走 `callOllama`（OpenAI 兼容路径的 Ollama 变体），不受 `responseStyle` 影响。
- `google` / `microsoft` 传统源不受 `responseStyle` 影响。

**7.2.2 LLM provider 风格分流**

`shared/translator/llm-provider.ts` 的 `callOpenAICompatible` 内按 `provider.responseStyle` 分流（或拆出独立 `callAnthropic` 函数，由设计阶段定）：

- **openai 风格**（默认，维持现状）：`Authorization: Bearer <apiKey>`、body `{ model, messages: [{role:'user', content: buildPrompt(...)}], temperature: 0.3 }`、解析 `data.choices[0].message.content`。baseUrl 沿用 #5 修复（用户填完整路径，去尾斜杠，不追加 path）。
- **anthropic 风格**：
  - 请求头：`x-api-key: <apiKey>`（非 Bearer）、`anthropic-version: 2023-06-01`、`Content-Type: application/json`。
  - 请求体：`{ model, max_tokens, system: <翻译指令>, messages: [{role:'user', content: <原文>}], temperature: 0.3 }`。翻译指令作为顶层 `system` 字段，原文作为 user message（Anthropic 标准 system + user 结构）。
  - 响应解析：`data.content[0].text`。
  - 失败仍经 `classifyError` 归一化为四类 `errorType`（429 → rate-limit，4xx/5xx → unreachable，fetch 异常 → network），与既有错误模型一致，不新增错误类型。

**7.2.3 配置页 UI**

`entrypoints/options/App.vue` 源卡片内，在源类型为 `openai-compatible` 时展示「响应风格」单选（openai / anthropic，默认 openai）；切换类型为 `ollama` / 传统源时隐藏并复位为 openai。说明文案明确两种风格差异（openai：OpenAI 兼容端点；anthropic：原生 Anthropic Messages API 端点，如 Claude 官方）。连通性测试复用 `test-provider` 通道，覆盖 anthropic 风格。

### 7.3 技术

- 技术栈：Manifest V3 + WXT + Vue 3 + TypeScript（沿用）。
- 模块位置：改动集中在 `shared/translator/llm-provider.ts`（分流 + callAnthropic）、`shared/types.ts`（ProviderConfig）、`entrypoints/options/App.vue`（UI）；`shared/llm.ts` 为 `@deprecated` 兼容层，无需改动（内部委托适配层，自动继承新能力）。
- 存储：`responseStyle` 随 `ProviderConfig` 走 `chrome.storage.local`，可选字段，旧配置无该字段时按 openai。
- 跨域：Anthropic 端点域名需在 manifest `host_permissions`（沿用现有动态源 host 处理，不新增硬编码域名）。
- 测试：Vitest 单元测试覆盖 openai / anthropic 两条风格路径（请求构建 + 响应解析 + 错误归类）；Playwright e2e 扩展 mock server 新增 Anthropic `/v1/messages` 路由，验证 anthropic 风格划词翻译与连通性测试；openai 风格回归用例不退化。

### 7.4 假设

| 假设 | 验证方式 | 失败信号 |
|---|---|---|
| Anthropic Messages API 响应可稳定取 `data.content[0].text` | 单元测试 + 真实端点连通性测试 | 响应结构嵌套层级不同导致解析空 |
| `x-api-key` + `anthropic-version` 头足以鉴权 | 真实 Anthropic 端点连通性测试 | 401/403 |
| `responseStyle` 作为可选字段不破坏存量配置读取 | 单元测试 + 存量配置回归 | 旧配置读取异常 |
| anthropic 风格失败可归入既有四类 errorType | 单元测试 | 出现无法归类的错误形态 |

## 8. 发布

**时间范围**：约 0.5–1 周（增量改进，改动集中在 LLM provider + 配置页 UI）。

**第一版（v0.2 本 PRD 范围）**：

- `ProviderConfig.responseStyle` 字段
- `callOpenAICompatible` 风格分流 / `callAnthropic` 实现
- 配置页响应风格单选 UI
- anthropic 风格单测 + e2e（mock 路由）
- openai 风格回归

**未来版本**：

- 更多原生协议风格（其他厂商原生 API）
- anthropic 风格的流式响应（streaming）

## 本轮不做

| 功能 | 延后原因 | 预计版本 |
|---|---|---|
| anthropic 流式响应 | 增量复杂度，非首版必需 | v0.3+ |
| 其他厂商原生协议 | 按需扩展 | v0.3+ |
| 自动协议探测（免用户选风格） | 增加误判风险，显式选择更可控 | 不规划 |

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 类型扩展 | `ProviderConfig.responseStyle` 新增，默认 openai，向后兼容 | P0 |
| 风格分流 | openai 维持现状；anthropic 用 x-api-key + anthropic-version + max_tokens + 顶层 system，解析 data.content[0].text | P0 |
| 配置页 UI | OpenAI 兼容类型展示响应风格单选，默认 openai，说明文案明确 | P0 |
| anthropic 联通 | 真实 Anthropic 端点 + anthropic 风格，连通性测试与划词翻译正常 | P0 |
| openai 回归 | 既有 openai 风格源连通性测试 + 划词翻译 e2e 不退化 | P0 |

## UX 设计

### UX 依据

- Issue: `#6`（https://github.com/Aiden-FE/llm-translator/issues/6）
- 版本: v0.2
- 知识来源: [knowledges/ux/interaction-patterns.md](../../../knowledges/ux/interaction-patterns.md)（设置页翻译源管理）、[knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)（提供方卡片、输入框/单选、间距）、[knowledges/ux/accessibility.md](../../../knowledges/ux/accessibility.md)（对比度、非颜色依赖、label 关联）
- 设计假设: 用户能根据端点类型正确选择 openai/anthropic 风格；说明文案足以区分两者。该假设待 UX 评审与用户验证。

### 视觉设计

> 本 PRD 无新增独立界面，沿用现有配置页源卡片视觉（见 design-system.md「提供方卡片」）。不单独产出视觉原型；UI 差异仅体现为源卡片内条件渲染一组单选按钮（openai / anthropic），复用既有输入框/单选样式与间距（基准 4px，常用 8px / 12px，卡片内边距 12px，圆角 4px）。

### 交互逻辑（差异）

在 v0.2 配置页源卡片基础上，新增「响应风格」单选，差异如下：

| 场景 | 反馈 |
|---|---|
| 源类型 = OpenAI 兼容 | 展示「响应风格」单选（openai / anthropic），默认 openai |
| 源类型 = Ollama / Google / Microsoft | 隐藏「响应风格」单选，复位为 openai |
| 选中 anthropic | 卡片内说明文案：「适用于原生 Anthropic Messages API 端点（如 Claude 官方 https://api.anthropic.com/v1/messages）」 |
| 选中 openai | 卡片内说明文案：「适用于 OpenAI 兼容端点」 |
| 连通性测试 | 复用 test-provider 通道，按当前风格发起请求，结果 inline 展示（✅ 译文 / ❌ 错误） |

### 业务约束

- 响应风格仅对 OpenAI 兼容源生效；切换源类型时复位为 openai，避免残留无效风格。
- anthropic 风格鉴权用 `x-api-key`（非 Bearer），Key 不写入日志/错误文案/commit，仅存 `chrome.storage.local`（沿用既有安全约束）。
- 失败仍归一化为四类 errorType，划词浮层反馈不变（不为本 PRD 新增错误类型）。

### 状态变化（差异）

源卡片新增「响应风格」选择态（openai / anthropic），不改变卡片其余状态（添加/删除/编辑/启用/连通性测试）。划词浮层状态不变（anthropic 风格成功/失败仍走既有浮层渲染）。

### 设备适配（差异）

无差异。配置页最大 720px 居中（沿用），单选按钮与既有字段共用行或换行，响应式规则不变。

### 可访问性（差异）

- 单选按钮用原生 `<input type="radio">` + `<label>` 关联，键盘可达，不依赖颜色区分（符合 accessibility.md「不依赖纯图标」）。
- 说明文案对比度满足 WCAG AA（深色文字 `#1F2937` on 浅色背景，沿用）。
- 风格切换不引发自动提交，需用户显式保存（避免误操作）。

### 验收补充

- OpenAI 兼容源卡片展示响应风格单选，默认 openai，两种风格说明文案明确。
- 切换源类型为 Ollama/传统源时单选隐藏并复位。
- 单选键盘可达、label 关联、对比度满足 AA。
- anthropic 风格连通性测试与划词翻译正常；openai 风格回归不退化。
