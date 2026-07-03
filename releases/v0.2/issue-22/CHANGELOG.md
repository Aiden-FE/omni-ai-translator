# CHANGELOG — Issue #22 LLM 适配层 anthropic 响应风格支持

| 项 | 内容 |
|---|---|
| ISSUE_ID | #22 |
| 版本 | v0.2 |
| 创建日期 | 2026-07-03 |
| 关联 PRD | #6（5-llm-anthropic-style） |

## 新增功能

- **ProviderConfig.responseStyle 字段**：`shared/types.ts` 的 `ProviderConfig` 新增可选字段 `responseStyle?: 'openai' | 'anthropic'`，缺省按 `openai`（向后兼容，存量配置无需迁移）。仅对 `openai-compatible` 类型有意义。
- **anthropic 响应风格支持**：`shared/translator/llm-provider.ts` 新增 `callAnthropic` 函数，支持原生 Anthropic Messages API 端点（如 Claude 官方 `https://api.anthropic.com/v1/messages`）。请求用 `x-api-key` 头 + `anthropic-version: 2023-06-01`，body 含 `max_tokens` + 顶层 `system`（翻译指令）+ 原文作 user message；响应解析 `data.content[0].text`。
- **风格分流路由**：`createLLMProvider` 在 `openai-compatible` 类型下按 `responseStyle` 路由（anthropic→callAnthropic，openai/缺省→callOpenAICompatible），ollama 不受影响。
- **配置页响应风格单选 UI**：`entrypoints/options/App.vue` 源卡片在类型为 `openai-compatible` 时展示响应风格单选（openai / anthropic，默认 openai），切换类型时复位为 openai，说明文案区分两种风格。

## Bug 修复

无。

## API 变更（API Changes）

- `ProviderConfig` 接口新增可选字段 `responseStyle?: 'openai' | 'anthropic'`。该字段为可选，不破坏既有配置读写。

## 破坏性变更

无。所有改动向后兼容：
- `responseStyle` 为可选字段，存量配置无该字段时按 `openai` 处理。
- 既有 `callOpenAICompatible` 逻辑不变，仅路由层增加 `responseStyle` 判断。
- 既有 openai 风格单测与 e2e 全部回归通过，不退化。

## 测试

- **单元测试**：新增 8 个测试覆盖 anthropic 风格成功路径（请求构建 + 响应解析）、错误归类（429→rate-limit、500→unreachable、401→unreachable、fetch TypeError→network）、content 空数组兜底、openai 缺省/显式回归。全部 93 个单测通过。
- **e2e 测试**：mock server 新增 Anthropic `/v1/messages` 路由；新增 anthropic 风格划词翻译 e2e（连通性测试 + 划词翻译 + 请求落点/头/体验证）。全部 4 个 e2e 通过（含 3 个既有回归用例）。

## 部署注意事项

- **发布前事项（不在本任务代码范围）**：隐私声明需补充原生 Anthropic 端点文本外传文案（见迭代主文档 `knowledges/product-wiki/releases/v0.2/index.md` 隐私登记项）。当前隐私声明第 5 节仅列「OpenAI 兼容接口 / 本地 Ollama」，需在发布前用 prodflow-prd revise 或 privacy-policy 更新，明示原生 Anthropic 端点文本外传（数据流同既有 LLM 提供方，仅协议/厂商补充）。
- **可选真实联调**：真实 Anthropic 端点联调需用户提供 Claude API Key + 端点，作为手动验收。无真实 Key 时 e2e 用 mock 路由完成，不阻塞交付。
- **跨域 host_permissions**：Anthropic 端点域名需在 manifest `host_permissions` 声明，沿用现有动态源 host 处理，不硬编码厂商域名。
