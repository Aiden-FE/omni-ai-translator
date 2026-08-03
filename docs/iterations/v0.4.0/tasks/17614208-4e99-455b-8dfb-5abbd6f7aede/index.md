# 实现全文翻译编排器、content script 入口与增量翻译

任务文档索引。

- [DESIGN.md](DESIGN.md) — 技术设计：编排器状态机、模块级状态、数据契约、增量翻译、关键权衡（含 `fullpage.content.ts` 命名修正标注）
- [PLAN.md](PLAN.md) — 实施计划：TDD 红-绿步骤与全量回归（全部完成 ✅）
- [CHANGELOG.md](CHANGELOG.md) — 变更摘要、设计偏差说明、验证证据与遗留项

## 产出代码

- `shared/fullpage/orchestrator.ts` — 编排器（唯一状态持有者）
- `shared/fullpage/orchestrator.test.ts` — 20 个单元测试
- `entrypoints/fullpage.content.ts` — 独立 content script 入口
