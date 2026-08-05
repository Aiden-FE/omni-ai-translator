# 扩展 e2e 验证视口优先调度与恢复清理

任务文档索引。

## 文档资产

- [DESIGN.md](DESIGN.md) — 技术设计：视口优先调度专用 fixture、新增 2 个 e2e 用例、审查反馈 v2 修订消除假阳性
- [PLAN.md](PLAN.md) — 实施计划（全部完成）
- [CHANGELOG.md](CHANGELOG.md) — 变更摘要、关键决策、边界与风险、v2 TDD-RED 验证证据

## 代码资产

- `e2e/fixtures/fullpage-viewport-test-page.html`（新增）— 视口优先调度专用 fixture（3 视口内 + 6 视口外 + spacer）
- `e2e/fullpage.spec.ts`（修改）— 顶部新增 `viewportTestPageUrl` 常量与 `openTestPageUrl` 函数；新增 2 个用例（共 10 个用例）

## 状态

✅ 完成：原 8 + 新 2 = 10 个 e2e 用例全绿，381 单测全过，typecheck/lint/build 全绿。
