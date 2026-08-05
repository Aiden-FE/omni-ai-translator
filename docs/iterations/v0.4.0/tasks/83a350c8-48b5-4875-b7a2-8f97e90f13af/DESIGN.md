# DESIGN: 编排器按视口分组调度与清理 IO

> 任务 83a350c8-48b5-4875-b7a2-8f97e90f13af · v0.4.0 · shared/fullpage/orchestrator.ts

## 目标

编排器在 `doStart` 与 `flushAddedNodes` 中按视口分组调度段：视口内段直接 `runPool`，视口外段挂入 `IntersectionObserver` 等待滚动进入后再入池。`handleRestore` 与 `__reset` 必须断开观察器，避免泄漏与重复入池。

## 改动范围

唯一改动文件：`shared/fullpage/orchestrator.ts`。
测试文件：`shared/fullpage/orchestrator.test.ts`（追加 6 个新用例覆盖分组调度 + 清理 IO）。

不修改：
- `shared/fullpage/translate-pool.ts`（`isSegmentInViewport` / `createViewportObserver` 已在 t2 落地）
- `shared/fullpage/renderer.ts`
- `shared/fullpage/segmenter.ts`
- `shared/fullpage/toolbar.ts`
- `entrypoints/*`

## 数据契约

新增模块级句柄：
- `viewportObserver: ViewportObserver | null` — 当前 active 会话共享的视口外段观察器；`doStart` 入口 `disconnect` 旧实例（若存在）后按需创建；`flushAddedNodes` 复用同实例（同一会话内不重建）；`handleRestore` 与 `__reset` 必须 `disconnect` 并置 `null`。

`ViewportObserver` 接口来自 t2：`{ observe(seg), unobserve(seg), disconnect() }`，三方法幂等。

## 关键约定

1. **视口拆分时立即 `markLoading`**：视口外段与视口内段同时进入 loading 状态，工具栏进度 `0/total` 立即正确反映全部分段（含视口外）。
2. **`isSessionActive(generation)` 校验**：`viewportObserver.onEnter` 内部走 `runPool` 时仍传 `isActive: () => isSessionActive(generation)`，保证 restore/restart 后晚到回调不渲染。
3. **同一会话复用观察器**：`doStart` 与 `flushAddedNodes` 共享同一 `viewportObserver` 句柄；每次 `doStart` 入口 `disconnect` 旧实例（防止跨会话残留段监听）。
4. **onEnter 内 try/catch**：t2 的 `onEnter` 出列逻辑先于回调，抛错不影响 IO 内部状态，但需在编排器侧 `try/catch` 保证状态机不被破坏。
5. **`disconnect` 终态语义**：参考 t2 文档，断开后 `observe` 是 no-op；恢复/重置后必须创建新实例才可继续观察。

## 实施步骤

1. 引入 `isSegmentInViewport` 与 `createViewportObserver`（`./translate-pool` 已导出）。
2. 新增模块级 `viewportObserver: ViewportObserver | null` 句柄。
3. 提取 `enqueueSegments(segs, generation)`：负责 `markLoading` + `updateProgress` + `runPool`（含 `onSettled` 与 `isActive` 闭包）。供 `doStart` 视口内段、IO onEnter 单段入池、增量视口内段、增量 IO 视口外段进入共享。
4. `doStart` 改写：
   - 拆分 `records` 为 `inView` / `outOfView`（用 `isSegmentInViewport`）。
   - 入口先 `viewportObserver?.disconnect(); viewportObserver = null;` 清理上一会话的 IO。
   - 若 `inView.length > 0` → `await enqueueSegments(inView, generation)`。
   - 若 `outOfView.length > 0` → `markSegmentsLoading(outOfView); updateProgress();`（进度立即反映），然后 `viewportObserver = createViewportObserver({ onEnter: try/catch 包裹的 enqueueSingleSegment })`，循环 `viewportObserver.observe(seg)`。
5. `flushAddedNodes` 同样按视口分组：视口内段走 `enqueueSegments(inViewNew, generation)`；视口外段 `markLoading` + 挂入同一 `viewportObserver`（若存在；否则创建）。若 `viewportObserver` 不存在（视口外段 0 的会话），跳过。
6. `handleRestore` 与 `__reset` 末尾追加：
   ```ts
   viewportObserver?.disconnect();
   viewportObserver = null;
   ```
7. `handleRetry` 不变（仅重跑已 failed 段，按原有入池路径）。

## 关键设计权衡

### 提取 `enqueueSegments` vs 内联重复

`t2` 的 `runPool` 在视口外段"单段入池"时仍走池统一接口（缓存、并发 1、settle 回调），无需新函数 `runSingleSegment`。直接复用 `runPool` 并提取"入池 + settle 回调 + 渲染"为一个共享私有函数 `enqueueSegments`，所有派发路径（`doStart` 视口内 / IO onEnter 单段 / 增量视口内）走同一代码路径。视口外段入池也是 `runPool([seg], ...)`，符合任务规约中"单段也走池的统一接口"。

### onEnter 同步触发与 `void`

`onEnter` 签名 `(seg) => void`。编排器在 `onEnter` 中 `void enqueueSegments([seg], generation).catch(...)`，异常由编排器层面吞掉（不破坏 IO 内部 map，但日志记录）。

### disconnect 顺序

- `doStart` 入口：先 disconnect 旧观察器，再开始新一轮。
- `handleRestore` / `__reset`：与 `stopObserver`（MutationObserver）一起清理。

## 边界与风险

- **jsdom 单测**：`IntersectionObserver` 兜底为同步 `onEnter`，等价于"视口外段立即入池"，与原行为一致；已有测试无需变更。
- **共享句柄**：`doStart` 入口 disconnect 保证二次触发（start 走全新路径）不留旧段监听。
- **`__reset`**：必须 disconnect 防止跨用例泄漏句柄。
- **进度立即反映视口外段**：`updateProgress` 在拆分后立即调用，确保工具栏 `N/total` 包含视口外段（loading 状态）。

## 测试覆盖矩阵

新增 6 个单测（jsdom）：

| # | 场景 | 断言 |
|---|---|---|
| 1 | 视口外段立即显示 loading 并计入总进度 | `markLoading` 调用 + `toolbarText` 含 `N/total` |
| 2 | 视口外段在 jsdom 兜底下入池（IO 降级） | 单段最终 `done` 状态 |
| 3 | `handleRestore` 调用 `disconnect` | mock IO 记录 `disconnect` 计数 ≥ 1 |
| 4 | `__reset` 调用 `disconnect` | 同上 |
| 5 | 增量翻译视口外段加入同一观察器 | 视口外段最终 `done` 状态 |
| 6 | `doStart` 二次触发时 disconnect 旧观察器 | mock IO 记录 `disconnect` 计数 ≥ 2 |
