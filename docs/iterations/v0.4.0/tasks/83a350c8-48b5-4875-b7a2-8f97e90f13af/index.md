# 编排器按视口分组调度与清理 IO

任务文档索引。

- [DESIGN.md](DESIGN.md) — 技术设计：视口拆分、enqueueSegments 抽取、viewportObserver 共享句柄与清理约定
- [PLAN.md](PLAN.md) — 实施计划：TDD 红-绿步骤与全量回归（全部完成 ✅）
- [CHANGELOG.md](CHANGELOG.md) — 变更摘要、设计偏差说明、验证证据与遗留项

## 产出代码

- `shared/fullpage/orchestrator.ts`（修改）— 编排器新增视口分组调度与 IO 句柄共享
- `shared/fullpage/orchestrator.test.ts`（修改）— 9 个新增视口分组调度单元测试

## 状态

✅ 完成（2026-08-03）：381 单测全过、`pnpm typecheck`/`pnpm lint`/`pnpm build` 全绿。
