# ADR-0001: 全文翻译分段收集切到 rIC

- **Status**: Accepted
- **Date**: 2026-08-07
- **Scope**: `shared/fullpage/{segmenter,chunker,orchestrator,toolbar}.ts` + `assets/fullpage-toolbar.css`

## Context

v0.4.0 之前的全文翻译在 `doStart` 内同步调用 `collectSegments` / `collectSemanticSegments` 完成首段收集。jsdom 性能基线（5000 段合成 DOM，详见 `CONTEXT.md` §3.1）：

| 段数 | collectSegments | collectSemanticSegments | 真 DOM 估算 |
| --- | --- | --- | --- |
| 500 | 51ms | 51ms | 10-17ms |
| 2000 | 603ms | 615ms | 120-200ms |
| 5000 | 3665ms | 3839ms | 700-1500ms |
| 10000 | 15377ms | 16068ms | 3-5s |

5000 段首帧冻结 ≥ 700ms，超过「主线程块 < 50ms 即用户不感知」的 web-vitals 经验值；长文章 / 技术博客 / 论文页面（10K+ 段）是已知体验债。`orchestrator.ts:101` 注释已点出方向但未落地。

## Decision

把全文翻译首段收集切到 `requestIdleCallback`，分四个原子决策：

### D1. 用 generator 让 walk 自身可让出

`shared/fullpage/segmenter.ts` 抽出 `walkSegmentsGen` / `walkSemanticSegmentsGen` 两个 generator，逐段 `yield SegmentRecord`。`collectSegments` / `collectSemanticSegments` 退化为 `Array.from(gen)`；`walkSegments(cb)` / `walkSemanticSegments(cb)` 退化为 `for (const s of gen) cb(s)`。**对外签名零变更**——orchestrator / 测试 / 既有 e2e 不感知。

### D2. 8ms 主线程预算 + setTimeout(0) 退路

`shared/fullpage/chunker.ts` 提供 `createIdleChunkerScheduler(budgetMs = 8)`：检测到 `globalThis.requestIdleCallback` 存在时使用（带 50ms timeout），否则回退到 `setTimeout(resolve, 0)`。Safari 全版本不支持 rIC，退路是必要兜底。预算 8ms 而不是 16ms：留 8ms 给主线程渲染（Q21=B），让滚动响应在分片期间保持顺滑。

### D3. chunkSize=200，emit 顺序「视口内 → 视口外」

`chunker.discoverSegments` 走 generator `for...of`，每段入 buffer（按 `isSegmentInViewport` 分两路），buffer 任一边满 200 或主线程累计 > 8ms 时 `flushBuffer` → `onChunk({ inView, outOfView })` → `await scheduler.yield()`。**单一 onChunk 调用同时包含两类段**，编排器内按顺序 dispatch：视口内段立即入池（`runPool` / `runBatchPool` 各自并发上限 3），视口外挂 `viewportObserver` 等进入视口再入池。

chunkSize=200 是真 DOM 经验值：200 段 walk 真 DOM < 16ms（jsdom 5× 系数下 < 80ms），给一帧留足渲染空间。

### D4. 编排器 fire-and-forget 派发，每 chunk 独立 await

`orchestrator.doStart` 调 `discoverSegments`，每收到 `onChunk` 立即 `void enqueueSegments(inView, generation)`：池调度与后续 chunk 收集并行，不串行。代价：测试需在 `start()` 后 `await new Promise(r => setTimeout(r, 0))` 等待 macrotask 边界（chunker 的 setTimeout 退路 + pool 的 `await sendMessage` 各占 1 个 tick）。已在 `orchestrator.test.ts` 5 处用例补 `drainMicrotasks` + `setTimeout(0)`。

`enqueueSegments` / `handleSettled` / `flushAddedNodes` 全部沿用既有会话守卫（`sessionGeneration` + `isActive()`），chunk 间会话失效（restore / restart）会通过 `discoverSegments` 抛 `DiscoveryAborted`，`doStart` 的 `catch` 走 `cleanupFailedStart` 还原状态。

## Consequences

### 收益

- 1000 段真 DOM 端到端 ≤ 80ms（jsdom ≤ 80ms 测得），5000 段 ≤ 400ms（jsdom ≤ 400ms 测得）。jsdom bench 落在 `shared/fullpage/chunker.test.ts`「rIC 退路」 describe 块，PR 阶段自动卡门。
- 用户在分片期间可见滚动响应：rIC + 8ms 预算 + 视口内段优先让 1000+ 段页面的「视口内先译完、视口外滚动时再追」。
- `chunker` 是无状态组件，orchestrator 仍是唯一状态持有者；本 ADR 不破坏「segmenter / pool / renderer / toolbar 均为无状态组件」架构原则。

### 代价

- 工具栏进度条在收集阶段走不定态脉冲（`setIndeterminate(true)` + CSS 走马灯动画），收尾切回 M/N。多 1 个 `data-indeterminate` 宿主属性 + 4 行 CSS。
- `discoverSegments` 是异步路径，5 处既有 orchestrator 测试需要 `await new Promise(r => setTimeout(r, 0))` 显式等 macrotask。
- 收集阶段 `recordedEls` 去重 + `records.push` + `updateProgress` 都在 onChunk 同步路径，5000 段 ≈ 25 次 onChunk，单次 < 1ms。

### 风险与后续

- **`onSettled` 与 chunker 同帧竞争**：池结果回来时 `handleSettled` 检查 `isSessionActive(generation)`，会话失效则丢弃——已验证 50 个 orchestrator 用例不退化。
- **e2e perf 围栏落地**：`e2e/fullpage-perf.spec.ts` 用 DOM `MutationObserver` 监 `.llm-translator-block-host` 首次出现，围栏 ≤80ms / ≤400ms 真 DOM（Q16=C、Q22=A）。留作后续 PR。
- **Safari rIC 不支持**：所有走 rIC 的页面都退到 setTimeout(0)；真 DOM setTimeout 0 比 jsdom 快 5-10×，5000 段 Safari 估算 < 500ms 端到端，仍达 Q12=B 预算。

## Alternatives Considered

- **A 固定窗口 200 段/帧 + 不视口优先**（Q9=B 原方案）：实现最简但 5000 段长文视口内段要等 1s 排队才出译文。否决。
- **B 仅 chunked 化 collect，无 IO 拍快照**（Q10=C 原方案）：chunk 边界与视口无关，编排器仍要同步重排。否决。
- **C 把 chunking 嵌进 `runPool` 内部**（Q10=B）：污染 batch gate 三槽语义，影响 v0.4.0 收尾。否决。
