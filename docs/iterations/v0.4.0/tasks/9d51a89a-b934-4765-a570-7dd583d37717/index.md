# 编写全文翻译 e2e 用例并扩展 mock server

任务文档索引。

## 文档资产

- [DESIGN.md](DESIGN.md) — 技术设计：mock 扩展契约、fixture 段清单、用例→验收标准映射、触发通道与 flaky 对策
- [PLAN.md](PLAN.md) — 实施计划 s1-s5（全部完成）
- [CHANGELOG.md](CHANGELOG.md) — 变更摘要、关键决策与偏差记录、验证证据

## 代码资产

- `e2e/fixtures/fullpage-test-page.html`（新增）— 全文翻译测试页（9 段，含 `__FAIL__` 与增量按钮）
- `e2e/mock-server.ts`（修改）— 请求计数 / 失败开关 / 300ms 非流式延迟
- `e2e/fullpage.spec.ts`（新增）— 8 个全文翻译 e2e 用例
- `e2e/tsconfig.json`（修改）— types + "chrome"

## 状态

✅ 完成（2026-08-03）：`pnpm e2e` 15 passed、`pnpm typecheck`/`pnpm lint`/`pnpm test`（309 passed）全绿。
