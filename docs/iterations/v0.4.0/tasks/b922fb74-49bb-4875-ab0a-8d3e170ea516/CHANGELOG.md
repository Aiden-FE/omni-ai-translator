# CHANGELOG: 实现悬浮翻译工具栏与收起迷你把手

> 版本 v0.4.0 | 任务: b922fb74-49bb-4875-ab0a-8d3e170ea516

## 变更内容

### 新增

- `assets/fullpage-toolbar.css`（188 行）：工具栏与迷你把手的 shadow 内自足样式（注入 Shadow DOM，不依赖宿主继承值）。
  - `:host` 定位 `position:fixed; right:16px; bottom:16px; z-index:2147483647`（与 content.css trigger/panel 同级约定）。
  - `:host` 自足定义 `--translator-*` token（不依赖宿主文档 `:root`），显式重置 `font-family`/`color`/`font-size`/`line-height` 继承属性。
  - 工具栏容器 `max-width:220px`（尺寸克制）、竖排按钮组、暗底 `hsl(195 62% 16%)`。
  - 切换模式按钮 teal 强调底 `hsl(174 84% 27%)`；重试徽标红色 `hsl(0 70% 50%)` 圆形计数。
  - 迷你把手 36px 圆形 teal 底白字「译」，与工具栏互斥可见（`:host([data-collapsed])` CSS 切换）。
  - 按钮 hover/active 微交互（`background` 过渡）；`prefers-reduced-motion` 禁用过渡。
- `shared/fullpage/toolbar.ts`（221 行）：`createToolbar(callbacks): ToolbarApi` 工厂函数。
  - 宿主 `div[data-llm-translator]` + open shadow root + `?inline` CSS 注入。
  - 按钮组：翻译进度行（`role="status"` / `aria-live="polite"`）+ 切换模式（label 随模式翻转）+ 恢复原文 + 重试失败段落（默认隐藏 + 计数徽标）+ 收起；均带 `title` 与 `aria-label`。
  - 迷你把手 36px 圆形「译」。
  - `ToolbarApi`：`setMode(mode)` 翻转文案 / `setProgress({completed,total,failed,active})` 翻译进度行（active 时显示 `全文翻译 N/total`、完成时 `全文翻译完成 N/total`、有失败 `已完成 N/total，失败 M`、空页面 `未发现可翻译文本`）/ `setFailureCount(n)` 显示/隐藏重试按钮 / `collapse()`/`expand()` 切换工具栏与迷你把手 / `destroy()` 幂等移除宿主。
  - 工具栏只发事件（callbacks），不直接操作翻译状态；收起/展开属 UI 状态由 toolbar 直接管理 + 发通知回调。
- `shared/fullpage/toolbar.test.ts`（481 行）：单元测试（jsdom），覆盖宿主/shadow/按钮/回调/折叠/销毁/样式/隔离。

### 关键设计权衡

- **`onRecall` 可选**：任务签名列 4 个回调，迷你把手「点击回调 `onRecall`」。收起/展开属 UI 状态（非翻译状态），按钮点击直接调用 `collapse()`/`expand()` 并发通知回调。`onCollapse` 必填（编排器需感知收起），`onRecall` 可选（展开时编排器通常无需额外动作）。
- **单一宿主 + CSS 互斥**：工具栏与迷你把手在同一个 shadow root 内，通过 `host[data-collapsed]` 属性 CSS 切换可见性，避免管理两个独立宿主元素。
- **重试按钮结构**：label span + badge span 预建（button hidden），`setFailureCount` 仅更新 badge 文本与 hidden 状态，避免重复重建 DOM。
- **进度行在操作按钮之前**：固定高度 + `aria-live="polite"` 实时播报，避免文案变化导致按钮跳动。

## 契约产出（供后续任务）

- `ToolbarCallbacks`：`onSwitchMode` / `onRestore` / `onRetry` / `onCollapse` / `onRecall?`。
- `ToolbarApi`：`setMode` / `setProgress` / `setFailureCount` / `collapse` / `expand` / `destroy`。
- 宿主 `div[data-llm-translator]`：t2 分段收集器排除、t5 MutationObserver 过滤、恢复清理均依赖该属性。

## 来源证据

- 产品代码：`shared/fullpage/toolbar.ts`、`assets/fullpage-toolbar.css`。
- 单元测试：`shared/fullpage/toolbar.test.ts`（jsdom，覆盖全链路）。
- 详细设计与实施计划：`releases/v0.4/toolbar/DESIGN.md`、`releases/v0.4/toolbar/PLAN.md`、`releases/v0.4/toolbar/CHANGELOG.md`。

## 知识沉淀

本次任务无新增/变更长期知识（依据沉淀记录：knowledgeIds=[]、changedPaths=[]）。

- 任务 CHANGELOG（本文）作为唯一交付记录；后续若需在长期知识中体现「工具栏 UI 状态 / 进度行文案 / 收起-迷你把手互斥」契约，应在 t5 编排器知识 `feature:fullpage:orchestrator` 的工具栏接线章节或新建 `feature:fullpage:toolbar` 知识中补全（不在本归档范围）。
- 任务索引 `docs/iterations/v0.4.0/tasks/b922fb74-49bb-4875-ab0a-8d3e170ea516/index.md` 已建立。
