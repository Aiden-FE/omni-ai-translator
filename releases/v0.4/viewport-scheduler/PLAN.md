# PLAN: 视口判定与 IntersectionObserver 调度工具

> 版本 v0.4 · 全文翻译 · translate-pool 视口工具

## 执行清单

- [x] 1. 设计：DESIGN.md（架构、数据契约、关键约定、边界与风险）
- [x] 2. TDD 红：写 `shared/fullpage/translate-pool.test.ts` 新增视口工具测试
  - `isSegmentInViewport`：jsdom 兜底（`getClientRects` 空 → true）、扩展注入元素兜底、几何判定（顶/底/左/右四种边界）
  - `createViewportObserver`：无 IO 环境降级（observe 立即 onEnter）、有 IO 环境 mock IO → observe → 触发 onEnter + 自动 unobserve、unobserve 幂等、disconnect 幂等、disconnect 后 observe 不触发 onEnter
- [x] 3. TDD 绿：实现 `shared/fullpage/translate-pool.ts` 顶部视口工具
  - `isSegmentInViewport(seg)`：jsdom/扩展注入短路 + 几何判定
  - `createViewportObserver(onEnter)`：内部 `Map<Element, SegmentRecord>` + 单 IO；环境守卫
  - `ViewportObserver` 接口导出
- [x] 4. 验证：vitest 全量测试通过（新增 19 + 既有 translate-pool 11 + 全量 372 测试无回归）
- [x] 5. 验证：vue-tsc typecheck 通过（无新增类型错误）
- [x] 6. 验证：eslint 通过
- [x] 7. 文档：CHANGELOG.md

## 接口依赖

- **消费**：`shared/fullpage/types.ts`（`SegmentRecord`）
- **产出**：`isSegmentInViewport(seg)` / `createViewportObserver(onEnter)` / `ViewportObserver` 三个导出项
- **下游**：t5 编排器集成（后续任务）—— 在调用 `runPool` 前按视口分组，调用 `createViewportObserver` 等视口外段进入

## 关键约定（设计权衡）

- **视口判定用快照式**：不监听滚动，与"启动时先入池视口内段"语义一致。编排器在 start 入口做一次快照，IO 接管后续视口外段。
- **`IntersectionObserver` 配置**：`{ root: null, rootMargin: '0px', threshold: 0 }` —— 严格视口边界，最早触发（任何像素进入即触发）。
- **`onEnter` 一次性**：进入视口后立即 `unobserve`，避免重复触发（不重复入池）。
- **环境守卫**：jsdom 无 `IntersectionObserver` → 退化为「`observe` 立即同步调用 `onEnter`」，与"视口外段直接全部入池"原行为一致。
- **幂等性**：`observe(seg)` 重复注册不重复 observe；`unobserve(seg)` 未注册也安全；`disconnect()` 重复调用安全。
- **未改 `runPool`**：编排器在调用前完成分组，分组逻辑不属于本任务。

## 测试覆盖矩阵

### `isSegmentInViewport`

| 场景 | mock | 期望 |
|------|------|------|
| jsdom 兜底（`getClientRects` 空） | 默认 | `true` |
| `window.innerHeight === 0` | `Object.defineProperty(window, 'innerHeight', { value: 0 })` | `true` |
| `window` 未定义 | （jsdom 不会触发，仅类型守卫） | 类型层防御 |
| 段是扩展注入元素（`closest('[data-llm-translator]')` 非空） | mock `closest` | `true` |
| 完全在视口内 | `getBoundingClientRect → {top:100, bottom:200, left:50, right:150}` + jsdom 提前调整 innerHeight | `true` |
| 完全在视口下方 | `getBoundingClientRect → {top:2000, bottom:2100}` | `false` |
| 完全在视口上方 | `getBoundingClientRect → {top:-200, bottom:-100}` | `false` |
| 左侧越界 | `{left:-100, right:50}` | `false` |
| 右侧越界 | `{left:1500, right:1600}` | `false` |
| 与视口边缘相切（top === innerHeight） | 边界条件 | `false`（top < innerHeight 严格小于） |

### `createViewportObserver`

| 场景 | mock | 期望 |
|------|------|------|
| jsdom 无 `IntersectionObserver` | 不 mock | `observe(seg)` 立即同步调 `onEnter(seg)` |
| 模拟 IO：observe 后触发 isIntersecting | mock `IntersectionObserver` | `onEnter` 被调用 + `unobserve` 被调用（元素从内部 map 移除） |
| 模拟 IO：非相交不触发 | mock | `onEnter` 不被调用 |
| 重复 `observe(seg)` 不重复触发 | mock | 内部 IO 仍只 observe 一次；onEnter 在第一次相交时调一次 |
| `unobserve(seg)` 幂等（已注册/未注册） | mock | 不报错 |
| `disconnect()` 幂等（多次调用） | mock | 不报错 |
| `disconnect()` 后 `observe(seg)` 不触发 onEnter | mock | 观察器已断开，新 observe 不被注册 |
| `onEnter` 抛错不破坏观察器 | mock | 错误传播；后续 observe 仍可用 |

## 关键文件

- `shared/fullpage/translate-pool.ts`（修改）
- `shared/fullpage/translate-pool.test.ts`（修改）
- `releases/v0.4/viewport-scheduler/DESIGN.md`（新增）
- `releases/v0.4/viewport-scheduler/PLAN.md`（本文件）
- `releases/v0.4/viewport-scheduler/CHANGELOG.md`（完成时编写）
