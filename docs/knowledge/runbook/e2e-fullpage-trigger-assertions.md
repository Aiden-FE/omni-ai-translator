---
id: runbook:e2e:fullpage-trigger-assertions
type: runbook
status: active
owner: project
updated: 2026-08-04
confidence: 0.9
sources:
  - e2e/fullpage.spec.ts
  - e2e/fixtures/fullpage-viewport-test-page.html
  - shared/fullpage/orchestrator.ts
  - shared/fullpage/translate-pool.ts
  - shared/fullpage/renderer.ts
  - docs/iterations/v0.4.0/tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md
  - docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md
  - docs/iterations/v0.4.0/tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/DESIGN.md
  - docs/iterations/v0.4.0/tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/CHANGELOG.md
related:
  - feature:fullpage:e2e-mock-contract
  - feature:fullpage:command-channel
  - feature:fullpage:orchestrator
  - feature:fullpage:segmenter-pool
  - context:system:permissions-privacy
  - runbook:dev-commands
---

# 扩展 e2e 触发技术与渐进渲染断言（v0.4.0 全文翻译）

> 以 `e2e/fullpage.spec.ts` 当前代码为准。覆盖两类可复用 e2e 技术：(1) 无 `tabs` 权限下经 service worker 触发 background → content 命令；(2) 渐进渲染的相对时序断言。适用于后续为右键菜单 / background 命令触发的扩展功能编写 Playwright e2e。

## 技术 1：SW 直发 BackgroundCommand + 全页签广播

### 为什么不能用 URL 精确匹配页签

Playwright 无法操作浏览器原生右键菜单，e2e 改为在 service worker 内 `sw.evaluate` 直发 t1 契约的 `BackgroundCommand`（与真实右键链路在 content script 侧汇合，content 侧行为与线上一致）。初版方案按 `tabs.find(t => t.url === page.url())` 精确匹配目标页签，但**实测不可行**：

- 扩展 manifest 无 `tabs` 权限（见 `context:system:permissions-privacy`），且 `host_permissions` 不含 `file://`；
- 此时 `chrome.tabs.query({})` 返回的 `Tab.url` / `Tab.title` 被 Chrome 剥离（`undefined`），按 URL 匹配永远落空；
- 不应为 e2e 放宽生产权限基线（最小权限原则）。

### 落地模式：广播 + Promise.allSettled + 0 送达抛错

```ts
await sw.evaluate(async (m) => {
  const tabs = await chrome.tabs.query({});
  const results = await Promise.allSettled(
    tabs.map((t) =>
      t.id === undefined
        ? Promise.reject(new Error('tab without id'))
        : chrome.tabs.sendMessage(t.id, { type: 'fullpage-translate', mode: m }),
    ),
  );
  const delivered = results.filter((r) => r.status === 'fulfilled').length;
  if (delivered === 0) {
    throw new Error('fullpage e2e: no tab consumed the command (content script not injected?)');
  }
}, mode);
```

语义要点：

1. **广播确定送达唯一目标**：仅注入了对应 content script 的页签（`file://` 测试页）注册了 `runtime.onMessage` 接收端，`sendMessage` 成功；其余页签（初始空白页等）无接收端 reject，由 `Promise.allSettled` 吞掉，不影响测试。
2. **0 送达抛错快失败**：全部 reject 说明 content script 未注入（装配错误），立即抛错而非静默挂起。
3. **隔离前提**：每用例独立持久化 context（fixture）且仅一个测试页 tab，广播不跨用例残留；options 配置页用后即关，避免多接收端。
4. **SW 回收兜底**：触发前先 `context.serviceWorkers().find(w => w.url().includes('background'))`，找不到则 `context.waitForEvent('serviceworker', { predicate, timeout: 10_000 })` 等待唤醒（同 `e2e/fixtures.ts` 既有模式）。
5. **类型支持**：`sw.evaluate` 内使用 `chrome.tabs` API 需 `e2e/tsconfig.json` 的 `types` 包含 `"chrome"`（仅编辑器侧类型，不影响运行）。

## 技术 2：渐进渲染用相对时序断言（禁绝对时间）

并发翻译池 `concurrency=3` + mock 非流式 300ms 延迟（`NONSTREAM_DELAY_MS`，见 `feature:fullpage:e2e-mock-contract`）使 9 个测试段分 3 批 settle，批次间隔 300ms 远超断言执行耗时。断言「渐进」用**相对时序**：

```ts
// 第 2 批的 #para-1 译出（等待至译出即返回）时，第 3 批的 #para-4 仍是原文（此刻立即命中）
await expect(page.locator('#para-1')).toHaveText(MOCK_TRANSLATION, { timeout: 15_000 });
await expect(page.locator('#para-4')).toHaveText(PARA4_ORIGINAL);
```

- **自校验**：若时序被意外打破（如并发模型变更导致 #para-4 提前译出），第二条断言会 polling 超时失败——非静默通过。
- **禁止** `page.waitForTimeout` + 绝对时间断言：CI 抖动高危，必须避免。
- 超时预算 10–15s，进一步吸收 CI 抖动。

### 配套：「全部请求落盘」等待点（waitForSettled）

请求计数断言（切换模式免重译 / 缓存复用 / 增量 +1）前必须确保所有段已 settle。利用批次归纳：`#para-4`、`footer`、`#add-paragraph` 同属最后一批，三者文本均变为译文 ⇒ 末批全部 settle ⇒ 此前批次更早完成 ⇒ 请求计数稳定。封装统一 `waitFor*Settled()`，避免逐用例手写易错。

## 辅助：shadow DOM 断言策略

- 工具栏按钮：Playwright role 引擎穿透 open shadow root，`getByRole('button', { name })` 直接定位点击（aria-label 提供可访问名）。
- 译文块 / 失败徽标：宿主在 light DOM（`.llm-translator-block-host` / `.llm-translator-failed-host`，可用 `#para-1 + .llm-translator-block-host` 相邻兄弟选择器断言位置）；shadow 内文本用 `expect.poll` + `evaluate(el => el.shadowRoot?.textContent)` 读取。

## 技术 3：IntersectionObserver 触发的分步滚动策略

编写依赖 IO / 滚动触发的 Playwright e2e（如「视口外段滚动入池」「视口外段恢复清理」）时，**禁止**用单次 `window.scrollTo(0, document.body.scrollHeight)` 跳到底部。这条常见陷阱的具体表现：

- `IntersectionObserver` 仅在元素相交状态改变时触发回调。
- 滚到底部时，位于「视口上方之外」的段其状态从「初始未相交」变「最终仍未相交」（滚过了视口顶部）→ **IO 不触发 onEnter**。
- 现象：6 个 `#out-N` 段在 fixture 初始位置 `top > 2000px`，单步跳到底时全部位于 `top < -2000px`，IO 永远不触发，测试通过断言「段未译出」但**真正译出的路径未走到**。

### 落地模式：半视口步进 + rAF + 末尾 scrollTo bottom

```ts
await page.evaluate(async () => {
  const total = document.body.scrollHeight;
  const step = window.innerHeight / 2; // 半视口步进,保证每步都跨越新内容
  for (let y = 0; y <= total; y += step) {
    window.scrollTo(0, y);
    // 让 IO callback 排入微任务
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  // 最后跳到底部确保最后一段也被触发
  window.scrollTo(0, total);
  await new Promise((r) => requestAnimationFrame(() => r()));
});
```

语义要点：

1. **半视口步进**：每步跨越半个视口高度，让每个目标元素都自然经过视口中央，IO 状态从「未相交」→「相交」→「未相交」变更。
2. **requestAnimationFrame 间隔**：每步 `await rAF`，让 IO callback 排入微任务队列而非被密集 scrollTo 吞掉。
3. **末尾 scrollTo bottom**：循环结束后再跳一次底部，确保最后一段（最高 top）也进入过视口。
4. **后续足够 poll timeout**：IO 触发是异步的（microtask / task），`runPool` 派发 + 300ms 延迟 + onSettled；`expect.poll` + `timeout: 15_000` 足够。
5. **被否决方案**：让 spacer 高度 < innerHeight 以确保滚到底时所有段都在视口内 → 数学上不可行，body 高度至少 N × 视口高度 + 段高，scrollHeight 时总有部分段在视口上方外。

### 适用条件与替代

- 仅对真实 Chromium 下使用 jsdom 兜底路径的 fixture 失效——新 fixture 在 jsdom 单测中 `getClientRects().length === 0` 全部视为视口内，不触发该路径。
- 任何使用 Playwright `evaluate` 滚动的 e2e 都应复用本模式，无论元素是段、图片还是懒加载组件。
- `scrollIntoViewIfNeeded` 是单元素变体；多元素时仍用循环 scrollTo。

## 技术 4：disconnect/cleanup 验证的强/弱双断言（防假阳性）

编写「disconnect / cleanup 副作用已被清理」类断言时，**单看「请求计数不变」是假阳性陷阱**。编排器在 `handleRestore` 末尾 `viewportObserver?.disconnect(); viewportObserver = null;`，如果用例 fixture 中 0 视口外段（视口内 fixture）→ `viewportObserver` 句柄根本不会被创建 → 即使实现错误地删除了 `disconnect` 调用，**无任何 IO 在监听**，「请求计数不变」永远通过。`a3ea2058` 任务审查反馈修订发现的更深层假阳性：即使改用视口优先 fixture 让 6 视口外段真实注册到 IO，仅断言「请求计数不变」也**仍然不充分**——

- 恢复后 `active = false`、`sessionGeneration++`。
- 滚动 → IO `onEnter(seg)` → `enqueueSegments([seg], generation)` → `markSegmentsLoading` 重新加 loading 宿主 → `runPool` 入口 `shouldStop` 校验 `isSessionActive(generation)` 失败 → 提前 break → **0 新请求**。
- 「请求计数不变」对「`disconnect` 已调用」和「`disconnect` 未调用」**都通过**。

### 落地模式：强观察 + 弱观察组合断言

```ts
// 强观察：核心断言,捕获 disconnect 被移除的回归
await expect(page.locator('[data-llm-translator]')).toHaveCount(0);

// 弱观察：sanity check,即使 IO 未 disconnect runPool 也会阻断派发,
// 但与强断言组合共同锁定「IO 已 disconnect」语义
expect(getRequestCount(CHAT_ROUTE)).toBe(countBefore);
```

语义要点：

1. **强观察**——`[data-llm-translator]` 宿主计数为 0：因 `onEnter` 内部 `markSegmentsLoading` 在 `runPool` 提前 break **之前**先加 loading 宿主。断绝的只是「去派发请求」，没断绝「加 loading 宿主」。若 IO 未 `disconnect`，滚动会重新加 N 个 loading 宿主 → `[data-llm-translator]` count > 0，断言失败。
2. **弱观察**——请求计数不变：保留为 sanity check。验证「即使 IO 未 disconnect，runPool 也会阻断派发」仍然成立，但**不作为唯一断言**。
3. **fixture 前提**：必须用视口优先 fixture（3 视口内 + 6 视口外），让 6 视口外段真实注册到 IO。视口内 fixture 永远不创建 `viewportObserver` 句柄，本断言无意义。
4. **被否决方案**：直接读 `IntersectionObserver` 内部状态——不可行，IO 实例被模块级 `viewportObserver` 持有，无法从 content 外部读。
5. **TDD 实证**：临时注释掉 `shared/fullpage/orchestrator.ts` 中 `handleRestore` 末尾 `viewportObserver?.disconnect();` 与 `viewportObserver = null;` 两行，重建并跑用例 2，实测 `Received: 6`（6 视口外段的 onEnter 触发后 `markSegmentsLoading` 加的 loading 宿主）→ 用例失败。还原后全绿。

## 复用场景

- 后续为右键菜单 / background 命令触发的扩展功能（如新增 `BackgroundCommand` 类型）编写 e2e 时，复用「SW 广播下发 + Promise.allSettled + 0 送达抛错」触发模式。
- 任何需要断言「渐进 / 分批渲染」的 e2e（流式输出、并发批处理 UI），复用「先行元素已完成 && 后行元素未完成」的相对时序断言替代绝对时间。
- 新增权限相关的 e2e 排查：先核对 manifest 权限对 `chrome.tabs.*` 返回字段的影响，再设计页签定位策略。
- 编写依赖 IO / 滚动触发的 Playwright e2e（懒加载、视口优先调度、文本阅读进度跟踪）时，复用「半视口步进 + rAF + 末尾 scrollTo bottom」滚动模式，避免单次 scrollTo 跳到底部导致 IO 不触发的常见陷阱。
- 编写「disconnect / cleanup 副作用已被清理」类断言（如验证 observer 句柄、订阅、worker 终止）时，必须组合「强观察（宿主 / 副作用元素计数为 0）+ 弱观察（请求 / 事件计数不变）」双断言，避免仅「计数不变」的假阳性；同时确认 fixture 让被清理资源真实被创建。

## 审查验证（REVIEW.md）

v0.4.0 全文翻译审查（REVIEW.md，2026-08-03）确认：

- **15 e2e 全绿**（7 划词 + 8 全文翻译），覆盖验收标准 1-11。
- **技术 1（SW 广播触发）**：§4.5 确认 `contextMenus` 权限正确（manifest 含 `contextMenus` + 双 content script），Firefox MV2 兼容（`browser.contextMenus` 原生支持）。
- **技术 2（相对时序断言）**：验收标准 2 确认--`#para-1` 译出时 `#para-4` 仍原文（相对时序断言自校验通过）。
- **shadow DOM 断言**：验收标准 4（双语对照）、8（失败徽标）均通过 `getByRole` + `expect.poll` shadow 穿透断言。

## 来源证据

- `e2e/fullpage.spec.ts`：`triggerFullpageTranslate`（SW 查找 / waitForEvent 兜底 / 广播 / allSettled / 0 送达抛错）、用例 1 相对时序断言（`#para-1` vs `#para-4`）、`waitForReplaceSettled` 批次归纳等待、shadow DOM 断言（getByRole / expect.poll）、用例「视口外段落滚动到视口后才入池」（`openTestPageUrl` + 半视口步进滚动 evaluate + 逐段 poll + 请求计数从 3 增 9）、用例「恢复原文后 IntersectionObserver 已 disconnect,滚动不触发新 loading 宿主」（视口 fixture + 6 视口外段保留 loading 宿主 + 恢复后强/弱双断言）。
- `e2e/fixtures/fullpage-viewport-test-page.html`：视口优先调度专用 fixture，3 视口内 + 6 视口外 + `<div class="spacer" style="height:2000px">` 撑高元素,jsdom / 真实 Chromium 一致识别。
- `shared/fullpage/orchestrator.ts`：`handleRestore` 末尾 `viewportObserver?.disconnect(); viewportObserver = null;`（line 264-265 附近）。
- `shared/fullpage/translate-pool.ts`：`isSegmentInViewport` / `createViewportObserver` / `runPool` 的 `shouldStop` 中 `isSessionActive(generation)` 校验。
- `shared/fullpage/renderer.ts`：`markLoading` / `restoreAll` / `clearLoadingMark` 副作用差异（loading 宿主在 runPool 提前 break 之前已加,断绝派发但不切断 onEnter 副作用）。
- `docs/iterations/v0.4.0/tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md`：§2.3 相对时序断言决策与被否决方案（绝对时间）、§2.4 触发通道修正经过（Tab.url 剥离 → 广播落地）与风险对策。
- `docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md`：§4.5 兼容性（contextMenus 权限 + Firefox MV2 + Shadow DOM 支持）、验收标准 1-3（渐进渲染时序）、4（双语对照 shadow 断言）、8（失败徽标 shadow 断言）逐条确认。
- `docs/iterations/v0.4.0/tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/DESIGN.md`：§5 修订反馈（用例 2 原设计假阳性根因 + 强/弱双断言修订流程 + TDD 回归捕获）；技术 3 决策 4（分步滚动根因）、技术 4 决策 5（重触发回归增强）。
- `docs/iterations/v0.4.0/tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/CHANGELOG.md`：v2 修订（用例 2 假阳性消除） + 决策 4（分步滚动根因） + 验证（20 e2e 全绿 + TDD-RED 实证）。
