# feat(#56): 引入 UI 设计系统基座并迁移界面

## 变更摘要

- 引入 tailwindcss + shadcn-vue 相关依赖与 WXT 构建接入，新增 design token / CSS 变量体系。
- 新增本地基础 UI 组件，并迁移 popup、options、SourceConfigPanel、content trigger 与 iframe 翻译浮层到 token 驱动样式。
- 更新 `knowledges/ux/design-system.md`，为 #57 后续主题替换提供 token 边界。

## 验证结果

- `pnpm test shared/ui/__tests__/design-system.test.ts`：先 RED 后 GREEN，最终 4 tests passed。
- `pnpm test`：9 个测试文件，147 tests passed。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm build`：通过。
- `pnpm e2e`：首次因 Playwright Chromium 未安装失败；安装浏览器并清理 stale `__dirlock` 后重跑通过，7 tests passed。
- `git diff --check`：通过，仅 Windows CRLF 提示，无 whitespace error。

## 影响与回滚

- 不变更 storage schema、typed message、translator adapter、provider 数据结构或浏览器权限。
- 若 tailwind v4/WXT 兼容性后续出现问题，可回退到 tailwind v3 + PostCSS；业务行为集中保留在现有 Vue 组件与共享契约中。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #49 https://github.com/Aiden-FE/llm-translator/issues/49 |
| PRD 文档 | `releases/v0.3/1-ui-rewrite/PRD.md` |
| 版本号 | `v0.3` |
| 里程碑 | `v0.3` |
| DESIGN | `releases/v0.3/issue-56/DESIGN.md` |
| PLAN | `releases/v0.3/issue-56/PLAN.md` |
| CHANGELOG | `releases/v0.3/issue-56/CHANGELOG.md` |
| 验收标准 | `releases/v0.3/1-ui-rewrite/PRD.md` 的验收标准；#56 Issue 摘要中的 build/typecheck/lint/e2e 要求 |
| UX 规范 | `knowledges/ux/design-system.md`; `knowledges/ux/interaction-patterns.md`; `knowledges/ux/accessibility.md` |
| 视觉原型 | `knowledges/ux/prototypes/index.md` |
| 知识沉淀 | 知识沉淀：待补。context: v0.3 UI design token 基座；adr: tailwindcss v4 + @tailwindcss/vite + 本地 shadcn-vue 组件；feature: UI 设计系统与配置界面迁移；runbook: pnpm 与 Playwright e2e 环境处理 |
| 并发安全等级 | `parallel-safe` |
| MR 基线策略 | `base-branch` |
| 上游 Issue/MR | 无 |
| 基线分支 | `master` |
| 推荐合并顺序 | 先 #56，再 #57 |
| Stacked MR | 否 |
| 依赖契约或接口文档 | `releases/v0.3/1-ui-rewrite/PRD.md`; `knowledges/ux/design-system.md`; `knowledges/ux/interaction-patterns.md`; `knowledges/ux/accessibility.md` |
