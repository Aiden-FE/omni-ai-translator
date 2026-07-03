# PRD — LLM 源下拉标签误导修复（Issue #28）

## 1. 问题

配置页源类型下拉项「OpenAI 兼容（云端）」「Ollama（本地）」将协议风格与部署位置混为一谈，且 Ollama 本应与 OpenAI 兼容同属「LLM 接口配置」类目却单列。用户配置 LLM 接口时被「云端/本地」字样误导，误以为两者是不同部署模式而非同类 LLM 接口。

- 代码位置：`entrypoints/options/App.vue:291-307`
- 严重程度：一般（误导性标签，影响配置认知）
- 关联 PRD：#4（source-picker-ui）、#6（llm-anthropic-style）
- 迭代版本：v0.2；里程碑：v0.2 - 翻译源配置闭环

## 2. 期望

LLM 类源（openai-compatible 与 ollama）归入统一的「LLM 接口配置」类目；去除误导性的「云端/本地」部署后缀。使用户理解该栏目即「配置 LLM 接口」，openai-compatible 与 ollama 是同类下的不同实现。

## 3. 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 下拉分组 | 源类型下拉用 optgroup 分为「LLM 接口配置」与「传统翻译」两组 | P0 |
| LLM 同组 | openai-compatible 与 ollama 同属「LLM 接口配置」组 | P0 |
| 去后缀 | 下拉选项文案去除「（云端）」「（本地）」后缀 | P0 |
| value 不变 | option 的 value 保持 openai-compatible/ollama/google/microsoft，不影响 onTypeChange 逻辑 | P0 |
| 回归 | 切换源类型后 baseUrl 自动替换、responseStyle 复位、测试结果清除等逻辑不变 | P0 |
