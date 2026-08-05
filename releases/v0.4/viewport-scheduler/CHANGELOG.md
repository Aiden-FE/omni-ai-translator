# CHANGELOG: 视口判定与 IntersectionObserver 调度工具

> 版本 v0.4 · 全文翻译 · translate-pool 视口工具

## 新增

### `shared/fullpage/translate-pool.ts` 顶部视口工具

- `isSegmentInViewport(seg: SegmentRecord): boolean` — 快照式判定分段是否在视口内。
  - 短路优先级：
    1. jsdom / SSR 兜底：`typeof window === 'undefined' || window.innerHeight === 0` → `true`
    2. `getClientRects().length === 0` → `true`（jsdom 同样恒空，与既有可见性兼容路径一致）
    3. `el.closest('[data-llm-translator]')` 命中 → `true`（防御性：扩展注入元素不应是 seg.el）
    4. 几何判定：`rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0`
  - 边界条件：边界相切（`top === innerHeight` 或 `bottom === 0`）视为视口外（严格不等）。
- `ViewportObserver` 接口：`{ observe(seg), unobserve(seg), disconnect() }`。
- `createViewportObserver(onEnter): ViewportObserver` — 基于 `IntersectionObserver` 封装（`root: null`, `rootMargin: '0px'`, `threshold: 0`）。
  - 内部维护 `Map<Element, SegmentRecord>` + 单个 IO；`observe(seg)` 注册到 IO；相交命中（`isIntersecting === true`）时调用 `onEnter(seg)` 并 `unobserve`（一次性进入即出列）。
  - 幂等性：`observe` 重复注册不重复注册到 IO；`unobserve` 未注册或重复注销安全；`disconnect` 多次调用安全。
  - `disconnect` 后 `observe` 是 no-op（不重新创建 IO），符合"恢复原文 / 二次触发清理"语义。
  - 环境兜底：`typeof IntersectionObserver === 'undefined'`（如 jsdom）时返回降级观察器，`observe(seg)` 同步调用 `onEnter(seg)`，与"视口外段直接全部入池"原行为一致。
  - `onEnter` 抛错时元素仍被 unobserve（出列逻辑先于回调执行），错误传播给调用方。

### `shared/fullpage/translate-pool.test.ts`

- 19 个新增单元测试（jsdom），覆盖：
  - `isSegmentInViewport`：jsdom 兜底（`getClientRects` 空 → true）、`innerHeight === 0` 兜底、扩展注入元素兜底、完全在视口内/上/下/左/右外、严格边界相切（top === innerHeight、bottom === 0）
  - `createViewportObserver`：无 IO 环境降级（`observe` 立即同步触发 `onEnter`）、有 IO 环境 observe→相交触发 onEnter 并自动 unobserve、非相交不触发、重复 observe 幂等、unobserve 未注册/重复幂等、disconnect 多次幂等、disconnect 后 observe 不触发、onEnter 抛错时元素仍被 unobserve、IO 创建参数（rootMargin='0px'、threshold=0）

## 设计决策

- **快照式判定**（不监听滚动）：与"启动时先入池视口内段"语义一致。编排器在 start 入口做一次快照，IO 接管后续视口外段。
- **不修改 `runPool` / `retrySegments` 核心签名**：编排器在调用 `runPool` 之前完成"视口内先入池 / 视口外挂 IO 观察"的拆分；视口分组逻辑不属于本任务。
- **`onEnter` 一次性**：进入视口后立即 `unobserve`，避免重复触发（不重复入池）。
- **环境兜底**：jsdom 无 `IntersectionObserver` → `observe` 立即同步调 `onEnter`，与原行为一致。
- **`disconnect` 语义**：仅本实例失效，不重新创建 IO。编排器如需继续观察，应创建新实例（明确生命周期边界）。
- **onEnter 错误处理**：出列逻辑（`elToSeg.delete` + `io.unobserve`）先于 `onEnter` 调用执行，即使 `onEnter` 抛错元素仍正确出列；错误传播给调用方，调用方负责 try/catch（编排器层面需保证 `onEnter` 内部异常不破坏状态机）。

## 不在本任务范围

- 编排器实际按视口分组调用 `runPool`（编排器集成需后续任务）。
- 视口判定与滚动节流：本任务为快照式，不监听滚动。
- `runPool` 视口感知：核心签名不变。
