# 扩展 e2e 验证视口优先调度与恢复清理

> 任务 ID: `a3ea2058-c5bb-45be-a488-09aadf1ac4ec`
> 父迭代: `v0.4.0` 全文翻译
> 关联知识: `runbook:e2e:fullpage-trigger-assertions`、`feature:fullpage:e2e-mock-contract`、`feature:fullpage:segmenter-pool`（视口工具与编排器集成小节）、`feature:fullpage:orchestrator`

## 1. 背景

v0.4.0 全文翻译引入了「视口优先」调度（任务 `83a350c8-48b5-4875-b7a2-8f97e90f13af`）：编排器在 `doStart` 入口按 `isSegmentInViewport` 把分段拆为「视口内立即入池 / 视口外挂 `IntersectionObserver` 观察滚动进入」两组，并共用 `viewportObserver` 句柄；`handleRestore` / `__reset` 末尾 `disconnect` 清理。

**当前缺口**：现有 8 个 e2e 用例（`e2e/fullpage.spec.ts`）的 fixture（`e2e/fixtures/fullpage-test-page.html`）在标准 1280×720 视口下总高 < 600px，**9 段全部在视口内**，因此视口优先的两条关键行为——

1. 视口外段不在 `doStart` 派发，只有滚动进入后才入池；
2. 恢复原文后 `IntersectionObserver` 已 `disconnect`，再滚动不触发新请求；

——**从未被 e2e 覆盖**。本任务为 e2e 增加这两个用法的回归保护。

## 2. 总体架构

不动生产代码（视口工具、编排器已落地，本任务只补 e2e 覆盖），仅扩展 e2e：

| 模块 | 状态 | 说明 |
|------|------|------|
| `e2e/fixtures/fullpage-viewport-test-page.html` | 新增 | 视口优先调度专用 fixture：3 视口内 + 6 视口外段 |
| `e2e/fullpage.spec.ts` | 新增 2 个用例 | 视口外滚动入池 + 恢复后 IO disconnect 清理 |
| `e2e/mock-server.ts` | 不动 | 复用既有 `getRequestCount` / `resetRequestCount` |
| `e2e/fixtures.ts` | 不动 | 复用既有持久化 context 模式 |

## 3. 数据契约

### 新 fixture 段清单

| ID | 类型 | 视口位置 | 用途 |
|---|---|---|---|
| `#in-1` | `<p>` | 视口内 | 第 1 段立即入池 |
| `#in-2` | `<p>` | 视口内 | 第 2 段立即入池 |
| `#in-3` | `<p>` | 视口内 | 第 3 段立即入池 |
| `#out-1` | `<p>` | 视口外（前置 2000px spacer） | 滚动后入池 |
| `#out-2` | `<p>` | 视口外 | 滚动后入池 |
| `#out-3` | `<p>` | 视口外 | 滚动后入池 |
| `#out-4` | `<p>` | 视口外 | 滚动后入池 |
| `#out-5` | `<p>` | 视口外 | 滚动后入池 |
| `#out-6` | `<p>` | 视口外（后置 2000px spacer） | 滚动后入池 |

> **9 段总数与现有 fixture 一致**，新 fixture 的 9 段分为 3 视口内 + 6 视口外。
> 段 ID 加前缀（`in-` / `out-`），避免与现有 fixture（`#para-1` 等）冲突。

**视口外推方法**：在每个 `#out-N` 段**前后**插入 `<div class="spacer" style="height:2000px"></div>`，强制把段落推到屏幕外（视口高度 720，2000px spacer + 段落高度 < 720 即视口外）。

### 段 ID 与 jsdom / 真实 Chromium 行为对齐

`isSegmentInViewport` 的 `getClientRects().length === 0` 兜底是为了 jsdom，**真实 Chromium 不会命中这条**。Playwright 加载真实 Chromium，`getBoundingClientRect` / `getClientRects` 返回真实几何数据，按 `rect.top < innerHeight && rect.bottom > 0` 严格不等式判定。

> 视口优先判定「边界相切视口外」的严格不等式：2000px spacer + 段高 ≈ 2050px > 720，所有 `#out-N` 的 `rect.top ≥ 2000` ⇒ `2000 < 720` 不成立 ⇒ 视口外。

### 用例断言

**用例 1：视口外段滚动到视口后才入池**
1. 触发全文翻译（`replace`）。
2. 立即断言：3 个视口内段已译出（`#in-1..#in-3` 文本 = `MOCK_TRANSLATION`）。
3. 断言：`getRequestCount('/v1/chat/completions') === 3`（仅视口内段触发请求）。
4. 断言：6 个视口外段仍为原文（`#out-1..#out-6` 文本 = 各自原文）。
5. `page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))`。
6. `expect.poll` + `timeout: 15_000` 等 6 个视口外段全部译出。
7. 断言：`getRequestCount('/v1/chat/completions') === 9`。

**用例 2：恢复原文后 IntersectionObserver 已 disconnect**
1. 用现有 fixture（9 段都在视口内）触发 `replace` → 等待 `waitForReplaceSettled`。
2. 工具栏点击「恢复原文」→ 等待注入残留清空。
3. 记录当前请求计数 `countBefore`。
4. `page.evaluate` 滚动到底部，等待 2 秒（足够任何遗留 IO 触发）。
5. 断言：`getRequestCount('/v1/chat/completions') === countBefore`（无新请求 ⇒ IO 已 disconnect）。
6. 再次触发全文翻译 → 等待 settle → 断言请求计数 +9（恢复后重触发正常派发，与视口清理无关）。

## 4. 关键设计权衡

### 决策 1：新建独立 fixture，不改现有 fixture

- **理由**：现有 8 个用例的「相对时序断言」依赖「全部 9 段同时入池」语义，引入视口外段会破坏「#para-1 译出时 #para-4 仍原文」的时序条件（视口内段会先入池、视口外段在 IO 命中后才入池，#para-1 vs #para-4 的相对时序可能因 #para-4 恰好在视口内而仍可断言，但若 #para-4 变视口外则完全错乱）。
- **被否决方案**：改现有 fixture 把 6 段推视口外 —— 风险面太大，违反「不修改现有 8 个用例」约束。

### 决策 2：段 ID 用 `in-` / `out-` 前缀

- **理由**：避免与现有 `#para-1` 等 ID 冲突；并使「视口内」「视口外」语义在测试代码中一目了然。
- **被否决方案**：沿用 `#para-1..#para-9` —— 易与现有 fixture 混淆，断言代码不清晰。

### 决策 3：spacer 用 `<div>` 元素，不用 `padding-top` 撑高

- **理由**：用 `<div>` 元素是 jsdom / 真实 Chromium 一致的几何模型。`padding` 在 `body` 上累计时，body 子元素分布保持 DOM 顺序，spacer 元素也参与 DOM 树（但不会被 `collectSegments` 收为段，因其无字母文本）。

### 决策 4：恢复后用「滚动 + 等 2s + 计数不变」验证 IO disconnect

- **理由**：编排器在 `handleRestore` 末尾 `viewportObserver?.disconnect(); viewportObserver = null;`，disconnect 后 observe 是 no-op。滚动 2 秒已远超 IO callback 微任务排入时间，若 IO 未 disconnect 滚动一定会触发新请求。
- **被否决方案**：直接读 `IntersectionObserver` 内部状态 —— 不可行，IO 实例被模块级 `viewportObserver` 持有，无法从 content 外部读。

### 决策 5：用例 2 不加「再次触发」步骤

- 任务描述只要求「断言再滚动不触发新请求」；但**为防止 §4.4 反向误用**（即 IO 被 disconnect 但整体功能被破坏），补「恢复后重触发 + 计数 +9」是必要的安全网。
- **被否决方案**：仅断言「滚动不增加」 —— 若实现把整个派发都禁用了也会通过该断言，无法识别「过度清理」bug。

> 最终用例 2 在任务要求之上补「重触发回归」步骤（`+9` 断言），确保 IO disconnect 不影响再次触发。这是任务边界外的小增强（不修改任务描述的核心断言，但补足回归保护），属于「验证强度」增强。

## 5. 边界与风险（审查反馈修订）

### 修订:用例 2「恢复原文后 IO disconnect」存在假阳性缺陷

**审查反馈**:
> 用例 2「恢复原文后 IntersectionObserver 已 disconnect」存在关键设计缺陷,导致该用例成为假阳性测试——无法捕获 handleRestore 末尾 disconnect 调用被移除的回归。

**原设计缺陷根因**:
- 用例 2 复用现有 fixture（9 段全部在视口内）。
- 触发全文翻译后,9 段全部入池并完成,`viewportObserver` 句柄在 0 视口外段的场景下**根本不会被创建**(doStart 仅在 `outOfView.length > 0` 时才 `createViewportEnterObserver`)。
- 恢复原文后,即使 `handleRestore` 末尾**不调用** `viewportObserver.disconnect()`,也无任何 IO 监听在监听段,滚动永远不触发回调。
- 断言「请求计数不变」**永远通过**,无法捕获 `disconnect` 调用被移除的回归。

**更深层的假阳性**:即使把用例 2 改为使用视口优先 fixture,让 6 视口外段真正注册到 IO,仅断言「请求计数不变」也**仍然不充分**:
- 恢复后 `active = false`、`sessionGeneration++`。
- 滚动 → IO `onEnter(seg)` → `enqueueSegments([seg], generation)` → `markSegmentsLoading` 重新加 loading 宿主 → `runPool` 入口 `shouldStop` 校验 `isSessionActive(generation)` 失败 → 提前 break → **0 新请求**。
- 「请求计数不变」这一断言对「`disconnect` 已调用」和「`disconnect` 未调用」**都通过**,依然是假阳性。

**正确的回归保护**:
必须断言**两类观察**:
1. **强观察:无新 `[data-llm-translator]` 宿主**。`onEnter` 内部 `markSegmentsLoading` 在 `runPool` 提前 break 之前先加 loading 宿主,断绝的只是「去派发请求」,没断绝「加 loading 宿主」。若 IO 未 `disconnect`,滚动会重新加 6 个 loading 宿主 → `[data-llm-translator]` count > 0。
2. **弱观察:请求计数不变**(应保留为 sanity check,但**不作为唯一断言**)。即便此条通过,1 失败仍能锁定回归。

**修订后的用例 2 流程**:
1. 用 `viewportTestPageUrl`(3 视口内 + 6 视口外)。
2. 触发全文翻译 `replace`。
3. 等待 3 视口内段(`#in-1..#in-3`)译出。
4. 断言:`getRequestCount === 3`(确认 6 视口外段仍未派发,仍注册在 IO)。
5. 断言:6 视口外段(`#out-1..#out-6`)仍为原文(loading 宿主可见但文本未变)。
6. 记录 `dataTranslatorCountBefore = page.locator('[data-llm-translator]').count()`(应为 6,6 视口外段都挂 loading 宿主)。
7. 点击「恢复原文」:清理全部段,`handleRestore` 末尾应 `viewportObserver.disconnect()`。
8. 断言:`[data-llm-translator]` count = 0(恢复清理完整性)。
9. **分步滚动**(半视口步进,与用例 1 相同),让 6 视口外段都经过视口中央。
10. 等待 2 秒(IO callback 微任务排入 + 任何遗留派发)。
11. 断言:6 视口外段**仍为原文**(`#out-1..#out-6` 不含译文)。
12. 断言:`[data-llm-translator]` count **仍为 0**(核心断言:IO 已 `disconnect`,`onEnter` 永不触发)。
13. 断言:请求计数仍为 3(sanity check,即使 IO 未 `disconnect`,`shouldStop` 也会阻止新请求,但此条确保「无副作用派发」)。

**对应回归捕获**:
- 若 `handleRestore` 末尾 `viewportObserver?.disconnect()` 被移除 → 滚动 → 6 `onEnter` 触发 → 6 loading 宿主出现 → 断言 12 失败。
- 若 `viewportObserver` 句柄共享逻辑出错(如 `doStart` 入口未 disconnect 旧实例但 `handleRestore` 误置 null) → 滚动 → 6 `onEnter` 触发 → 断言 12 失败。

### 既有边界与风险

- **body 高度计算**:`padding: 24px` + 3 视口内段(每段约 30-50px)≈ 200px,前 2000px spacer 把 `#out-1` 推到 2000px+,Playwright 默认视口 1280×720,3 视口内段在 720 内可断言。
- **IO callback 异步**:`expect.poll` + `timeout: 15_000` 足够覆盖滚动后 IO 触发的微任务 + `runPool` 派发 + 300ms 延迟 + onSettled。
- **用例 2 滚动时机**:恢复原文后工具栏被移除(断言「`[data-llm-translator]` count=0」即隐含),滚动后无副作用,IO 已 disconnect 不再派发。
- **fixture 段 ID 与 jsdom 兼容**:`isSegmentInViewport` 在 jsdom 下因 `getClientRects().length === 0` 全部视为视口内,所以新 fixture 在 jsdom 单测中行为等同现有 fixture(不影响);仅真实 Chromium 下视口分组生效。e2e 用例使用真实 Chromium 不受此影响。

## 6. 实施步骤

1. 新建 `e2e/fixtures/fullpage-viewport-test-page.html`（9 段 = 3 视口内 + 6 视口外 + spacer）。
2. 在 `e2e/fullpage.spec.ts` 顶部新增 `viewportTestPageUrl` 常量。
3. 编写用例 1「视口外段落滚动到视口后才入池」（新 fixture + 视口外段延迟入池断言）。
4. 编写用例 2「恢复原文后 IntersectionObserver 已 disconnect」（现有 fixture + 滚动无新请求）。
5. 跑 `pnpm test:e2e e2e/fullpage.spec.ts`：原 8 + 新 2 = 10 用例全绿。

## 7. 验证门禁

- `pnpm test:e2e e2e/fullpage.spec.ts` 全绿（10 用例）。
- 原 8 用例零回归（视口内 fixture 不变，时序断言不变）。
- 新增 2 用例覆盖视口优先调度的两条核心行为。
- 失败用例 1：`isSegmentInViewport` 缺失/无视口分组 → 视口外段立即派发，请求计数 > 3。
- 失败用例 2：`handleRestore` 末尾未 `disconnect` → 滚动触发新请求，计数 +1+。

## 8. 不在本任务范围

- 编排器代码改动（视口工具与 doStart/handleRestore 已就位）。
- 工具栏文案、按钮、视觉。
- 任何其他 e2e 用例的时序或结构变更。
- 新 fixture 中加入 `#add-paragraph` 按钮（任务要求 JS 同现有 fixture 可省略）。
