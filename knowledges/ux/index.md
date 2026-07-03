# UX 规范索引 — LLM Translator

> 项目级 UX 规范、设计系统、交互模式与原型索引。

## 文档清单

- [design-system.md](design-system.md) — 设计系统（色彩、字体、间距、组件）
- [interaction-patterns.md](interaction-patterns.md) — 交互模式（划词翻译、浮层、设置页）
- [accessibility.md](accessibility.md) — 可访问性要求

## 设计原则

1. **轻量不打扰**：翻译浮层最小侵入，不遮挡阅读流。
2. **状态可见**：加载、成功、失败状态清晰反馈。
3. **配置友好**：设置页对普通用户简洁、对技术用户暴露高级项。
4. **隐私透明**：明确告知数据去向（云端 vs 本地）。

## 视觉原型

视觉原型与高保真交付物由 `web-design-engineer` 技能生成，沉淀于 [prototypes/](prototypes/index.md)。

- [prototypes/v0.2-source-picker.html](prototypes/v0.2-source-picker.html) — v0.2 配置页翻译源选择 UI
- [prototypes/v0.2-popup-settings.html](prototypes/v0.2-popup-settings.html) — v0.2 popup 设置面板(配置入口 popup 化与现代化)
- [prototypes/v0.2-md-render.html](prototypes/v0.2-md-render.html) — v0.2 译文 markdown 可读渲染(raw vs rendered)
