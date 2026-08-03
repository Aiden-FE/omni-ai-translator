# PLAN: 实现页面分段收集器与带缓存的并发翻译池

> 版本: v0.4.0 | 任务: 490531ee-e42e-4af7-a4b3-e75e3712c1a4

## 执行计划（TDD 红-绿-重构，每步保持绿色边界）

- [x] 1. **领域类型**：`shared/fullpage/types.ts` 定义 SegmentStatus / SegmentRecord / SegmenterOptions / TranslatePoolOptions / TranslatePoolResult
  - 验证：`vue-tsc --noEmit` 通过
- [x] 2. **RED 测试先行**：
  - `segmenter.test.ts`：嵌套块/行内/隐藏/脚本/纯数字/Document·Fragment 根/重复文本去重/无字母父递归
  - `translate-pool.test.ts`：并发≤3、缓存命中不发请求、`result.error` 失败收集、`signal`/`isActive` 中止、`retrySegments`
  - 验证：`vitest run shared/fullpage` 失败（segmenter 4 例红：Document 根 / Fragment 根 / 重复文本 / 无字母父递归）
- [x] 3. **GREEN segmenter**：
  - `traverse` 支持 Document / DocumentFragment 根递归
  - 文本质量不达标不 early-return，继续递归子元素（嵌套允许）
  - id 改为 DOM 路径 + 文本哈希（唯一），移除弱 id 去重
  - 验证：`vitest run shared/fullpage` 全绿
- [x] 4. **GREEN translate-pool**：
  - 结果类型对齐 `TranslateResult` 契约（判 `result.error`，try/catch 仅兜底连接异常）
  - 验证：`vitest run` / `vue-tsc --noEmit` 通过
- [x] 5. **lint 修复**：移除测试文件未使用 import（`SegmentRecord` / `TranslatePoolOptions`）
- [x] 6. **回归验证**：`vitest run` 200 全过、`vue-tsc --noEmit` 通过、`eslint` 净、`wxt build` 成功
- [x] 7. **任务文档**：DESIGN.md / PLAN.md / CHANGELOG.md / index.md

## 依赖与接口

- 消费：`shared/types.ts`（TranslateResult）、WXT `browser.runtime.sendMessage`（translate 通道）
- 产出给 t3（渲染器）：`SegmentRecord.el` / `textNodes` / `blockHost`、`data-llm-translator` 排除约定
- 产出给 t5（编排器）：`collectSegments` / `runPool` / `retrySegments`、会话级缓存 Map、`isActive` / `signal` 中止

## 环境备注

worktree 内 pnpm/node 工具链可用：`pnpm vitest` / `pnpm typecheck`(vue-tsc) / `pnpm lint`(eslint) / `pnpm build`(wxt) 均直接运行。
