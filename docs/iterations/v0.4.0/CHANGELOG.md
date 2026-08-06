# Changelog — v0.4.0 全文翻译（Iteration fa0c40ce-65b7-49f7-9c88-1e0212b225a5）

> 迭代版本: v0.4.0
> 迭代 ID: fa0c40ce-65b7-49f7-9c88-1e0212b225a5
> 主题: 全文翻译（right-click → 页面级 replace / bilingual 翻译 + 工具栏 + 视口优先调度 + e2e 覆盖）

## 1. 迭代目标

为 Chrome MV3 扩展补齐「全文翻译」链路：从右键菜单入口到页面级分段收集、并发翻译、双模式（替换 / 双语对照）渲染、视口优先调度、失败重试、悬浮工具栏与迷你把手、增量翻译与恢复清理，并补齐 Playwright e2e 与 mock server 契约。

## 2. 任务清单（12 个）

| # | 任务 ID | 标题 | 状态 | 沉淀 | 任务 CHANGELOG |
|---|---|---|---|---|---|
| 1 | `9c31d198-a148-4649-b76c-d0eea81b274f` | 搭建上下文菜单入口与全文翻译消息通道 | succeeded | ✅ 3 knowledge | [CHANGELOG](tasks/9c31d198-a148-4649-b76c-d0eea81b274f/CHANGELOG.md) |
| 2 | `490531ee-e42e-4af7-a4b3-e75e3712c1a4` | 实现页面分段收集器与带缓存的并发翻译池 | succeeded | ✅ 1 knowledge | [CHANGELOG](tasks/490531ee-e42e-4af7-a4b3-e75e3712c1a4/CHANGELOG.md) |
| 3 | `3ecb43bc-3eff-4323-96f2-eea84cb6dc48` | 实现替换/双语双模式渲染器与 Shadow DOM 译文块隔离 | succeeded | ✅ 1 knowledge | [CHANGELOG](tasks/3ecb43bc-3eff-4323-96f2-eea84cb6dc48/CHANGELOG.md) |
| 4 | `b922fb74-49bb-4875-ab0a-8d3e170ea516` | 实现悬浮翻译工具栏与收起迷你把手 | succeeded | — | [CHANGELOG](tasks/b922fb74-49bb-4875-ab0a-8d3e170ea516/CHANGELOG.md) |
| 5 | `17614208-4e99-455b-8dfb-5abbd6f7aede` | 实现全文翻译编排器、content script 入口与增量翻译 | succeeded | ✅ 1 knowledge | [CHANGELOG](tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/CHANGELOG.md) |
| 6 | `9d51a89a-b934-4765-a570-7dd583d37717` | 编写全文翻译 e2e 用例并扩展 mock server | succeeded | ✅ 2 knowledge | [CHANGELOG](tasks/9d51a89a-b934-4765-a570-7dd583d37717/CHANGELOG.md) |
| 7 | `c81b8f88-6cab-4720-90bb-b75378472d8d` | 审查全文翻译功能实现 | succeeded | ✅ 4 knowledge | [CHANGELOG](tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/CHANGELOG.md) |
| 8 | `000a65d5-4d87-42ca-84e0-8034c913ad04` | 移除段尾 loading 文案与 aria-label | succeeded | — | [CHANGELOG](tasks/000a65d5-4d87-42ca-84e0-8034c913ad04/CHANGELOG.md) |
| 9 | `b44e13a3-8043-41ed-9b27-06c9ee383404` | 实现视口判定与 IntersectionObserver 调度工具 | succeeded | ✅ 1 knowledge | [CHANGELOG](tasks/b44e13a3-8043-41ed-9b27-06c9ee383404/CHANGELOG.md) |
| 10 | `83a350c8-48b5-4875-b7a2-8f97e90f13af` | 编排器按视口分组调度与清理 IO | succeeded | ✅ 2 knowledge | [CHANGELOG](tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/CHANGELOG.md) |
| 11 | `3bd60c32-becd-4b3c-8ae4-64026be74b1a` | 同步更新单测：loading 文案移除 + 视口优先调度 | succeeded | — | [CHANGELOG](tasks/3bd60c32-becd-4b3c-8ae4-64026be74b1a/CHANGELOG.md) |
| 12 | `a3ea2058-c5bb-45be-a488-09aadf1ac4ec` | 扩展 e2e 验证视口优先调度与恢复清理 | succeeded | ✅ 1 knowledge | [CHANGELOG](tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/CHANGELOG.md) |

> 注：4 个任务（#4、#8、#11）的沉淀记录为 `knowledgeIds=[]`、`changedPaths=[]`（无新增/变更长期知识），详见各任务 CHANGELOG 的「知识沉淀」节。

## 3. 关键变更（按链路）

### 3.1 入口与命令通道（#1）

- `entrypoints/background.ts`：新增 `browser.contextMenus.onClicked` 顶层同步注册（MV3 SW 约束），`onInstalled` 内创建父项「全文翻译」+ 子项「翻译此页（替换）」/`（双语对照）`；`tab?.id` 守卫后 `tabs.sendMessage` 下发 `BackgroundCommand`。
- `wxt.config.ts`：`baseManifest.permissions` 追加 `contextMenus`（chrome-mv3 + firefox-mv2 共用，WXT 自动处理 MV2 归并）。
- `shared/types.ts`：新增 `DisplayMode = 'replace' | 'bilingual'`、`BackgroundCommand = { type: 'fullpage-translate'; mode }`。
- `shared/target-lang.ts`：自 `entrypoints/content.ts` 机械提取 `getTargetLang()`（9 个单测锁定）。
- `entrypoints/content.ts`：改为 import 切换，行为不变。

### 3.2 全文翻译库（#2、#3）

- `shared/fullpage/types.ts`：领域类型（`SegmentStatus` / `SegmentRecord` / `SegmenterOptions` / `TranslatePoolOptions` / `TranslatePoolResult` / `TranslationProgress`）。
- `shared/fullpage/segmenter.ts`：`collectSegments(root)` 页面分段收集器（支持 Document / DocumentFragment 根 + 嵌套允许 + DOM 路径 + 文本哈希 id）。
- `shared/fullpage/translate-pool.ts`：`runPool` / `retrySegments` 带缓存的并发翻译池（缓存 key `${targetLang}\u0000${originalText}`、AbortSignal 中止、`isActive` 门控、`onSettled` 渲染回调）；顶部视口工具（`isSegmentInViewport` 快照式 + `createViewportObserver` IO 封装，#9 任务产出）。
- `shared/fullpage/renderer.ts`：双模式渲染器 `applyReplace` / `applyBilingual` / `markLoading`（仅 spinner + `role="status"`，#8 任务移除文案与 aria-label） / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll`；Shadow DOM 隔离 + 自足样式 + 显式重置继承属性；逐字节文本节点恢复（`originalTextNodesData` 快照）；永不覆盖 `seg.el.textContent`（保留行内子元素）；译文以 `textContent` 写入防 XSS。
- `assets/fullpage-block.css`：译文块 / 失败徽标 / 加载标记 shadow 内自足样式。

### 3.3 工具栏与迷你把手（#4）

- `assets/fullpage-toolbar.css`（188 行）：shadow 内自足样式，`:host` 定位 fixed 右下角 z-index 2147483647，工具栏 + 迷你把手互斥可见。
- `shared/fullpage/toolbar.ts`（221 行）：`createToolbar(callbacks): ToolbarApi`；按钮组 = 翻译进度行（`role="status"` / `aria-live="polite"`）+ 切换模式 + 恢复原文 + 重试失败段落（默认隐藏 + 计数徽标）+ 收起；迷你把手 36px「译」。
- `shared/fullpage/toolbar.test.ts`（481 行）：48 个单测。

### 3.4 编排器、入口、增量翻译（#5）

- `shared/fullpage/orchestrator.ts`：唯一状态持有者（`records` / `mode` / `active` / `cache` 会话级 / `toolbar` / `observer` / `recordedEls` / `targetLang` / 增量防抖状态）。
  - `start(mode)` 复用路径（active + records 非空 → 仅 `switchMode`，零 API）。
  - 全新路径：`getTargetLang` → `collectSegments` → `createToolbar` → `runPool` 并发 3 逐段即时渲染 → 启动 `MutationObserver`。
  - `startInFlight` 并发重入守卫（菜单连点时第二次等待首次完成后按最新状态决策）。
  - 工具栏回调接线：`onSwitchMode` / `onRestore`（断观察器 + 销毁工具栏 + active=false，保留 cache） / `onRetry`（clearFailedMark + retrySegments 复用缓存 + 更新 failureCount） / `onCollapse` / `onRecall?`。
  - 增量翻译：MutationObserver `{childList, subtree}` + 200ms 防抖聚合 addedNodes → 过滤 `data-llm-translator` 注入子树与已断开节点 → `collectSegments` → `recordedEls` 去重 → 新段走缓存/翻译/渲染；`isFlushing` 防并发。
  - 防闪回双保险：池 `isActive: () => active` + `handleSettled` 的 `active` 与 `el.isConnected` 校验。
  - `isBackgroundCommand(msg)` 类型守卫（`unknown` + 守卫，TS 严格模式无 `any`）。
  - 测试钩子 `__getState()` / `__reset()`。
- `entrypoints/fullpage.content.ts`：独立 content script 入口（`defineContentScript({ matches: ['<all_urls>'] })` + `runtime.onMessage` → `start(msg.mode)`）。

### 3.5 视口工具（#9）与编排器视口分组（#10）

- `shared/fullpage/translate-pool.ts` 顶部视口工具（#9）：
  - `isSegmentInViewport(seg)` 快照式判定：jsdom / SSR 兜底（`typeof window === 'undefined' || window.innerHeight === 0` → true）→ `getClientRects().length === 0` → `el.closest('[data-llm-translator]')` → 严格不等式几何判定。
  - `createViewportObserver(onEnter)`：内部 `Map<Element, SegmentRecord>` + 单 IO（`{root:null, rootMargin:'0px', threshold:0}`），进入即 `unobserve`（一次性）；`disconnect` 终态语义（`isAlive = false` + `elToSeg.clear`，后续 `observe` no-op）；`onEnter` 抛错时元素仍被 `unobserve`（出列逻辑先于回调执行）；jsdom 无 IO 时 `observe` 同步触发 `onEnter`。
- `shared/fullpage/orchestrator.ts` 视口分组（#10）：
  - 模块级 `viewportObserver: ViewportObserver | null` 句柄。
  - 内部函数 `enqueueSegments(segs, generation)`（markLoading + updateProgress + runPool + onSettled 闭包 + isActive generation 校验）。
  - `doStart` 入口先 `viewportObserver?.disconnect(); viewportObserver = null;` 清理旧句柄 → 按 `isSegmentInViewport` 拆分 `inView` / `outOfView` → 视口外段 markLoading + updateProgress 立即反映全部段 → 视口内 `await enqueueSegments(inView, gen)` → 视口外 `viewportObserver = createViewportEnterObserver(gen)` + `observer.observe(seg)`。
  - `flushAddedNodes` 视口分组：视口内入池、视口外 markLoading + 挂入同一句柄（无则创建）。
  - `handleRestore` / `__reset` 末尾 `viewportObserver?.disconnect(); viewportObserver = null;`。
  - `createViewportEnterObserver(generation)` 工厂复用同一观察器创建逻辑（onEnter 内 try/catch 隔离异常）。

### 3.6 单测同步（#11）

- `shared/fullpage/orchestrator.test.ts`：同步承接 #8（loading 文案/aria-label 移除） + #10（视口分组调度）的既有断言形态；不新增 / 删除用例。
- `shared/fullpage/renderer.test.ts`：000a65d5 已直接覆盖「loading 无文案 / 无 aria-label / 仅 spinner + role」。

### 3.7 e2e 覆盖（#6、#12）

- `e2e/fixtures/fullpage-test-page.html`：9 段测试页（3 nav + 4 块级段含 `__FAIL__` + footer + 增量按钮）。
- `e2e/fullpage.spec.ts`（#6）：8 个用例 — 替换 / 双语 / 切换免重译 / 恢复 / 失败重试 / 增量 / 缓存复用 / 收起唤出。
- `e2e/fixtures/fullpage-viewport-test-page.html`（#12）：3 视口内 + 6 视口外 + 2000px spacer。
- `e2e/fullpage.spec.ts`（#12）：新增 2 个用例 — 视口外段落滚动到视口后才入池 / 恢复原文后 IO disconnect（强观察 `[data-llm-translator] count = 0` + 弱观察请求计数不变）。
- `e2e/mock-server.ts` 扩展：`NONSTREAM_DELAY_MS = 300`（非流式成功延迟）、`getRequestCount(route?)` / `resetRequestCount()`、`setFailMode(on)`（`__FAIL__` 子串失败开关）。
- `e2e/tsconfig.json`：types 增加 `"chrome"`（sw.evaluate 内 `chrome.tabs` API 类型）。
- 触发通道：SW 广播下发 `BackgroundCommand`（`Promise.allSettled` + 0 送达抛错）。
- 渐进渲染断言：「首段已译 && 末段未译」相对时序。
- 视口 IO 触发：分步滚动（半视口步进 + rAF + 末尾 scrollTo bottom）防单次跳到底部 IO 不触发。
- disconnect 验证：强/弱双断言（宿主元素计数为 0 + 请求计数不变）。

## 4. 验证记录

| 项 | 数字 | 任务 |
|---|---|---|
| 单元测试（vitest） | 309 → 381 | #5 / #6 / #7 / #9 / #10 / #11 |
| e2e（playwright） | 7 → 15 → 20 | #5（划词 7）→ #6（+8 全文）→ #12（+2 视口） |
| typecheck（vue-tsc） | exit 0 | 全任务 |
| lint（eslint） | exit 0 | 全任务 |
| 构建（wxt build） | chrome-mv3 + firefox-mv2 双端成功 | #1 / #5 / #6 / #7 / #10 / #12 |

> 任务 #7（c81b8f88 审查）确认验收标准 1-10、12 完全达成，验收标准 11 基本达成（强样式页面人工验证待执行）；发版前需处理 B1（PERMISSIONS-JUSTIFICATION.md 同步 contextMenus）、S4（强样式页面人工验证）。

## 5. 关联长期知识

| 知识 ID | 类型 | 任务来源 |
|---|---|---|
| `context:system:plugin-architecture` | context | #1 |
| `context:system:permissions-privacy` | context | #1 / #6 / #7 |
| `feature:fullpage:command-channel` | feature | #1 |
| `feature:fullpage:segmenter-pool` | feature | #2 / #3 / #7 / #9 / #10 |
| `feature:fullpage:orchestrator` | feature | #5 / #7 / #10 |
| `feature:fullpage:e2e-mock-contract` | feature | #6 |
| `runbook:e2e:fullpage-trigger-assertions` | runbook | #6 / #7 / #12 |

### 索引同步

- `docs/knowledge/feature/index.md`（`feature:index`）：清单与 related 新增 `feature:fullpage:command-channel` / `feature:fullpage:segmenter-pool` / `feature:fullpage:orchestrator` / `feature:fullpage:e2e-mock-contract`。
- `docs/knowledge/runbook/index.md`（`runbook:index`）：清单与 related 新增 `runbook:e2e:fullpage-trigger-assertions`。
- `docs/knowledge/index.md`（`context:root`）：已初始化知识清单追加全文翻译相关条目。

## 6. 关键风险与遗留

- **大页面（上千段）首帧收集为同步遍历**：编排器内已注释标注后续 `requestIdleCallback` 分片优化点（#5）。
- **观察器启动时机为 `await runPool` 之后**：翻译期间的新增内容靠启动后 mutation 补偿，存在理论窗口期，后续可提前启动观察器（#5）。
- **强样式页面人工验证未执行**（验收标准 11）：需产品/QA 配合（#7 S4）。
- **PERMISSIONS-JUSTIFICATION.md 待补 contextMenus 用途说明**：商店 listing 合规材料（#7 B1）。
- **task #4（b922fb74）任务索引仅 `index.md`**：原任务为产线之外的"占位 / 后续 task"框架，产品代码在 `releases/v0.4/toolbar/` 沉淀，CHANGELOG 已在 #4 中重建（追溯自 `releases/v0.4/toolbar/CHANGELOG.md`）。
- **task #8（000a65d5）任务索引仅 `index.md`**：CHANGELOG 重建自 `shared/fullpage/renderer.test.ts` 的「无 aria-label / 无文案 / 仅 spinner + role」断言。
- **task #11（3bd60c32）任务索引仅 `index.md`**：CHANGELOG 重建自上游 #8 + #10 的合并验证记录（基线 372 → 381 单测）。

## 7. 沉淀记录

- 7 个任务有新增/变更长期知识（共 11 条知识更新，含复用既有 ID 的扩展与新建）。
- 3 个任务（#4、#8、#11）无长期知识沉淀。
- 5 个分类索引同步（`feature:index` / `runbook:index` / `context:root` 等）。

## 8. 后续

- v0.4.1+ 可考虑：进度指示器细化、批量重试策略优化、多页面翻译状态管理、提前启动观察器、`requestIdleCallback` 分片收集、强样式页面人工验证与回归、PERMISSIONS-JUSTIFICATION.md 补全。
