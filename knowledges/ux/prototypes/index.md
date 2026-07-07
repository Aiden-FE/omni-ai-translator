# 视觉原型索引 — LLM Translator

> 视觉原型与高保真交付物，由 `web-design-engineer` 产出。单文件 HTML，浏览器直接打开。

## 原型清单

| 路径 | 版本 | 关联 PRD | 说明 |
|---|---|---|---|
| [v0.2-source-picker.html](v0.2-source-picker.html) | v0.2 | [releases/v0.2/4-source-picker-ui/PRD.md](../../../releases/v0.2/4-source-picker-ui/PRD.md) | 配置页翻译源选择 UI：当前生效源提示行、4 类源类型、条件字段、连通性测试。右下角 Tweaks 切换「兜底生效 / 已启用自有源」两态。 |
| [v0.2-popup-settings.html](v0.2-popup-settings.html) | v0.2 | [releases/v0.2/7-popup-settings/PRD.md](../../../releases/v0.2/7-popup-settings/PRD.md) | popup 设置面板：点击工具栏 icon 弹出的现代化配置入口(400×600)；生效源横幅两态、optgroup 源类型分组(LLM 接口配置/传统翻译)、可折叠源卡片、功能化「配置自有源」、连通性测试、打开全部设置。Tweaks 切换兜底/自有源态。 |
| [v0.2-md-render.html](v0.2-md-render.html) | v0.2 | [releases/v0.2/8-md-render/PRD.md](../../../releases/v0.2/8-md-render/PRD.md) | 译文 markdown 渲染：翻译浮层 raw(textContent,现状) vs rendered(markdown→sanitize→innerHTML)对比；展示标题/列表/加粗/代码块可读渲染。Tweaks 切换渲染模式。 |
| [v0.2-llm-type-unify.html](v0.2-llm-type-unify.html) | v0.2 | [releases/v0.2/9-llm-type-unify/PRD.md](../../../releases/v0.2/9-llm-type-unify/PRD.md) | LLM 类型分组统一为响应风格(深化事项7):源类型下拉 LLM 类收敛为单一「LLM」option;响应风格 radio group(openai/anthropic/ollama)对所有 LLM 源展示;切换响应风格时 baseUrl 命中已知默认值自动替换 + 测试结果复位;传统源卡(google)作对照。Tweaks 切换响应风格。 |
