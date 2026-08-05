# CHANGELOG: 实现视口判定与 IntersectionObserver 调度工具

> 任务：b44e13a3-8043-41ed-9b27-06c9ee383404
> 迭代：v0.4.0
> 日期：2026-08-03

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

## 验证（实际运行）

- `npx vitest run` — 19 个新增单元测试通过；translate-pool 既有 11 个测试无回归。
- `npx vue-tsc --noEmit` — 通过。
- `npx eslint . --ext .ts,.vue` — 净。

## 不在本任务范围

- 编排器实际按视口分组调用 `runPool`（编排器集成需后续任务）。
- 视口判定与滚动节流：本任务为快照式，不监听滚动。
- `runPool` 视口感知：核心签名不变。

## 知识沉淀

本次任务产出已沉淀为长期知识（合并到既有 `feature:fullpage:segmenter-pool` 知识）：

| 知识 ID | 类型 | 候选映射 | 复用场景 |
|---|---|---|---|
| `feature:fullpage:segmenter-pool` | feature | candidate #0 | 后续编排器集成任务（t5）按视口分组时需遵循：`isSegmentInViewport` 的 jsdom 双兜底（`getClientRects` 空 / `innerHeight === 0`）与严格不等式几何判定；`createViewportObserver` 的无 IO 降级（`observe` 同步触发 `onEnter`）、一次性进入即 `unobserve`、`disconnect` 后 `observe` 为 no-op 的生命周期约定；编排器须先按视口分组再分别 `runPool`。同时为全文翻译相关 e2e/单测编写提供兜底与幂等约定参考，避免 jsdom 误判或 IO 重复入池。 |

- 沉淀文件：`docs/knowledge/feature/fullpage-segmenter-pool.md`（在既有 t2/t3 内容上新增"视口判定与 IntersectionObserver 调度工具"小节 + 编排器集成约定 + 接口依赖扩展 + 来源证据扩展）
- 索引同步：`docs/knowledge/feature/index.md`（feature 分类索引条目已补充视口工具关键词）已更新条目。
- 新增关联：`feature:fullpage:orchestrator`（编排器是视口工具的消费者；编排器状态机需在视口工具集成时增加 `observer.disconnect` 守卫与 `onEnter` 异常隔离）。

### 复用场景

1. **编排器视口分组集成**（feature:fullpage:segmenter-pool「视口判定与 IO 调度工具」节）：t5 编排器在 `start` 入口对 `records` 调 `isSegmentInViewport` 拆为视口内/视口外两组；视口内先 `runPool`、视口外全部 `observer.observe(seg)`；IO 命中后 `onEnter` 内部调 `runPool` 入池（带 generation 守卫，参考编排器范式 4「会话身份与元素连接双重校验」）。
2. **jsdom 单测兜底约定**：视口工具在 jsdom 下走双兜底路径（`getClientRects` 空 + `innerHeight === 0`），所有段视为视口内。编写后续全文翻译相关单测时，无需为视口判定场景额外 mock `getBoundingClientRect`，仅需在需严格区分视口内外时显式 `Object.defineProperty(window, 'innerHeight', ...)`。
3. **IO 一次性进入模式**：后续实现其他"按需 lazy load"型 content script 功能（如图片懒加载翻译、评论懒加载）时，可复用「`IntersectionObserver` + 内部 `Map` + 进入即 `unobserve` + 兜底同步触发」模式。
4. **`disconnect` 终态语义**：任何需"二次触发清理"的 IO 类组件，可复用「`disconnect` 后 `observe` 为 no-op + 需继续观察创建新实例」语义，避免半断开状态下状态混乱。
5. **onEnter 异常隔离**：复用「出列逻辑先于回调执行」模式，即使回调抛错也能保证 IO 内部 map 与监听集合一致；调用方需 try/catch 回调内部异常。
