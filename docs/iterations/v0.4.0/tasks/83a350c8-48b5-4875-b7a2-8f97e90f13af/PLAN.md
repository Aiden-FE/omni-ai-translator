# PLAN: 编排器按视口分组调度与清理 IO

> 任务 83a350c8-48b5-4875-b7a2-8f97e90f13af · v0.4.0
> 依赖：t2 (`isSegmentInViewport` + `createViewportObserver` 已在 `shared/fullpage/translate-pool.ts`)

## 任务拆分（红-绿-重构）

### s1 — TDD 红：写失败测试

新增 9 个单测到 `shared/fullpage/orchestrator.test.ts`（最终 s1 落实 9 个而非初版预估 6 个）：

1. **doStart 视口外段立即显示 loading 并计入总进度**（jsdom 兜底）
2. **视口外段最终被翻译完成**（jsdom 兜底 `onEnter` 同步触发）
3. **handleRestore 调用 disconnect**（mock IO 验证 `disconnectCalls ≥ 1`）
4. **__reset 调用 disconnect**（mock IO 验证 `disconnectCalls ≥ 1`）
5. **增量翻译视口外段加入同一观察器**（mock IO 验证 `observe` 注册 + 最终 `done`）
6. **doStart 二次触发时 disconnect 旧观察器**（mock IO 验证 `disconnectCalls ≥ 2`）

实际新增 s1 之后又在 s2 期间为强化覆盖增补的 3 个测试：
7. **mock IO 不触发相交时视口外段仍 markLoading 且不调用 sendMessage**（生产环境路径）
8. **IO 触发相交后视口外段入池并渲染**（完整 IO 链路 + onEnter → enqueueSegments → runPool → render）
9. **doStart 二次触发时清理上一会话 viewportObserver（兜底路径）**（`__reset` 极端路径）

测试钩子复用现有 `__reset` / `__getState` 与 `drainMicrotasks` / `flushObserver` 助手。
为验证 IO 句柄行为，测试用 `vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)` 同 t2 测试。
对"无 IO 兜底"场景（默认 jsdom）使用现有 mock browser + drainMicrotasks 路径。

**预期失败**：`orchestrator.ts` 尚未引入 `isSegmentInViewport` / `createViewportObserver` / `viewportObserver` 句柄，编译期就报 `ReferenceError` 或逻辑断言失败。

### s2 — TDD 绿：实现最小代码

改动 `shared/fullpage/orchestrator.ts`：

1. 引入 `isSegmentInViewport` + `ViewportObserver` + `createViewportObserver`。
2. 新增模块级 `viewportObserver: ViewportObserver | null` 句柄。
3. 提取 `enqueueSegments(segs: SegmentRecord[], generation: number): Promise<void>` 内部函数：
   ```ts
   async function enqueueSegments(segs: SegmentRecord[], generation: number): Promise<void> {
     if (segs.length === 0) return;
     markSegmentsLoading(segs);
     updateProgress();
     await runPool(segs, {
       targetLang,
       concurrency: 3,
       cache,
       onSettled: (seg) => handleSettled(seg, generation),
       isActive: () => isSessionActive(generation),
     });
   }
   ```
4. 改写 `doStart`：
   ```ts
   // 入口先清旧观察器
   viewportObserver?.disconnect();
   viewportObserver = null;

   const inView = records.filter(isSegmentInViewport);
   const outOfView = records.filter((r) => !isSegmentInViewport(r));
   await enqueueSegments(inView, generation);
   if (outOfView.length > 0) {
     markSegmentsLoading(outOfView);
     updateProgress();
     viewportObserver = createViewportObserver((seg) => {
       // onEnter 错误由 try/catch 隔离
       void enqueueSegments([seg], generation).catch((err) => {
         console.warn('[fullpage] viewport onEnter enqueue failed', err);
       });
     });
     for (const seg of outOfView) viewportObserver.observe(seg);
   }
   ```
5. 改写 `flushAddedNodes`：
   ```ts
   if (active && newSegments.length > 0) {
     const generation = sessionGeneration;
     records.push(...newSegments);
     const inViewNew = newSegments.filter(isSegmentInViewport);
     const outOfViewNew = newSegments.filter((r) => !isSegmentInViewport(r));
     if (inViewNew.length > 0) {
       await enqueueSegments(inViewNew, generation);
     }
     if (outOfViewNew.length > 0) {
       markSegmentsLoading(outOfViewNew);
       updateProgress();
       if (!viewportObserver) {
         viewportObserver = createViewportObserver((seg) => {
           void enqueueSegments([seg], generation).catch((err) => {
             console.warn('[fullpage] viewport onEnter enqueue failed', err);
           });
         });
       }
       for (const seg of outOfViewNew) viewportObserver.observe(seg);
     }
   }
   ```
6. `handleRestore` 末尾追加：
   ```ts
   viewportObserver?.disconnect();
   viewportObserver = null;
   ```
7. `__reset` 末尾追加：
   ```ts
   viewportObserver?.disconnect();
   viewportObserver = null;
   ```

### s3 — 验证

1. `npx vitest run shared/fullpage/orchestrator.test.ts` — 26 既有 + 9 新增 = 35 passed。
2. `npx vitest run` — 全量单测 0 回归。
3. `npx vue-tsc --noEmit` — typecheck 通过。
4. `npx eslint . --ext .ts,.vue` — lint 通过。

## 关键设计权衡

- **enqueueSegments 提取**：所有派发路径（`doStart` 视口内 / IO onEnter 单段 / 增量视口内）共享同一"入池 + settle + 渲染"逻辑，避免 4 处重复闭包。
- **共享 viewportObserver 句柄**：`doStart` 与 `flushAddedNodes` 用同一句柄；`doStart` 入口先 disconnect 旧实例避免跨会话泄漏；同一会话内增量翻译无需重建观察器。
- **进度立即反映视口外段**：拆分后立即 `updateProgress()`，确保工具栏 `N/total` 含视口外段。
- **onEnter 错误隔离**：`try/catch` 在编排器侧，IO 内部 map 仍由 t2 保证出列逻辑先于回调（参考 t2 文档）。

## 验证门禁

- `pnpm typecheck` ✓（实际：`vue-tsc --noEmit` 0 错误）
- `pnpm lint` ✓（实际：`eslint . --ext .ts,.vue` 0 警告）
- `pnpm test` 全量 ✓（实际：基线 372 + 视口分组新增 9 = 381；translate-pool 30 + 既有 346 + 视口分组 9）
- 既有编排器 26 个测试无回归（实际：26 → 35，新增 9 个）✓
- `pnpm build` ✓（实际：wxt build 成功，fullpage.js 31.57 kB）
