# CHANGELOG: 实现页面分段收集器与带缓存的并发翻译池

> 版本: v0.4.0 | 任务: 490531ee-e42e-4af7-a4b3-e75e3712c1a4

## 新增

- `shared/fullpage/types.ts`：全文翻译领域类型（SegmentStatus、SegmentRecord、SegmenterOptions、TranslatePoolOptions、TranslatePoolResult）。
- `shared/fullpage/segmenter.ts`：`collectSegments(root)` 页面分段收集器。
- `shared/fullpage/translate-pool.ts`：`runPool` / `retrySegments` 带缓存的并发翻译池。
- `shared/fullpage/segmenter.test.ts`：31 例单测（jsdom）。
- `shared/fullpage/translate-pool.test.ts`：11 例单测（mock `browser.runtime.sendMessage`）。

## 修复（相对初稿实现）

- segmenter 遍历不支持 Document / DocumentFragment 根 -> 现支持，`collectSegments(document)` 可遍历全页。
- 文本质量不达标（无字母 / 空 / 非块行内）元素 early-return 阻断递归 -> 改为仅跳过该段创建、继续递归子元素，落实「嵌套允许」。
- 段 id 用 `tagName:preview:childCount` 对重复文本元素碰撞并误去重 -> 改为 DOM 路径 + 文本哈希，保证唯一，并移除去重逻辑。
- translate-pool 结果类型对齐 `TranslateResult` 契约，明确「判 `result.error` 而非仅 try/catch」。

## 验证

- `pnpm vitest run`：200 通过（fullpage 42 = segmenter 31 + translate-pool 11）。
- `pnpm typecheck`（vue-tsc --noEmit）：通过。
- `pnpm lint`（eslint）：净。
- `pnpm build`（wxt build chrome-mv3）：成功。
