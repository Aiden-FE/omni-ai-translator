# MEMORY - Issue #57

## 任务摘要

- Issue: #57 `【AI】【前端】视觉主题改造 - token 色板产出与全界面应用`
- PRD Issue: #50
- 迭代版本: v0.3 `商店首发与 UI 美化`
- 任务类型: 前端开发 Issue
- Worktree: `C:\Users\aiden\dev\prodflow\ai-projects\llm-translator\.worktrees\master-issue-57`
- 文档目录: `releases/v0.3/issue-57/`

## PRD 摘要

本任务承接 `releases/v0.3/2-visual-theme/PRD.md`。目标是在 #56 已合并的 tailwindcss + shadcn-vue + CSS token 基座上，定义 v0.3 最终明亮鲜艳但不抢眼的主题色板，并应用到 popup、options、`SourceConfigPanel`、划词触发按钮与 iframe 翻译浮层。交互逻辑、storage、message、translator 契约保持不变。

核心验收包括：主色、强调色、语义色 success/error/warning/info、中性色、边框、阴影、focus ring 均有 token；全应用使用新主题 token；`knowledges/ux/design-system.md` 同步最终色板、token 命名、状态映射与 WCAG AA 对比度记录；冷色硬编码残留经 grep/审查处理；`pnpm build`、`pnpm typecheck`、`pnpm lint` 与划词翻译 / popup / options 配置流回归通过。

## UX 与产品知识检索

- `knowledges/ux/design-system.md`: 高可信。#56 已建立 token 体系，明确 #57 只应替换 `shared/styles/tokens.css` 与 `assets/content.css` token 值，不应逐组件硬编码改色。当前记录仍是 #56 冷色基座，需要本任务更新为最终 v0.3 主题规格。
- `knowledges/ux/interaction-patterns.md`: 高可信。划词翻译、popup、options 配置流交互不变；状态反馈保留文字与 `✅` / `❌` 符号。
- `knowledges/ux/accessibility.md`: 中可信。现文档仍引用旧冷色背景 `#1F2937` 和文字 `#F9FAFB`，需要本任务同步为新主题对比度说明。
- `knowledges/ux/prototypes/index.md`: 中可信。当前只有 v0.2 原型，没有 v0.3 visual-theme 高保真原型；本任务按 PRD 与 design-system 约束产出 token，不等待新原型。
- `knowledges/product-wiki/strategy/index.md` 与 `roadmap/index.md`: 高可信。v0.3 的产品美观是增长抓手，主题方向为适度明亮鲜艳、不抢眼，前期保持纯免费与核心翻译体验稳定。

## 代码现状

- CodeGraph 已启用并用于 Step2 结构定位。
- #56 已在 `shared/styles/tokens.css` 定义 shadcn 语义 token，在 `tailwind.config.ts` 中映射 `background`、`foreground`、`primary`、`secondary`、`muted`、`accent`、`destructive`、`success`、`border`、`input`、`ring` 等 Tailwind token。
- `assets/content.css` 单独定义 content iframe/trigger token，包括 `--translator-panel-*`、`--translator-trigger-*`、`--translator-shadow`、`--translator-radius`。
- `entrypoints/popup/App.vue`、`entrypoints/options/App.vue`、`shared/ui/SourceConfigPanel.vue` 与 `shared/ui/components/*` 已使用 Tailwind token 类，如 `bg-background`、`text-foreground`、`bg-primary`、`border-border`、`ring-primary`、`bg-success`、`bg-destructive`。
- 当前 token 值仍偏 #56 冷色基座，例如 `--primary: 215 28% 17%`、`--translator-panel-background: 215 28% 17%`、`--border: 220 13% 91%`，需要替换为最终 v0.3 明亮主题。

## 依赖链元数据

- 并发安全等级: `blocked-by-upstream`
- MR 基线策略: `after-upstream-merged`
- 上游依赖: #56 / PR #58 `UI 设计系统重构 - tailwind/shadcn 基座与全界面迁移`
- 上游状态: 用户提供上下文说明 PR #58 已于 2026-07-08T09:20:14Z 合并到 `master`，当前 `handle-pre-work` 已从 `master` 创建 #57 worktree。
- Stacked MR: 否
- 推荐合并顺序: #56 已合并，#57 现在可从 `master` 创建 PR。
- 依赖契约: `releases/v0.3/2-visual-theme/PRD.md`、`shared/styles/tokens.css`、`tailwind.config.ts`、`shared/ui/components/*`、`knowledges/ux/design-system.md`、`knowledges/ux/interaction-patterns.md`、`knowledges/ux/accessibility.md`。

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| 执行模式 | 默认无人值守 | 用户明确要求按 prodflow-worker 默认无人值守模式推进 | 需求细节无法人工即时确认 | 回滚本任务 PR 或在后续 commit 调整 |
| workspace-rule 来源 | MCP `get_public_documents(names:["workspace-rule"])` 成功获取 | Step1 实际调用成功，未遇到 usage limit | 无 | 如后续 MCP 限额阻塞，按用户注入的 workspace-rule 结果继续并记录 |
| Issue 类型 | 前端开发 Issue | #57 标签含 `前端`、无 `PRD` / `bug` 标签，Issue body 指向 #50 | 无 | 如 Issue 标签变更，重读 Issue 并修正文档 |
| 基础分支 | `master` | 用户指定当前允许 base 分支为 master，MR 策略为 after-upstream-merged 且上游已合并 | master 之后可能有新并发改动 | rebase/merge 最新 master 后重新验证 |
| 主题产出方式 | 集中替换 token，避免逐组件硬编码 | #56 design-system 明确 #57 应替换 token 值；组件已使用语义 token | 个别旧 CSS 可能仍有硬编码残留 | grep 冷色硬编码并补充 token 化 |
| v0.3 原型缺失 | 不等待新原型，按 PRD/UX 规范产出最终 token | 原 PRD 将最终色板交由本任务产出，用户要求继续无人值守 | 视觉细节需后续评审微调 | 调整 token 文档和 CSS 变量即可回滚/迭代 |
| 知识沉淀模式 | 子 agent 模式仅收集待沉淀要点 | 用户硬性要求 Step5b 不调用 `prodflow-knowledge-*` 技能 | 沉淀不会在本 worker 内落库 | 在返回结果中标注「知识沉淀：待补」由协调器统一沉淀 |

## 风险与验证关注

- 新主题必须保持 WCAG AA：正文文本与背景 >= 4.5:1，UI 组件/大号文本 >= 3:1。
- 语义状态不可只靠颜色，仍需保留 `✅` / `❌` / 文案。
- 不能改 provider、storage、message、translator 契约。
- 需要审查旧冷色硬编码残留：`#1F2937`、`#F9FAFB`、`#E5E7EB`、`#D1D5DB`、对应冷色 HSL 片段与不合理 slate/gray token。
- Step6 子 agent 模式不更新 `releases/v0.3/index.md`。

## Step4 实现记录

- 采用 sunlit teal 主题，集中更新 `shared/styles/tokens.css` 与 `assets/content.css`，没有改动划词、popup、options 的交互逻辑。
- `tailwind.config.ts` 新增 `warning` / `info` 语义色 namespace；`Button` 与 `Badge` 增加 warning/info variants，补齐 PRD 要求的语义状态覆盖。
- `shared/ui/__tests__/design-system.test.ts` 先新增失败断言并确认 RED：缺少 warning/info 与最终 token；实现后 GREEN，6 个测试通过。
- `knowledges/ux/design-system.md` 与 `knowledges/ux/accessibility.md` 已更新最终 token、状态映射与 WCAG AA 对比度验证。
- 冷色残留检查：旧 hex `#1F2937/#F9FAFB/#E5E7EB/#D1D5DB/#DC2626/#16A34A` 无命中；旧冷色 HSL 片段 `215 28% 17%/210 20% 98%/220 13% 91%/220 13% 84%/217 19% 27%` 无命中。
- 验证结果：`pnpm typecheck` 通过；`pnpm lint` 通过；`pnpm build` 在 sandbox 下因 `spawn EPERM` 失败，权限升级后通过；`pnpm e2e` 权限升级后通过，7 个 Playwright 用例全部通过。
- 子 agent 模式约束：已确认 `git diff -- releases/v0.3/index.md` 为空，未更新迭代主文档。

## Step5 审查与测试记录

- 代码审查结论：实现覆盖 PLAN 全部任务，主要改动集中于 token、语义 variant、UX 文档和 design-system 单测；未发现 provider、storage、message、translator 契约变更。
- UX 审查结论：主题应用遵循 PRD 的“适度明亮鲜艳、不抢眼”；content 浮层保留深色不透明背景；错误/成功/警告语义仍要求文字或符号辅助。
- Fresh verification：`pnpm typecheck` 通过；`pnpm lint` 通过；`pnpm build` 权限升级后通过；`pnpm e2e` 权限升级后 7/7 通过；`vitest run` 权限升级后 9 个测试文件、149 个测试通过；`git diff --check` 无错误。

## 待沉淀知识

### context: v0.3 sunlit teal 主题 token

- Issue ID: #57
- 概念名: v0.3 sunlit teal visual theme
- 定义: LLM Translator v0.3 的最终明亮鲜艳主题，以深青绿色主色、暖白背景、珊瑚浅强调、绿色/红色/琥珀/蓝色语义色构成，所有 UI 表面通过 CSS 变量和 Tailwind 语义 token 应用。
- 影响范围: popup、options、SourceConfigPanel、shadcn-vue 本地基础组件、划词触发按钮、iframe 翻译浮层、UX 规范。
- 相关文件: `shared/styles/tokens.css`、`assets/content.css`、`tailwind.config.ts`、`shared/ui/components/button/Button.vue`、`shared/ui/components/badge/Badge.vue`、`knowledges/ux/design-system.md`、`knowledges/ux/accessibility.md`。
- 建议沉淀路径: `knowledges/context/system/design-token-theme.md` 或纳入现有 UX 设计系统知识。

### adr: token-first 主题改造策略

- Issue ID: #57
- 决策标题: v0.3 visual-theme 使用集中 token 替换而非逐组件改色
- 背景: #56 已完成 tailwind/shadcn/token 基座迁移，#57 需要替换主题色板并覆盖全应用，同时避免改动交互和业务契约。
- 方案与取舍: 选择集中更新 `shared/styles/tokens.css`、`assets/content.css` 和 Tailwind 语义映射，少量扩展 warning/info variant；放弃逐组件硬编码改色，降低视觉不一致和回滚成本。
- 相关文件: `releases/v0.3/issue-57/DESIGN.md`、`shared/styles/tokens.css`、`assets/content.css`、`tailwind.config.ts`。
- 建议沉淀路径: `knowledges/adr/002-token-first-visual-theme.md`。
