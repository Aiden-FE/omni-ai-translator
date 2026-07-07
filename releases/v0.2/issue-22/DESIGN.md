# DESIGN — Issue #22 LLM 适配层 anthropic 响应风格支持

| 项 | 内容 |
|---|---|
| ISSUE_ID | #22 |
| 版本 | v0.2 |
| 创建日期 | 2026-07-03 |
| 适用范围 | LLM Translator v0.2 功能事项 5 — 研发任务 #22 |
| 关联 ADR | [ADR-001 统一适配层](../../../knowledges/adr/001-unified-translator-adapter-layer.md) |

## 1. 背景与目标

v0.2 已建立统一翻译源适配层（ADR-001），LLM 类源经 `shared/translator/llm-provider.ts` 的 `createLLMProvider` → `callOpenAICompatible` 接入，按 OpenAI Chat Completions 格式构建请求并解析响应。部分用户希望使用原生 Anthropic Messages API 端点（如直连 Claude 官方 `https://api.anthropic.com/v1/messages`），现有适配层只有 OpenAI 一种格式无法对接。

**目标**：在 `ProviderConfig` 上增加可选 `responseStyle` 字段，在 LLM provider 内按风格分流请求构建与响应解析，使 anthropic 风格端点可直接配置使用，不影响既有 openai 风格。

## 2. 技术选型与方案对比

### 方案 A：拆出独立 `callAnthropic` 函数（推荐）

在 `llm-provider.ts` 内新增 `callAnthropic(provider, req)` 函数，`createLLMProvider` 在 `openai-compatible` 类型下按 `config.responseStyle` 路由：`openai`（或缺省）→ `callOpenAICompatible`，`anthropic` → `callAnthropic`。

| 维度 | 评价 |
|---|---|
| 改动范围 | 集中在 llm-provider.ts，新增一个函数 + 路由一行 |
| 可测试性 | callAnthropic 可独立单测（请求构建 + 响应解析 + 错误归类） |
| 可回滚 | 删除 callAnthropic + 路由行即恢复 |
| 一致性 | 与现有 callOllama/callOpenAICompatible 平级，符合 ADR-001 工厂函数风格 |
| 风险 | 低 |

### 方案 B：在 callOpenAICompatible 内 if-else 分流

在 `callOpenAICompatible` 函数体内按 `responseStyle` 分流请求构建与响应解析。

| 维度 | 评价 |
|---|---|
| 改动范围 | 单函数变长，两种风格逻辑混杂 |
| 可测试性 | 可测但分支耦合，错误路径覆盖需在同一函数内 |
| 可回滚 | 需删除分支逻辑 |
| 一致性 | 函数职责变模糊（既 openai 又 anthropic） |
| 风险 | 中（函数复杂度上升） |

### 方案 C：新增独立 provider 类型 `anthropic`

在 `ProviderType` 新增 `anthropic` 类型，registry 路由到新 provider。

| 维度 | 评价 |
|---|---|
| 改动范围 | 大（types/registry/App.vue select/builtin-sources 全链路改动） |
| 可测试性 | 可测 |
| 可回滚 | 改动面大，回滚成本高 |
| 一致性 | 与 PRD「响应风格维度」设计不符（PRD 明确是 openai-compatible 的风格，非独立类型） |
| 风险 | 高（偏离 PRD，over-engineering） |

### 最终选择：方案 A

理由：最小改动、可独立单测、可回滚、与 ADR-001 工厂函数风格一致、完全符合 PRD「风格分流」语义。方案 B 函数复杂度上升，方案 C 偏离 PRD 且改动面过大。

## 3. 架构方案

### 3.1 数据结构变更

`shared/types.ts` — `ProviderConfig` 新增可选字段：

```typescript
export interface ProviderConfig {
  // ... 既有字段
  /** 响应风格：仅对 openai-compatible 类型有意义。缺省按 'openai'（向后兼容）。 */
  responseStyle?: 'openai' | 'anthropic';
}
```

存量配置无 `responseStyle` 字段时按 `openai` 处理，无需迁移。

### 3.2 LLM provider 风格分流

`shared/translator/llm-provider.ts` — 新增 `callAnthropic` + `createLLMProvider` 路由：

```
createLLMProvider(config)
  ├─ config.type === 'ollama' → callOllama(config, req)
  ├─ config.type === 'openai-compatible'
  │    ├─ responseStyle === 'anthropic' → callAnthropic(config, req)
  │    └─ else（openai / 缺省） → callOpenAICompatible(config, req)
```

**callAnthropic 请求规范**：
- URL：`provider.baseUrl`（去尾斜杠，沿用 #5 完整路径用法，如 `https://api.anthropic.com/v1/messages`）
- Headers：`Content-Type: application/json`、`x-api-key: <apiKey>`（有 apiKey 时）、`anthropic-version: 2023-06-01`
- Body：`{ model, max_tokens: 1024, system: buildPrompt(text, targetLang, sourceLang), messages: [{role:'user', content: text}], temperature: 0.3 }`
- 响应解析：`data?.content?.[0]?.text?.trim() ?? ''`
- 错误：`!resp.ok` 时 `classifyError(null, resp.status)` 归一化；catch 时 `classifyError(err)` 归一化 network

### 3.3 配置页 UI

`entrypoints/options/App.vue` — 源卡片内新增响应风格单选：

- **渲染条件**：`p.type === 'openai-compatible'` 时展示一组 radio（openai / anthropic），默认 openai。
- **插入位置**：baseUrl 行之后、apiKey 行之前（与 model 同区域，属于「接口风格」配置组）。
- **复位逻辑**：`onTypeChange` 中，当类型从 openai-compatible 切换为其它时，`p.responseStyle = 'openai'`（或 delete）。
- **说明文案**：选中 anthropic 时显示「适用于原生 Anthropic Messages API 端点（如 Claude 官方）」；选中 openai 时显示「适用于 OpenAI 兼容端点」。
- **可访问性**：原生 `<input type="radio">` + `<label>` 关联，键盘可达。

### 3.4 测试方案

- **单测**（`shared/translator/__tests__/llm-provider.test.ts`）：
  - anthropic 风格成功：mock fetch 返回 `{content:[{text:'你好,世界'}]}`，断言请求头含 `x-api-key` + `anthropic-version`、body 含 `system` + `max_tokens` + `messages`、译文正确。
  - anthropic 风格错误：429→rate-limit、500→unreachable、fetch TypeError→network。
  - openai 风格回归：既有用例不改动，确保 responseStyle 缺省/为 openai 时走原路径。
- **e2e**（`e2e/mock-server.ts` + `e2e/translate.spec.ts`）：
  - mock server 新增 `/v1/messages` 路由，返回 `{content:[{type:'text',text:'你好,世界'}]}`。
  - 新增 e2e：配置 anthropic 风格源 → 划词翻译 → 断言浮层译文 + 请求落点 + 请求头含 x-api-key。
  - 既有 openai e2e 回归不退化。

## 4. 兼容性与风险评估

| 维度 | 评估 | 缓解 |
|---|---|---|
| 向后兼容 | responseStyle 可选字段，存量配置无该字段按 openai | 单测覆盖缺省场景 |
| openai 回归 | callOpenAICompatible 逻辑不变，仅路由层增加判断 | 既有单测 + e2e 回归 |
| Anthropic 响应结构假设 | 假设 `data.content[0].text` 稳定 | 单测 + 可选真实端点联调 |
| max_tokens 截断 | 1024 对极长文本可能不足 | 非本任务范围，未来可配置 |
| 跨域 host_permissions | Anthropic 端点域名需声明 | 沿用现有动态 host 处理，不硬编码 |
| API Key 安全 | x-api-key 仅存 storage，不写入日志/commit/错误文案 | 沿用既有安全约束 |

## 5. 回滚方式

- 删除 `callAnthropic` 函数 + `createLLMProvider` 内 anthropic 路由行。
- 删除 `ProviderConfig.responseStyle` 字段。
- 删除 App.vue 响应风格单选 UI。
- 删除相关单测 + e2e 用例。
- 即可完全恢复到 openai 单风格状态，无数据迁移、无破坏性变更。
