# CHANGELOG - Issue #57

## 新增功能

- 为 #57 定义 v0.3 最终 sunlit teal 明亮主题 token，覆盖主色、强调色、success/error/warning/info、中性色、边框、输入框、阴影与 focus ring。
- 将 app token 与 content token 同步到 `shared/styles/tokens.css`、`assets/content.css`，覆盖 popup、options、`SourceConfigPanel`、划词触发按钮与 iframe 翻译浮层。
- 在 Tailwind theme 中新增 `warning` 与 `info` 语义色，并为 `Button`、`Badge` 增加对应 variant。
- 扩展 `shared/ui/__tests__/design-system.test.ts`，锁定最终 token 值、content token 与 warning/info 语义映射。

## 文档

- 更新 `knowledges/ux/design-system.md`，落档最终色板、token 命名、状态映射、组件语义与 WCAG AA 对比度验证。
- 更新 `knowledges/ux/accessibility.md`，替换旧冷色背景说明，记录 #57 主题关键对比度结果。
- 新增并维护 `releases/v0.3/issue-57/PRD.md`、`DESIGN.md`、`PLAN.md`、`MEMORY.md`。

## Bug 修复

- 无业务 bug 修复。本任务为视觉主题改造，未修改 provider、storage、message、translator 契约。

## API Changes

- 无 API 变更。

## 破坏性变更

- 无破坏性变更。

## 验证

- `pnpm typecheck` 通过。
- `pnpm lint` 通过。
- `pnpm build` 通过。
- `pnpm e2e` 通过，7 个 Playwright 用例全部通过。
- `vitest run` 通过，9 个测试文件、149 个单元测试全部通过。
- 冷色残留 grep 未发现旧主题 hex 或旧 HSL token 残留。
