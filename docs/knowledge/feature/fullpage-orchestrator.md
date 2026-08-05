---
id: feature:fullpage:orchestrator
type: feature
status: active
owner: project
updated: 2026-08-04
confidence: 0.9
sources:
  - shared/fullpage/orchestrator.ts
  - shared/fullpage/orchestrator.test.ts
  - shared/fullpage/renderer.ts
  - shared/fullpage/toolbar.ts
  - entrypoints/fullpage.content.ts
  - docs/iterations/v0.4.0/tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/DESIGN.md
  - docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md
  - docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/DESIGN.md
  - docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/PLAN.md
  - docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/CHANGELOG.md
related:
  - feature:fullpage:segmenter-pool
  - feature:fullpage:command-channel
  - feature:translator:unified-adapter
  - context:system:plugin-architecture
  - runbook:e2e:fullpage-trigger-assertions
  - feature:fullpage:e2e-mock-contract
---

# 全文翻译编排器状态机与可复用模式（v0.4.0）

> 以 `shared/fullpage/orchestrator.ts` 当前代码为准。本模块覆盖全文翻译编排器（t5）：唯一状态持有者状态机、并发重入守卫、增量翻译防抖管线、防闪回双保险，以及「编排器组合无状态组件」设计范式。

## 功能目标

编排器是全文翻译的**唯一状态持有者**，以模块级状态组合 t2（segmenter + pool）、t3（renderer）、t4（toolbar）四个无全局状态组件，形成完整状态机：

```
background 右键菜单
  -> tabs.sendMessage(BackgroundCommand)
  -> entrypoints/fullpage.content.ts (content script, runtime.onMessage)
  -> orchestrator.start(mode)
     -> collectSegments(document.body)        [t2 segmenter]
     -> createToolbar(callbacks)              [t4 toolbar]
     -> runPool(records, { onSettled, isActive })  [t2 pool]
        onSettled: done -> renderer.apply(mode) / failed -> markFailed + setFailureCount  [t3 renderer]
     -> MutationObserver.observe(document.body)  [增量翻译]
```

segmenter / pool / renderer / toolbar 均为无全局状态组件；本模块是唯一状态持有者。样式隔离约定：所有注入 DOM 带 `data-llm-translator`（分段排除、观察器过滤、恢复清理均依赖）。

## 模块级状态

| 变量 | 类型 | 说明 |
|---|---|---|
| `records` | `SegmentRecord[]` | 当前页所有分段记录 |
| `mode` | `DisplayMode` | 当前显示模式（`replace` / `bilingual`） |
| `active` | `boolean` | 翻译是否进行中（恢复原文后置 `false`） |
| `cache` | `Map<string, string>` | 会话级缓存，恢复原文后**不清除**（再次触发命中段秒级渲染，验收标准 10） |
| `toolbar` | `ToolbarApi \| null` | 工具栏实例 |
| `observer` | `MutationObserver \| null` | 增量翻译观察器（仅 `active` 期间连接） |
| `recordedEls` | `Set<HTMLElement>` | 已收段元素集合（增量翻译防重复收段） |
| `viewportObserver` | `ViewportObserver \| null` | 视口外段观察器；`doStart` 与 `flushAddedNodes` 共享同一实例；`doStart` 入口先 `disconnect` 旧实例防跨会话残留段监听；`handleRestore` / `__reset` 末尾 `disconnect` 并置 `null` |
| `targetLang` | `string` | start 时解析一次，传入池 |
| `startInFlight` | `Promise<void> \| null` | 进行中的 start（并发触发守卫） |
| `sessionGeneration` | `number` | 单调递增的会话身份；start 捕获，restore/reset 使旧回调失效 |
| `pendingAddedNodes` | `Set<HTMLElement>` | 防抖窗口内聚合的新增节点 |
| `debounceTimer` | `ReturnType<typeof setTimeout> \| null` | 防抖计时器 |
| `isFlushing` | `boolean` | flush 并发守卫 |

测试钩子 `__getState()` / `__reset()` 导出内部状态快照与全量重置，供单元测试断言与隔离。

## 可见翻译生命周期与聚合进度

编排器在请求派发前创建工具栏，并在 `runPool` 前为本轮所有收集到的分段调用 `markLoading`。因此排队中的 `pending` 段和已派发的 `translating` 段都立即显示加载标记；标记是带 `data-llm-translator` 的 Shadow DOM 宿主，不替换原文。

| 分段状态或操作 | 编排器动作 | 页面反馈 |
|---|---|---|
| `pending` / `translating` | 保持 loading marker | 段尾显示 spinner 加载标记 |
| `done` | `clearLoadingMark` 后按当前模式渲染 | 替换译文或双语译文块 |
| `failed` | `clearLoadingMark` 后 `markFailed` | 失败徽标，并更新重试计数 |
| 重试开始 | 清失败徽标、重新 `markLoading` | 重试段回到加载状态 |
| 增量内容 | 新段入 `records` 后先 `markLoading` 再入池 | 与首轮相同的加载生命周期 |
| 恢复原文 | `restoreAll` | 移除加载、译文和失败宿主 |

`updateProgress` 不维护额外计数器，而是从唯一状态 `records` 派生：`completed` 为 `done + failed`，`failed` 为失败段数，`active` 为是否还存在 `pending` 或 `translating`。因此失败也是已处理的终态，进度不会停滞。工具栏在初始收集、每次 settle、重试前后、增量收集和空页面启动时更新：活动时显示 `全文翻译 completed/total` 与 spinner，全部成功时显示 `全文翻译完成 total/total`，有失败时显示 `已完成 completed/total，失败 failed`，空页面显示 `未发现可翻译文本`。

模式切换只切换已完成段的渲染，不创建或移除 loading marker。恢复原文会立刻移除所有注入宿主；晚到的请求结果必须同时满足 `active` 与启动时捕获的 `sessionGeneration`，旧 retry 即使在新会话 active 后返回也不能按新 mode 渲染或生成 orphan host。

## 可复用设计范式

### 范式 1：编排器作为唯一状态持有者组合无状态组件

编排器以模块级变量持有全部运行时状态，被组合的 segmenter / pool / renderer / toolbar 均为无全局状态的纯函数组件。这一设计使：

- 组件可独立单测（不依赖编排器状态）。
- 编排器测试通过 `__reset()` 在每个用例前重置模块级状态，经 `__getState()` 断言内部状态。
- 状态流转集中在单一模块，便于追踪与调试。

**复用场景**：后续实现其他 content script 注入类功能（如页面级批注、DOM 增强）时，可采用相同范式--一个模块级状态机编排器组合多个无状态 DOM 工具组件，避免状态散落与隐式耦合。

### 范式 2：并发重入守卫（startInFlight）

`start(mode)` 是异步函数；右键菜单连点等场景可能在首次 start 未完成时再次触发。`startInFlight` 守卫确保第二次调用**等待首次完成后按最新状态决策**，而非并发执行：

```typescript
if (startInFlight) {
  await startInFlight;
}
// 复用路径判断（此时首次 start 可能已将 active 置 true）
if (active && records.length > 0) {
  switchToMode(requestedMode);
  return;
}
const p = doStart(requestedMode);
startInFlight = p;
try { await p; } finally { if (startInFlight === p) startInFlight = null; }
```

第二次调用等待首次完成后，`active && records.length > 0` 为真，走复用路径（仅切换模式），避免重复收集分段 / 重复挂工具栏 / 重复派发翻译。

**复用场景**：任何异步入口可能被用户连续触发（菜单连点、快捷键连按）的 content script 功能，均可使用「进行中 Promise 守卫 + 完成后按最新状态决策」模式，而非简单 mutex 或忽略。

### 范式 3：增量翻译防抖管线

非空初始会话才创建 MutationObserver 观察 `document.body`（`{ childList: true, subtree: true }`）；空页面仅保留工具栏的 `未发现可翻译文本` 状态，不启动 observer。非空会话以 200ms 防抖聚合 `addedNodes`，然后批量 flush：

1. **聚合**：`handleMutations` 将每个 mutation 的 `addedNodes` 存入 `pendingAddedNodes`（Set 自动去重），每次 mutation 重置 200ms 计时器。
2. **flush 并发守卫（isFlushing）**：flush 期间新到达的节点入新 set，flush 完成后检查 `pendingAddedNodes.size > 0` 重新调度，不丢节点也不并发 flush。
3. **过滤防回环**：`data-llm-translator` 属性标记自身注入 DOM，flush 时跳过（`node.hasAttribute('data-llm-translator')`），防止扩展产物被收集为翻译段形成无限回环。
4. **元素去重（recordedEls）**：`collectSegments(node)` 返回的段以 `seg.el` 为 key 查 `recordedEls`，已收过的跳过，防止同一元素被多个 mutation 覆盖时重复收段。
5. **断开安全**：`!active` 时 flush 循环 `break`（恢复原文后不再处理）；`!node.isConnected` 时 `continue`（元素已移除）。
6. **错误隔离**：单棵子树 `collectSegments` 失败用 `catch` 吞掉并 `continue`，不阻断整批。

**复用场景**：后续扩展全文翻译功能（如翻译进度指示器、批量重试策略优化、多页面翻译状态管理）或实现其他需要监听 DOM 变更并增量处理的 content script 功能时，可复用此「防抖聚合 + 并发守卫 + 注入过滤 + 元素去重 + 错误隔离」管线模式。

### 范式 4：会话身份与元素连接双重校验

翻译是异步操作，返回时页面状态可能已变化（用户恢复原文、启动新会话或元素被宿主移除）。单独的 `active` 布尔值会被新会话复用，因此用单调 generation 作为可靠会话身份：

1. **池级 `isActive: () => isSessionActive(generation)`**：初始、增量和 retry pool 在派发新段前同时检查 active 与 generation；restore 后已派发段可结束，但排队段停止派发。
2. **段级 `onSettled` 校验**：每个回调捕获启动时 generation，先校验当前会话身份，再校验 `seg.el.isConnected`。旧 retry 在 restore -> restart 后返回时不能触碰新 records、toolbar 或 DOM；元素已移除时同样丢弃渲染。

```
handleSettled(seg, generation):
  if (!isSessionActive(generation)) return;
  if (seg.status === 'translating') return;
  if (!seg.el.isConnected) return;  // 元素已移除 -> 丢弃
  done   -> applyReplace / applyBilingual
  failed -> markFailed + updateFailureCount
```

**复用场景**：任何异步操作（翻译、数据加载）的回调需要防「操作完成时上下文已被新会话复用」的场景，可复用「单调 generation + pool 派发守卫 + 回调身份/连接校验」。

### 范式 5：Shadow DOM + 自足样式隔离（跨模块复用）

编排器组合的 t3 渲染器（`renderer.ts`）与 t4 工具栏所有注入 DOM（译文块、失败徽标、工具栏）均走 `attachShadow({ mode: 'open' })` + shadow 内 `<style>` 注入自足样式，显式重置继承属性规避宿主页面 CSS 穿透。详细实现与样式约定见 `feature:fullpage:segmenter-pool` 的「Shadow DOM 隔离与自足样式」节。审查（REVIEW.md §4.1）确认 Shadow DOM 边界有效（宿主 CSS 无法穿透），同时发现 2 处继承属性重置缺口（工具栏按钮 `font-weight` 未设、`letter-spacing`/`text-transform`/`white-space` 未重置），属低影响改进项。此模式是编排器组合的组件层设计范式之一，后续 content script 注入类功能均可复用。

### 范式 6：按视口分组调度 + 共享 `enqueueSegments` 入池 + 共享 `viewportObserver` 句柄

编排器在 `doStart` 与 `flushAddedNodes` 中对分段按 `isSegmentInViewport`（来自 t2 `translate-pool.ts`）做**快照式分组**：

```
records -> isSegmentInViewport 拆分
  ├─ inView    -> enqueueSegments → runPool(同步)        [t2 runPool 缓存/并发/中止]
  └─ outOfView -> markLoading + updateProgress (进度立即 N/total)
                  + viewportObserver.observe(seg)         [IntersectionObserver]
                  → onEnter(seg): enqueueSegments([seg], generation)
```

`enqueueSegments(segs, generation)` 是新提取的内部函数，统一封装「`markLoading` + `updateProgress` + `runPool`（含 `onSettled` 闭包 + `isActive: () => isSessionActive(generation)` 校验）」。**所有派发路径**——`doStart` 视口内段、IO `onEnter` 单段、`flushAddedNodes` 视口内段——都走同一函数，避免 4 处重复闭包，且视口外段入池仍是 `runPool([seg], ...)`（`concurrency=3` 下只有 1 段不浪费，仍走缓存与 settle 路径）。

视口外段**立即** `markLoading` + `updateProgress`：拆分后立即调，使工具栏 `0/total` 立即反映**全部**段（含视口外段已处于 loading），而不是等滚动进入才更新。

**共享 `viewportObserver` 句柄**：`doStart` 与 `flushAddedNodes` 用同一 `ViewportObserver` 实例；`doStart` 入口先 `viewportObserver?.disconnect(); viewportObserver = null;`（防止上一会话残留段监听——直接调 `__reset` 或外部跨会话触发等极端路径），同一会话内增量翻译无需重建观察器。`onEnter` 内将单段走 `enqueueSegments([seg], generation)`，异常由编排器侧 `void ... .catch(console.warn)` 隔离，不让 IO 回调异常破坏状态机（t2 的 IO 内部 map 出列逻辑先于回调，元素仍正确出列）。

**IO 句柄终态清理**：

| 入口 | 清理动作 |
|---|---|
| `handleRestore` 末尾 | `viewportObserver?.disconnect(); viewportObserver = null;` |
| `__reset` 末尾 | `viewportObserver?.disconnect(); viewportObserver = null;`（句柄已为 null 时重复 `__reset` 幂等） |
| `doStart` 入口 | 再次 `disconnect` + `null`（防跨会话路径未走 `handleRestore`） |

**复用场景**：后续实现其他按需 lazy load 型 content script 功能（图片懒加载翻译、评论懒加载、模块懒挂载）时，可复用「`isSegmentInViewport` 快照式分组 + IO 进入即出列 + 共享 `enqueueSegments` 入池 + 共享 `viewportObserver` 句柄 + 入口 `disconnect` 旧实例」五件套模式；以及「派发路径共享一个内部函数（`enqueueSegments`）」与「onEnter 异常由编排器侧 try/catch 隔离」的两个横切关注点。

## 审查验证（REVIEW.md）

v0.4.0 全文翻译审查（REVIEW.md，2026-08-03）对编排器状态机核心设计范式逐项确认：

- **验证门禁全绿**：typecheck ✓ / lint ✓ / 309 单测 ✓ / 15 e2e ✓（7 划词 + 8 全文翻译）/ Chrome MV3 + Firefox MV2 构建 ✓。
- **范式 1（编排器组合无状态组件）**：§4.3 确认组件可独立测试，编排器经 `__reset()`/`__getState()` 隔离；状态流转集中可追踪。
- **范式 2（并发重入守卫）**：§4.4 确认 `startInFlight` 守卫有效，连点不并发执行。
- **范式 3（增量翻译防抖管线）**：§4.3 确认 200ms 防抖 + `isFlushing` 并发守卫 + `data-llm-translator` 过滤防回环 + `recordedEls` 去重 + 错误隔离均正确；MutationObserver 不重复创建（`if (observer) return` 守卫），`handleRestore` 调 `stopObserver`（disconnect + 清 timer + 清 pendingAddedNodes）。
- **范式 4（防闪回双保险）**：§4.3/§4.4 确认池级 `isActive` 在派发新段前检查，`handleSettled` 中 `active` + `seg.el.isConnected` 双重校验；恢复后 `active = false` 阻止新段派发与已返回段渲染；`toolbar.destroy` 幂等（`destroyed` 标志位守卫），无闭包泄漏。
- **范式 6（按视口分组调度 + 共享 enqueueSegments / viewportObserver 句柄）**：任务 83a350c8 补齐：9 个新增单测（jsdom 兜底路径 + mock `IntersectionObserver` 生产环境路径）覆盖视口外段立即 loading、IO 不相交不调 `sendMessage`、IO 相交后入池渲染、handleRestore / `__reset` 调 `disconnect`、增量视口外段共享句柄、doStart 二次触发 disconnect 旧句柄、跨会话清理。`isSegmentInViewport` 快照式分组 + `viewportObserver` 进入即出列 + 共享入池路径 + 入口 `disconnect` 旧实例 五件套模式跨会话不泄漏。
- **验收标准 1-12**：1-10、12 完全达成；11 基本达成（强样式页面人工验证待执行）。

## start(mode) 状态流转

### 复用路径（零 API）

`active && records.length > 0` 时再次触发 -> 仅 `switchToMode(mode)`（renderer.switchMode 翻转显示模式 + 翻转 `mode` 变量 + 工具栏文案更新），不调用 API、不重建工具栏。译文已在段上或缓存中。

### 全新路径

1. `generation = ++sessionGeneration`；`active = true`；`mode = requestedMode`
2. `targetLang = await getTargetLang()`（用户配置优先，回退浏览器首选语言）
3. `records = collectSegments(document.body)`（v0.4 同步收集；大页面后续可用 `requestIdleCallback` 分片优化）
4. `recordedEls = new Set(records.map(r => r.el))`
5. `toolbar = createToolbar({ onSwitchMode, onRestore, onRetry, onCollapse, onRecall })`；`toolbar.setMode(mode)`（空分段页重复触发时先 `toolbar?.destroy()` 防重复挂载）
6. `markSegmentsLoading(records)` + `updateProgress()`，然后 `await runPool(records, { targetLang, concurrency: 3, cache, onSettled: 捕获 generation, isActive: () => isSessionActive(generation) })`
7. 若当前 generation 仍 active 且 `records.length > 0` -> `startObserver()`；空页不启动 observer

## 工具栏回调接线

| 回调 | 动作 | 关键点 |
|---|---|---|
| `onSwitchMode` | `switchToMode(mode === 'replace' ? 'bilingual' : 'replace')` | 零 API 调用 |
| `onRestore` | `restoreAll` + `stopObserver` + `toolbar.destroy` + `active = false` + generation 失效 | **保留 cache 与 records.translatedText**，再次触发命中段秒级渲染 |
| `onRetry` | 捕获 generation -> 收集 failed 段 -> `clearFailedMark` -> `retrySegments`（复用池，不清缓存）-> `updateFailureCount` | 传入当前会话 `isActive`，restore 后停止派发排队段；旧 settle 不触碰新会话 UI |
| `onCollapse` | no-op | toolbar 已自动 collapse；预留暂停观察器扩展位 |
| `onRecall` | no-op | toolbar 已自动 expand |

## 类型守卫（isBackgroundCommand）

`isBackgroundCommand(msg: unknown): msg is BackgroundCommand`：校验 `msg.type === 'fullpage-translate'` 且 `msg.mode` 为 `'replace' | 'bilingual'`。TS 严格模式下以 `unknown` + 类型守卫收窄，不用 `any`。content script 入口（`entrypoints/fullpage.content.ts`）在 `runtime.onMessage` 监听器中以此守卫过滤消息，仅消费全文翻译命令，其余消息（如划词翻译通道）忽略。

## entrypoint 与编排器的边界

- `entrypoints/fullpage.content.ts` 只负责接收 background 命令（`runtime.onMessage` + `isBackgroundCommand` 守卫）并调用 `start(msg.mode)`；全部翻译状态在编排器。
- 独立 content script 入口（WXT 多 content script），与 `entrypoints/content.ts`（划词翻译）各自独立注入、互不干扰、无共享运行时状态。
- WXT 入口命名约定：额外 content script 须以 `*.content.ts` 命名（否则被识别为 unlisted script 不进 manifest.content_scripts）。
- 启动失败仅 `console.warn` 不阻断宿主页面（content script 无用户反馈通道）。

## 接口依赖

- **消费 t2/t3/t4 接口**：`collectSegments` / `runPool` / `retrySegments` / `isSegmentInViewport` / `createViewportObserver` / `ViewportObserver`（t2）、`applyReplace` / `applyBilingual` / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll`（t3）、`createToolbar` / `ToolbarApi`（t4）、`getTargetLang`（`shared/target-lang.ts`）。
- **消费类型**：`BackgroundCommand` / `DisplayMode`（`shared/types.ts`）、`SegmentRecord`（`shared/fullpage/types.ts`）。
- **翻译通道**：复用 `Message` 的 `{ type: 'translate', payload }` 通道（非流式），经 `browser.runtime.sendMessage` 下发。详见 `feature:fullpage:segmenter-pool`。
- **命令来源**：`feature:fullpage:command-channel` 定义的右键菜单与 `BackgroundCommand` 下发。

## 遗留与后续

- 大页面（上千段）首帧收集为同步遍历，已注释标注后续 `requestIdleCallback` 分片优化点。
- 观察器启动时机为 `await runPool` 之后（v0.4 顺序）：翻译期间的新增内容靠启动后 mutation 补偿，存在理论窗口期，后续可提前启动观察器。
- e2e（Playwright）已补齐全文翻译链路（v0.4.0）：`e2e/fullpage.spec.ts` 8 用例覆盖验收标准 1-11（渐进渲染 / 双语 / 切换免重译 / 恢复 / 失败重试 / 增量 / 缓存 / 工具栏 UX）。触发与断言技术见 `runbook:e2e:fullpage-trigger-assertions`，mock 契约见 `feature:fullpage:e2e-mock-contract`。

## 来源证据

- `shared/fullpage/orchestrator.ts`：模块级状态声明（含 `viewportObserver: ViewportObserver \| null` 共享句柄）、`start` / `doStart`（复用路径 + 全新路径 + 视口拆分 + enqueueSegments + startInFlight/sessionGeneration 守卫）、`enqueueSegments`（共享入池路径，markLoading + updateProgress + runPool 闭包）、`createViewportEnterObserver`（带 onEnter try/catch 的 IO 工厂）、`handleSettled`（generation + isConnected 双重校验）、`handleMutations` / `scheduleFlush` / `flushAddedNodes`（防抖管线 + isFlushing 守卫 + data-llm-translator 过滤 + recordedEls 去重 + 视口分组复用句柄）、`handleRestore`（保留 cache 并使 generation 失效 + disconnect viewportObserver）、`handleRetry`（复用 retrySegments 并传 isActive）、`isBackgroundCommand` 类型守卫、`__getState` / `__reset` 测试钩子（末尾 disconnect viewportObserver）。
- `shared/fullpage/orchestrator.test.ts`：覆盖即时加载标记、派生进度、成功/失败终态、重试、增量分段、空页面不启动 observer、恢复中的晚到结果、旧 retry 会话隔离、restore 后停止排队派发、类型守卫和既有编排器状态机；视口分组 describe 块新增 9 个用例（jsdom 兜底路径 + mock `IntersectionObserver` 生产环境路径），覆盖 doStart 视口外段立即 loading、mock IO 不相交不调用 sendMessage、IO 相交后入池并渲染、handleRestore / `__reset` 调 `disconnect`、增量视口外段共享句柄、doStart 二次触发时 disconnect 旧句柄、跨会话清理。
- `shared/fullpage/renderer.ts` / `shared/fullpage/toolbar.ts`：分别提供幂等 loading marker 清理和状态行呈现 API。
- `entrypoints/fullpage.content.ts`：`defineContentScript({ matches: ['<all_urls>'] })` + `runtime.onMessage` + `isBackgroundCommand` 守卫 + `start(msg.mode)` 调用 + catch console.warn。
- `docs/iterations/v0.4.0/tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/DESIGN.md`：编排器状态机总体架构、模块级状态表、start 流程、onSettled 回调、工具栏回调接线表、增量翻译设计、isActive 中止、关键设计权衡（模块级状态 vs 工厂函数、retrySegments vs runPool、observer 启动时机、复用路径不重建 toolbar）、边界与风险。
- `docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md`：§4.3 资源与生命周期（MutationObserver 不重复创建、isActive 中止、toolbar.destroy 幂等、防抖管线、无闭包泄漏）、§4.4 并发与错误路径（并发≤3、sendMessage 契约、失败收集/重试/计数一致、SW 回收容错）、S3 retrySegments isActive 设计权衡、验收标准 1-12 逐条确认。
- `docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/DESIGN.md`：视口工具总体架构（视口拆分、`enqueueSegments` 抽取、`viewportObserver` 共享句柄与清理约定）、数据契约（`viewportObserver` 句柄字段）、关键约定（5 条：markLoading 立即、isSessionActive 校验、共享观察器、onEnter try/catch、disconnect 终态）、实施步骤 7 步、关键设计权衡（`enqueueSegments` 提取 vs 内联、onEnter 同步触发、disconnect 顺序）、边界与风险、测试覆盖矩阵。
- `docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/PLAN.md`：TDD 红绿重构（s1 写 9 个失败测试；s2 引入视口工具、提取 `enqueueSegments`、改写 `doStart` 与 `flushAddedNodes`、补 `handleRestore` / `__reset` 末尾清理；s3 验证门禁）、关键设计权衡、验证门禁。
- `docs/iterations/v0.4.0/tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/CHANGELOG.md`：本次任务变更摘要、设计决策、关键约定、边界与风险、验证（381 单测全过、typecheck/lint/build 全绿）、沉淀映射。
