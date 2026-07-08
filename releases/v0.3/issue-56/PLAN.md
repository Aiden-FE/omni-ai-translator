# UI Design System Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Issue #56 by introducing tailwindcss + shadcn-vue design-system foundations, migrating all current extension UI surfaces to token-driven styling, and preserving existing behavior.

**Architecture:** Add a token layer and tailwind/shadcn component layer below existing Vue business components. Keep provider/storage/message/translator contracts unchanged; replace only styling and base controls in popup/options/content UI.

**Tech Stack:** WXT 0.19, Vue 3, TypeScript strict mode, tailwindcss, shadcn-vue style local components, Vitest, Playwright e2e.

---

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | `v0.3` |
| ISSUE_ID | `#56` |
| PRD Issue | `#49` |
| 基础分支 | `master` |
| 自动批准 | 已按无人值守策略自动批准，依据见 `DESIGN.md` |

## 执行任务列表

- [x] Task 1: 引入 tailwind/shadcn 基础依赖与构建配置
- [x] Task 2: 建立 token 样式入口和 shadcn-vue 基础组件
- [x] Task 3: 迁移 content trigger、iframe panel 与 markdown 样式
- [x] Task 4: 迁移 popup、options 与 SourceConfigPanel
- [x] Task 5: 更新 UX 设计系统知识文档
- [x] Task 6: 补充测试并执行验证命令
- [x] Task 7: 自查硬编码色值、行为约束和文档留痕

## 任务分解

### Task 1: 引入 tailwind/shadcn 基础依赖与构建配置

**文件：**
- 修改 `package.json`
- 修改 `pnpm-lock.yaml`
- 修改 `wxt.config.ts`
- 新增 `tailwind.config.ts`
- 新增或修改全局样式入口

**步骤：**
- [x] 安装 tailwindcss、`@tailwindcss/vite`、shadcn-vue 相关按需依赖；优先 tailwind v4，若 build 不兼容则回退 tailwind v3 + PostCSS。
- [x] 在 `wxt.config.ts` 的 Vite 配置中注册 tailwind 插件并保留 Vue 插件。
- [x] 创建 tailwind content/source 扫描配置，覆盖 `entrypoints/**/*`、`shared/**/*`、`components/**/*`。
- [x] 确认 `pnpm typecheck` 能识别新增配置文件，无 TS 严格模式错误。

**验收标准：**
- `pnpm install` 后锁文件稳定。
- `pnpm build` 至少进入 Vue/WXT 构建阶段，tailwind 配置不报错。

### Task 2: 建立 token 样式入口和 shadcn-vue 基础组件

**文件：**
- 新增 token CSS 文件
- 新增 `shared/lib/utils.ts`
- 新增 `shared/ui/components/` 下的 Button、Card、Input、Label、Select、Badge、ScrollArea

**步骤：**
- [x] 定义 `:root` token，包括 background、foreground、card、primary、muted、border、input、ring、destructive、success 和 content 扩展 token。
- [x] 实现 `cn()` class 合并工具，不使用 `any`。
- [x] 实现 Button/Card/Input/Label/Select/Badge/ScrollArea 组件，支持当前页面所需 variants 和 disabled/focus 状态。
- [x] 确保组件默认 class 使用 token，不出现散乱业务色值。

**验收标准：**
- 组件可被 popup/options 编译引用。
- focus ring、disabled、success/error badge 有 token 驱动样式。

### Task 3: 迁移 content trigger、iframe panel 与 markdown 样式

**文件：**
- 修改 `assets/content.css`
- 必要时修改 `entrypoints/content.ts`

**步骤：**
- [x] 在 `assets/content.css` 顶部定义 content iframe 可用的 token fallback。
- [x] 将 trigger、panel、error、cursor、markdown code/pre/blockquote/link 样式改为 CSS 变量。
- [x] 保持 `.llm-translator-panel-frame`、`.llm-translator-panel`、`.llm-translator-trigger` class 名不变。
- [x] 确认 `aria-live`、`role="status"`、trigger `aria-label` 不退化。
- [x] 保持 `width:max-content`、`max-width:360px` 和 iframe 尺寸同步逻辑不变。

**验收标准：**
- content 目标样式文件不再用散乱硬编码色值表达主题。
- e2e 中 `.llm-translator-trigger` 和 iframe `.llm-translator-panel` 选择器仍可用。

### Task 4: 迁移 popup、options 与 SourceConfigPanel

**文件：**
- 修改 `entrypoints/popup/App.vue`
- 修改 `entrypoints/options/App.vue`
- 修改 `shared/ui/SourceConfigPanel.vue`

**步骤：**
- [x] popup 根容器保持 400x600，改用 tailwind utility 和 shadcn Button。
- [x] options 根容器保持最大 720px 居中，改用 token/tailwind。
- [x] SourceConfigPanel 使用 Card/Input/Label/Select/Button/Badge 替换原生样式表达。
- [x] 保持 `variant="popup"` 折叠逻辑、`focusFirst()`、`addProvider()` 对外暴露不变。
- [x] 保持所有按钮可通过 role/name 被 e2e 定位，避免破坏现有 Playwright 用例。

**验收标准：**
- popup/options 配置流行为不变。
- `SourceConfigPanel` 不新增业务契约或存储字段。

### Task 5: 更新 UX 设计系统知识文档

**文件：**
- 修改 `knowledges/ux/design-system.md`

**步骤：**
- [x] 补充 v0.3 token 命名规则和 CSS 变量表。
- [x] 记录 token 首版沿用当前冷色调，#57 可替换 token 色板。
- [x] 记录 content iframe 注入与 popup/options token 使用边界。

**验收标准：**
- 文档能指导 #57 直接基于 token 替换主题。

### Task 6: 补充测试并执行验证命令

**文件：**
- 新增或修改必要的 Vitest 测试
- 使用现有 `e2e/translate.spec.ts`

**步骤：**
- [x] 增加 token/CSS 或组件轻量测试，覆盖关键 CSS 变量和组件 class 输出。
- [x] 运行 `pnpm typecheck`。
- [x] 运行 `pnpm lint`。
- [x] 运行 `pnpm build`。
- [x] 运行 `pnpm e2e`；若浏览器依赖缺失，先运行 `pnpm e2e:install` 或记录不可运行原因。

**验收标准：**
- 可运行验证全部通过；不可运行项必须有明确环境原因和已执行命令输出。

### Task 7: 自查硬编码色值、行为约束和文档留痕

**文件：**
- 修改 `releases/v0.3/issue-56/MEMORY.md`
- 修改 `releases/v0.3/issue-56/PLAN.md`

**步骤：**
- [x] 检查目标 UI 文件中是否仍有散乱 `#RRGGBB` 色值，允许文档历史说明或 token fallback。
- [x] 对照 PRD 验收项确认 popup 400x600、options 720px、panel 360px 约束存在。
- [x] 更新 `MEMORY.md` 的踩坑、关键实现和待沉淀知识。
- [x] 将本 PLAN 所有任务勾选为完成。

**验收标准：**
- `verify-step4` 可通过。
- `MEMORY.md` 包含实现阶段关键发现。

## 进度跟踪

| 状态 | 任务数 |
|------|--------|
| 未开始 | 0 |
| 进行中 | 0 |
| 已完成 | 7 |
| 总计 | 7 |

**完成进度：** `100%`

## 变更记录

| 变更日期 | 变更内容 | 变更原因 |
|----------|----------|----------|
| 2026-07-08 | 创建 #56 初始执行计划 | 无人值守模式下基于 Issue、PRD、UX 规范和代码现状自动批准 |
| 2026-07-08 | 勾选全部执行任务并记录验证已完成 | Step4 实现完成，进入审查与测试前留痕 |
