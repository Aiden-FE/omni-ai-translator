# DESIGN: 产品品牌统一 (#65)

> Issue #65 · 引用 PRD `releases/v0.3/5-product-name/PRD.md` `## UX 设计` 与 `knowledges/ux/design-system.md`

## 1. 设计概述

本任务为品牌文案靶向替换,不涉及任何架构、组件结构、样式 token 或交互变更。将 5 处用户可见品牌字样从 `LLM Translator` 替换为 `Omni AI Translator`。

## 2. 变更清单

| 文件 | 行 | 当前值 | 目标值 |
|---|---|---|---|
| entrypoints/popup/App.vue | 27 | `aria-label="LLM Translator 设置"` | `aria-label="Omni AI Translator 设置"` |
| entrypoints/popup/App.vue | 36 | `LLM Translator` | `Omni AI Translator` |
| entrypoints/options/App.vue | 9 | `LLM Translator 设置` | `Omni AI Translator 设置` |
| entrypoints/popup/index.html | 5 | `<title>LLM Translator</title>` | `<title>Omni AI Translator</title>` |
| entrypoints/options/index.html | 5 | `<title>LLM Translator 设置</title>` | `<title>Omni AI Translator 设置</title>` |

## 3. UX 与视觉实现

引用 PRD `## UX 设计` 与 `knowledges/ux/design-system.md`:

- **仅替换品牌文案**:不改动布局、字号、颜色、间距、组件结构、交互流程。
- **popup 布局不退化**:popup 固定 400x600(`entrypoints/popup/App.vue:25` `h-[600px] w-[400px]`)。header span 使用 `min-w-0 flex-1 truncate`(`App.vue:36`),`truncate` 会自动截断溢出文本。`Omni AI Translator` 比 `LLM Translator` 长 7 个字符,但 truncate 机制保证不溢出容器。header 高度固定 `h-12`,字号 `text-sm`,不受品牌名长度影响。
- **aria-label 一致性**:popup 对话框 `aria-label` 必须与可见品牌名(header span)保持一致,均使用 `Omni AI Translator`。
- **视觉基线**:sunlit teal 主题(#57),token-first 策略(ADR-006)。本任务不触碰任何 CSS token、Tailwind class 或组件 variant,视觉表现完全不变。
- **HTML title**:popup/options 的 `index.html` `<title>` 标签影响浏览器标签页标题,替换为正式产品名保持一致。

## 4. 共享文件协同

- #64 也在改 wxt.config.ts(移除 contextMenus 权限)。本任务 wxt.config.ts manifest name 已在 PRD 定稿时同步,不再触碰该文件,避免冲突。
- 不同字段、最小靶向改动,不重排权限或其它字段。

## 5. 回归检查

构建后验证:
- 构建产物 `.output/chrome-mv3/manifest.json` 的 `name` 字段 = `Omni AI Translator`
- 仓库内用户可见品牌名一致性:grep 确认 popup/options Vue 组件与 HTML 入口无残留 `LLM Translator`(排除 knowledges/ 与 releases/ 内部文档)

## 6. 回滚方案

`git revert` 本任务 commit 即可恢复旧品牌字样。无数据迁移、无存储变更、无类型变更。
