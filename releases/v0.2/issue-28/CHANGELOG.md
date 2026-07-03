# CHANGELOG — Issue #28

## Bug 修复

- **配置页源类型下拉分组并去误导后缀**（#28）：将 `entrypoints/options/App.vue` 源类型下拉由 4 个平铺 option 改为 `<optgroup>` 分组——「LLM 接口配置」组含 openai-compatible（文案「OpenAI 兼容」）与 ollama（文案「Ollama」），「传统翻译」组含 google 与 microsoft。去除误导性的「（云端）」「（本地）」部署后缀，使 LLM 类源归入统一类目。option 的 value 保持不变，`onTypeChange` 逻辑（baseUrl 替换、responseStyle 复位、测试结果清除）零改动。

## 与 #30 协调说明

PRD #30（事项7 popup-settings）已把 #28 列为验收标准 KR3，计划把配置 UI 迁到 popup 并重做该分类。本次按独立快修在 options 页修复，采用与 #30 一致的分组方案（LLM 接口配置/传统翻译），接受事项7 后续可能重做。用户已决策。
