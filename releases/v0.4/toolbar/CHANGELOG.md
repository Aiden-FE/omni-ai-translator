# CHANGELOG: 悬浮翻译工具栏与收起迷你把手

> 版本 v0.4 · 全文翻译 · 工具栏组件

## 新增

### `assets/fullpage-toolbar.css`
- 工具栏与迷你把手的 shadow 内自足样式（注入 Shadow DOM，不依赖宿主继承值）。
- `:host` 定位 `position:fixed; right:16px; bottom:16px; z-index:2147483647`（与 content.css trigger/panel 同级约定）。
- `:host` 自足定义 `--translator-*` token（不依赖宿主文档 `:root`），显式重置 `font-family`/`color`/`font-size`/`line-height` 继承属性。
- 工具栏容器 `max-width:220px`（尺寸克制）、竖排按钮组、暗底 `hsl(195 62% 16%)`。
- 切换模式按钮 teal 强调底 `hsl(174 84% 27%)`；重试徽标红色 `hsl(0 70% 50%)` 圆形计数。
- 迷你把手 36px 圆形 teal 底白字「译」，与工具栏互斥可见（`:host([data-collapsed])` CSS 切换）。
- 按钮 hover/active 微交互（`background` 过渡）；`prefers-reduced-motion` 禁用过渡。

### `shared/fullpage/toolbar.ts`
- `createToolbar(callbacks: ToolbarCallbacks): ToolbarApi` 工厂函数。
- 宿主 `div[data-llm-translator]` + open shadow root + `?inline` CSS 注入。
- 按钮组：切换模式（label 随模式翻转）、恢复原文、重试失败段落（默认隐藏 + 计数徽标）、收起；均带 `title` 与 `aria-label`。
- `ToolbarApi`：`setMode(mode)` 翻转文案、`setFailureCount(n)` 显示/隐藏重试按钮、`collapse()`/`expand()` 切换工具栏与迷你把手、`destroy()` 幂等移除宿主。
- 工具栏只发事件（callbacks），不直接操作翻译状态；收起/展开属 UI 状态由 toolbar 直接管理 + 发通知回调。

### `shared/fullpage/toolbar.test.ts`
- 48 个单元测试（jsdom），覆盖宿主创建/Shadow DOM/按钮组/迷你把手/setMode/setFailureCount/collapse-expand/destroy/事件回调/样式定位/Shadow DOM 隔离。

## 设计决策

- **`onRecall` 可选**：任务步骤 1 签名列 4 个回调，步骤 3 提到迷你把手「点击回调 onRecall」。收起/展开属 UI 状态（非翻译状态），按钮点击直接调用 `collapse()`/`expand()` 并发通知回调。`onCollapse` 必填（编排器需感知收起），`onRecall` 可选（展开时编排器通常无需额外动作）。
- **单一宿主 + CSS 互斥**：工具栏与迷你把手在同一个 shadow root 内，通过 `host[data-collapsed]` 属性 CSS 切换可见性，避免管理两个独立宿主元素。
- **重试按钮结构**：label span + badge span 预建（button hidden），`setFailureCount` 仅更新 badge 文本与 hidden 状态，避免重复重建 DOM。
