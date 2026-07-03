# DESIGN — LLM 源下拉标签误导修复（Issue #28）

## 1. 背景

配置页源类型下拉（`entrypoints/options/App.vue:291-307`）当前为 4 个平铺 option，文案「OpenAI 兼容（云端）」「Ollama（本地）」把协议风格与部署位置混为一谈，且 LLM 类源未归组。Issue #28 要求分组并去误导后缀。

## 2. 方案

采用 `<optgroup>` 分组 + 去后缀，最小改动：

- 「LLM 接口配置」组：`openai-compatible`（文案「OpenAI 兼容」）、`ollama`（文案「Ollama」）
- 「传统翻译」组：`google`（文案「Google 翻译」）、`microsoft`（文案「微软翻译」）
- select 的 `v-model="p.type"` 和 `@change="onTypeChange(p)"` 保留不变。
- option 的 `value` 全部保持不变，`onTypeChange` 逻辑（baseUrl 替换、responseStyle 复位、测试结果清除）零改动。
- ollama 本地端点的辅助说明已在 `baseUrlPlaceholder`（App.vue:52-53）体现，下拉标签无需「本地」后缀。

### 最小改动

仅改 template 内 select 的 option 结构（约 295-307 行），不涉及 script 逻辑、类型定义、存储。

### 回滚

还原为平铺 option 即可（4 个 option 去掉 optgroup 包裹，文案还原）。

### 与 #30（事项7 popup-settings）关系

PRD #30 计划把配置 UI 迁到 popup 并用 optgroup 分组（interaction-patterns.md:63 已记录）。本次修复采用与 #30 一致的分组方案（LLM 接口配置/传统翻译），即使 #30 后续重做 popup，分组语义一致不矛盾。用户已决策本次按独立快修在 options 页修复。

## UX 与视觉实现

### 分组语义

使用原生 `<optgroup label="...">` 对源类型下拉分组，传达「LLM 接口配置」与「传统翻译」两类语义边界。optgroup 是 HTML 标准元素，浏览器原生渲染为不可选的分组标题行，无需额外样式。

### 可访问性

- optgroup 的 `label` 属性提供分组语义，屏幕阅读器可读出分组名（符合 [knowledges/ux/accessibility.md](../../../../ux/accessibility.md)「不依赖纯图标传达信息，关键状态均有文字说明」）。
- select 保留原生键盘交互（Tab 聚焦、方向键选择），符合 accessibility.md「设置页所有可操作元素可通过 Tab 聚焦与操作」。
- 分组不改变 value，条件字段渲染（isLlmType 判断 model 字段显示）与 Tab 顺序不受影响。
- 无新增颜色/图标依赖，对比度沿用设计系统（design-system.md：页面边框 #E5E7EB/#D1D5DB，输入框圆角 4px）。

### 视觉原型

本修复无独立视觉原型，沿用现有配置页源卡片视觉（design-system.md「提供方卡片」：边框 + 圆角，纵向排列，行内排列输入框与操作按钮）。optgroup 分组标题由浏览器原生样式渲染。原型参照：[knowledges/ux/prototypes/v0.2-source-picker.html](../../../../ux/prototypes/v0.2-source-picker.html)（PRD #4 配置页原型）。
