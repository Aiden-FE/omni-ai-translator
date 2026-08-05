# CHANGELOG: 编排器按视口分组调度与清理 IO

> 任务：83a350c8-48b5-4875-b7a2-8f97e90f13af
> 迭代：v0.4.0
> 日期：2026-08-03

## 新增

### `shared/fullpage/orchestrator.ts`

- 引入 `isSegmentInViewport` 与 `createViewportObserver`（来自 t2 任务产出的 `translate-pool.ts` 顶部视口工具）。
- 新增模块级 `viewportObserver: ViewportObserver | null` 句柄 — 同一 active 会话共享；`doStart` 入口 disconnect 旧句柄（避免跨会话残留段监听）。
- 新增内部函数 `enqueueSegments(segs, generation)`：markLoading + updateProgress + runPool（含 onSettled 闭包 + isActive generation 校验）。供 `doStart` 视口内段、IO onEnter 单段入池、增量翻译视口内段全部走同一路径。
- 新增内部函数 `createViewportEnterObserver(generation)`：基于 `createViewportObserver` 封装，onEnter 内调 `enqueueSegments([seg], generation)`；try/catch 隔离异常不破坏状态机。
- 改写 `doStart`：
  - 入口先 `viewportObserver?.disconnect(); viewportObserver = null;` 清理上一会话。
  - 拆分 `records` 为 `inView` / `outOfView`（用 `isSegmentInViewport`）。
  - 视口外段立即 `markSegmentsLoading(outOfView)` + `updateProgress()`，确保工具栏 `0/total` 立即反映全部段（含视口外）。
  - 视口内段走 `await enqueueSegments(inView, generation)`。
  - 视口外段：若非空则 `viewportObserver = createViewportEnterObserver(generation)` 并对每段 `observer.observe(seg)`。
- 改写 `flushAddedNodes`：增量段按视口分组；视口内走 `enqueueSegments`；视口外 markLoading + 挂入同一 `viewportObserver` 句柄（若不存在则创建）。
- `handleRestore` 末尾追加 `viewportObserver?.disconnect(); viewportObserver = null;`。
- `__reset` 末尾追加 `viewportObserver?.disconnect(); viewportObserver = null;`。
- `handleRetry` 不变（重试只重跑 failed 段，不重新分视口）。

### `shared/fullpage/orchestrator.test.ts`

新增 9 个视口分组调度单元测试（jsdom），覆盖：

| # | 测试 | 验证内容 |
|---|---|---|
| 1 | jsdom 兜底路径下视口外段立即入池（onEnter 同步触发） | jsdom 无 IO 时降级路径与原行为一致 |
| 2 | mock IO 不触发相交时视口外段仍 markLoading 且不调用 sendMessage | 生产环境路径：视口外段只 loading 不入池 |
| 3 | IO 触发相交后视口外段入池并渲染 | 滚动进入后入池的完整链路 |
| 4 | 视口外段立即显示 loading 并计入总进度（jsdom 兜底） | 工具栏进度 N/total 立即正确 |
| 5 | handleRestore 调用 viewportObserver.disconnect | 清理 IO 句柄（disconnectCalls = 1） |
| 6 | `__reset` 调用 viewportObserver.disconnect | 清理 IO 句柄（disconnectCalls = 1）+ 重复 reset 幂等 |
| 7 | 增量翻译视口外段加入同一 viewportObserver（jsdom 兜底） | flushAddedNodes 共享句柄 |
| 8 | doStart 二次触发时 disconnect 旧 viewportObserver | handleRestore 路径下旧 IO 已被清理、新 IO 创建 |
| 9 | doStart 二次触发时清理上一会话 viewportObserver（兜底路径） | __reset 极端路径下 IO 句柄清理 |

## 设计决策

- **共享 `viewportObserver` 句柄**：`doStart` 与 `flushAddedNodes` 使用同一 `viewportObserver` 句柄；`doStart` 入口先 `disconnect` 旧句柄（防跨会话残留段监听），同一会话内增量翻译复用句柄无需重建。
- **提取 `enqueueSegments` vs 内联重复**：所有派发路径（`doStart` 视口内 / IO onEnter 单段 / 增量视口内）共享同一"入池 + settle + 渲染"逻辑，避免 4 处重复闭包。
- **视口外段 `markLoading` 立即调用**：`doStart` / `flushAddedNodes` 拆分后立即 markLoading + updateProgress，确保工具栏 `0/total` 含视口外段（loading 状态计入 total）。
- **`onEnter` 错误隔离**：try/catch 在编排器侧，IO 内部 map 仍由 t2 保证出列逻辑先于回调（参考 t2 文档）。
- **不修改 `handleRetry`**：重试只重跑 failed 段，不重新分视口（failed 段原本在视口内就走过入池，重试仅恢复状态后重新派发）。
- **提取 `createViewportEnterObserver(generation)` 工厂**：doStart 与 flushAddedNodes 复用同一观察器创建逻辑，避免重复闭包。

## 关键约定

- 视口内段与视口外段共享同一 `sessionGeneration`：IO 进入后 `runPool` 的 `isActive` 校验保证 restore/restart 后不再渲染。
- 视口外段派发时单段 `runPool([seg], ...)`：`concurrency=3` 仍可工作（只有 1 段不浪费），且走相同的 `onSettled` 渲染路径。
- `updateProgress` 在拆分后立即调用，确保工具栏 `N/total` 反映全部段（含视口外）。

## 边界与风险

- **`IntersectionObserver` 在浏览器扩展 content script 中可用**（标准 Web API），manifest 不需新增权限。
- **同一 `viewportObserver` 句柄跨 `doStart` / `flushAddedNodes` 复用**：每次 `doStart` 前先 disconnect 旧句柄，避免重复 observe。
- **视口外段被用户滚动到视口前一直显示 spinner**；若用户长时间不滚动，体验上仍是"loading"——这是预期行为，比立即全部入池节省 LLM 调用。
- **jsdom 单测中 IO 不存在**：t2 的兜底保证视口外段也立即入池（行为同改造前）；新增 mock IO 测试覆盖生产环境路径（视口外段只 markLoading、不入池）。

## 验证（实际运行）

- `bash ./run-vitest.sh` — 全量 381 个单测通过：基线 372 + 本任务在 `shared/fullpage/orchestrator.test.ts` 新增 9 个视口分组测试（编排器从 26 → 35）；其它 15 个测试文件 346 个无回归。
- `PATH=node_modules/.bin:$PATH vue-tsc --noEmit` — typecheck 通过。
- `PATH=node_modules/.bin:$PATH eslint . --ext .ts,.vue` — lint 通过。
- `PATH=node_modules/.bin:$PATH wxt build` — Chrome MV3 build 成功（fullpage.js 31.57 kB，无增长因视口分组是控制流改造）。

## 不在本任务范围

- 视口判定阈值与滚动节流（t2 已确定快照式，不监听滚动）。
- 大页面（上千段）视口分批收集（v0.4 同步收集，后续可优化为 requestIdleCallback 分片）。
- 视口分组 e2e：e2e fixture 段均位于视口内，行为与原代码一致（全部入池），e2e 套件无需修改。

## 知识沉淀

本次任务产出已沉淀为长期知识（合并到既有 `feature:fullpage:orchestrator` 知识与 `feature:fullpage:segmenter-pool` 知识的「编排器集成约定」节）：

| 知识 ID | 类型 | 复用场景 |
|---|---|---|
| `feature:fullpage:orchestrator` | feature | 编排器在 `doStart` / `flushAddedNodes` 按视口分组调度：视口内段走 `enqueueSegments`（runPool 共享入池路径）、视口外段挂同一 `viewportObserver` 句柄，IO 进入后单段入池；`handleRestore` / `__reset` 末尾 disconnect 句柄并置 null；同一会话复用句柄，`doStart` 入口 disconnect 旧句柄防跨会话泄漏。 |
| `feature:fullpage:segmenter-pool` | feature | 编排器集成约定新增条款：派发路径共享 `enqueueSegments` 函数（markLoading + updateProgress + runPool）；onEnter 异常由编排器侧 try/catch 隔离；`disconnect` 是终态语义。 |

- 沉淀文件：`docs/knowledge/feature/fullpage-orchestrator.md`（在既有 v0.4.0 内容上新增「视口分组调度与 IO 清理」小节 + 接口依赖扩展 + 来源证据扩展）
- 索引同步：可后续更新 `docs/knowledge/feature/index.md` 增加视口分组关键词。

### 复用场景

1. **视口分组调度模式**：后续实现其他按需 lazy load 型 content script 功能（图片懒加载翻译、评论懒加载、模块懒挂载），可复用「`isSegmentInViewport` 快照式分组 + `IntersectionObserver` 进入即出列 + 共享 enqueue 路径」模式。
2. **enqueueSegments 抽象**：任何「收集元素 → markLoading → runPool → render」管线可复用同一共享内部函数，避免 4 处重复闭包。
3. **viewportObserver 共享句柄 + 入口 disconnect**：所有「跨多个函数（start / flush / retry）共享的 IO 类组件」可复用「共享句柄 + 入口先 disconnect 旧实例」模式，避免跨会话泄漏。
4. **onEnter 错误隔离**：复用「try/catch 在编排器侧 + IO 内部出列逻辑先于回调」模式，IO 内部 map 保持一致 + 状态机不被破坏。
5. **disconnect 是终态**：所有「需二次触发清理」的 IO 类组件可复用「`disconnect` 后 `observe` 是 no-op + 需继续观察创建新实例」语义（与 t2 约定一致）。
