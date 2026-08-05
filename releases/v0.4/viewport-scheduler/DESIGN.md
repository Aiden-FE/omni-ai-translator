# DESIGN: 视口判定与 IntersectionObserver 调度工具

> 版本 v0.4 · 全文翻译 · translate-pool 视口工具

## 总体架构

在 `shared/fullpage/translate-pool.ts` 内部新增两个工具函数，**不**修改 `runPool` / `retrySegments` 的核心签名。视口分组由编排器在调用 `runPool` 之前完成（视口内段优先派发；视口外段进入 IO 队列，等进入视口后再入池）。

- `isSegmentInViewport(seg)`：快照式判定，使用 `getBoundingClientRect()` + `window.innerHeight`/`innerWidth` 计算。
- `createViewportObserver()`：基于 `IntersectionObserver`（`rootMargin: '0px'`, `threshold: 0`）封装视口外段观察器，进入视口时调用 `onEnter(seg)` 并自动 `unobserve`。

## 受影响文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `shared/fullpage/translate-pool.ts` | 修改 | 顶部新增 `isSegmentInViewport` + `createViewportObserver` 工具 |
| `shared/fullpage/translate-pool.test.ts` | 修改 | 新增视口工具单元测试（jsdom mock） |

`runPool` / `retrySegments` 函数体不变；编排器在调用 `runPool` 之前完成视口内外分组。

## 数据契约

### `isSegmentInViewport(seg: SegmentRecord): boolean`

**返回 `true` 的条件**（按优先级短路）：

1. **jsdom 兜底**：`typeof window === 'undefined' || window.innerHeight === 0` → 视为视口内（jsdom 无布局，避免把全部段误判为视口外导致整页拖入 IO 队列）。
2. **`getClientRects().length === 0`** → 视为视口内（jsdom 同样恒空，与既有的可见性兼容路径一致）。
3. **`el.closest('[data-llm-translator]')` 非空** → 视为视口内（注入元素不应成为段，但作为防御：避免将扩展产物误判为视口外）。
4. **几何判定**：`rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0` → 视口内；否则视口外。

> 注意：jsdom 单测中 `getClientRects` 恒空（第 2 条）已先于几何判定短路，jsdom 下所有段都被视为视口内——与"启动时全部入池"原行为一致。

### `ViewportObserver` 接口

```typescript
export interface ViewportObserver {
  /** 注册分段到观察器。重复注册同一 seg 幂等（不会重复 observe）。 */
  observe(seg: SegmentRecord): void;
  /** 注销分段。重复/未注册 seg 幂等。 */
  unobserve(seg: SegmentRecord): void;
  /** 断开观察器并清空内部映射。重复调用安全。 */
  disconnect(): void;
}
```

### `createViewportObserver(onEnter: (seg: SegmentRecord) => void): ViewportObserver`

- 内部维护 `Map<Element, SegmentRecord>`（seg.el → seg）+ 单个 `IntersectionObserver`（`{ root: null, rootMargin: '0px', threshold: 0 }`）。
- IO callback 命中（`entry.isIntersecting === true`）时：从 map 取 `seg`，调用 `onEnter(seg)`，并 `unobserve(seg)`（一次性进入即出列）。
- **环境守卫**：`typeof IntersectionObserver === 'undefined'` 时返回「no-op 观察器」——`observe(seg)` 立即同步调用 `onEnter(seg)`。这与"视口外段直接全部入池"行为一致（jsdom 等无 IO 环境安全降级）。
- `disconnect` 必须幂等：恢复原文 / 二次触发时重复调用安全。

### `disconnect` 行为

- 调 `observer.disconnect()`（若已存在）。
- 清空 `Map`。
- `isAlive = false`。
- 后续 `observe()` 在 `isAlive === true` 时仍可工作（重新创建 IO），以避免"disconnect 后又来新段"的常见竞态。但任务规约要求"disconnect 必须幂等"，未要求"disconnect 后还能 observe"——为简化语义，**`disconnect` 后 `observe` 是 no-op**（不重新创建 IO）。编排器如需继续观察，应创建新实例。

## 实施步骤

1. 在 `translate-pool.ts` 顶部新增 `isSegmentInViewport` 函数实现：
   - 优先用 `getBoundingClientRect()`；
   - jsdom 守卫：`typeof window === 'undefined' || window.innerHeight === 0` → `true`；
   - 扩展注入守卫：`el.closest('[data-llm-translator]')` 非空 → `true`。
2. 新增 `ViewportObserver` 类型导出。
3. 新增 `createViewportObserver(onEnter)`：内部 `Map<Element, SegmentRecord>` + 单 `IntersectionObserver`；callback `entry.isIntersecting` 时调用 `onEnter(seg)` 并 `unobserve`。
4. 不改动 `runPool` / `retrySegments` 的循环逻辑；视口拆分由编排器在调用 `runPool` 前完成。

## 关键约定

- 视口判定用快照式（不监听滚动），与"启动时先入池视口内段"一致。
- `IntersectionObserver` 仅用于视口外段：视口内段不会进入 IO 监听，避免无意义的 observe 调用。
- `disconnect` 必须幂等：恢复原文 / 二次触发时重复调用安全。
- **环境守卫**：`typeof IntersectionObserver === 'undefined'` 时（如 jsdom）退化为「立即视为已进入视口」（即视口外段直接全部入池，与原行为一致）。

## 边界与风险

- **jsdom 单测**：`IntersectionObserver` 不存在 — `createViewportObserver` 内部用 `typeof IntersectionObserver !== 'undefined'` 守卫；缺失时 `observe(seg)` 同步调用 `onEnter(seg)`，与原行为一致。
- **视口判定对 `position: fixed` 元素（如工具栏、loading 标记）会误判"在视口内"**：判定时跳过 `el.closest('[data-llm-translator]')` 的元素（这些是扩展注入的，不会是 seg.el）。
- **`runPool` 输入数组顺序决定派发顺序**：编排器必须先按视口内外分组再分别 `runPool` 两次（先视口内，再启动 IO 等视口外进入）。
- **段已脱离 DOM**（`el.isConnected === false`）：`getBoundingClientRect()` 仍返回 0 矩形，几何判定会判定为视口外。这种段对增量翻译无意义，但理论上不应在编排器视口分组时还保留——此处不专门加守卫（编排器 `el.isConnected` 检查在前）。
- **map 同步**：`observe(seg)` 写入 map；`unobserve(seg)` 从 map 删除；IO callback 仅在 `entry.target` 对应 map 项时触发 `onEnter`（避免 callback 触发时 seg 已被 unobserve 仍误入池）。

## 不在本任务范围

- 编排器实际按视口分组调用 `runPool`（编排器集成需后续任务）。
- 视口判定与滚动节流：本任务为快照式，不监听滚动。
- `runPool` 视口感知：核心签名不变。
