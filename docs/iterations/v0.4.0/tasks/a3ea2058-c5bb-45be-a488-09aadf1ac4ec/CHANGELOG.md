# 扩展 e2e 验证视口优先调度与恢复清理 — CHANGELOG

> 任务 ID: `a3ea2058-c5bb-45be-a488-09aadf1ac4ec`
> 父迭代: `v0.4.0` 全文翻译

## 本次任务变更

### 修订（审查反馈 v2）

- **用例 2「恢复原文后 IO disconnect」消除假阳性**:
  - 原实现使用现有 fixture（9 段全视口内），`viewportObserver` 句柄不会被创建，
    「请求计数不变」断言**无法捕获 `handleRestore` 末尾 `disconnect` 调用被移除的回归**。
  - 修订：改用 `viewportTestPageUrl`（3 视口内 + 6 视口外），让 6 视口外段真实注册到 IO。
  - 增强断言：
    - 强观察：滚动后 `[data-llm-translator]` count **必须为 0**。
      - 原理：即使 IO 未 `disconnect`，`runPool` 的 `shouldStop` 会阻止新请求派发，
        但 `onEnter` 内部的 `markSegmentsLoading` 仍会**先**加 loading 宿主再 break。
        仅断绝派发，不切断 onEnter 副作用。
      - `disconnect` 被移除时此处会出现 6 个新 loading 宿主，断言失败。
    - 弱观察：请求计数仍为 3（保留为 sanity check，验证 runPool 提前 break 也工作）。
  - 用例名加 改为「滚动不触发新 loading 宿主」以明确验证点。

### 新增

- **`e2e/fixtures/fullpage-viewport-test-page.html`**：视口优先调度专用 fixture
  - 9 段：3 视口内 (`#in-1..#in-3`) + 6 视口外 (`#out-1..#out-6`)
  - 段间用 2000px `<div class="spacer">` 元素把后续段落强制推到视口外
  - Playwright 默认视口 1280×720，前 3 段在视口内可正常断言；6 段初始 top > 2000px 视口外
  - 段 ID 加 `in-` / `out-` 前缀避免与现有 fixture（`#para-1` 等）冲突

- **`e2e/fullpage.spec.ts` 新增 2 个用例**：
  - **视口外段落滚动到视口后才入池**：触发全文翻译 → 断言 3 视口内段立即译出 + `getRequestCount === 3` → 6 视口外段仍原文 → 逐步滚动（半视口步进）→ 断言 6 视口外段译出 + `getRequestCount === 9`
  - **恢复原文后 IntersectionObserver 已 disconnect,滚动不触发新 loading 宿主（v2 修订）**：用视口 fixture 触发 → 3 视口内段译出 → 6 视口外段保留 loading 宿主且未译出（已注册到 IO）→ 恢复原文 → 分步滚动 → 等待 2s → **核心断言：`[data-llm-translator]` count = 0**（断绝 IO onEnter，不再加新 loading 宿主）+ 弱断言：请求计数不变（sanity check）

- **`e2e/fullpage.spec.ts` 顶部新增常量**：
  - `viewportTestPageUrl`：`file://.../fullpage-viewport-test-page.html` 绝对路径

- **`e2e/fullpage.spec.ts` 提取 `openTestPageUrl` 函数**：
  - 原 `openTestPage(context)` 委托到 `openTestPageUrl(context, testPageUrl)` 保持零行为变更
  - `openTestPageUrl` 接受自定义 URL，支持视口优先调度专用 fixture
  - 锚点等待改用 `#in-1, #para-1` 复合选择器，兼容两套 fixture

### 不变

- 现有 8 个 e2e 用例零回归
- `e2e/fixtures/fullpage-test-page.html` 不变（9 段在视口内，编排器视口分组退化为「全部视口内」）
- 现有 fixture 的「相对时序断言」（`#para-1` vs `#para-4`）保持不变
- `INITIAL_REQUEST_COUNT = 9` 仍成立（既有 fixture 9 段；新 fixture 也是 9 段）

## 设计决策

### 决策 1：新建独立 fixture，不改现有 fixture

- **理由**：现有 8 个用例的「相对时序断言」依赖「全部 9 段同时入池」语义。引入视口外段会破坏 `#para-1` 译出时 `#para-4` 仍原文的时序条件（视口内段会先入池、视口外段在 IO 命中后才入池）。
- **替代方案被否决**：改现有 fixture 把 6 段推视口外 —— 风险面太大，违反「不修改现有 8 个用例」约束。

### 决策 2：段 ID 用 `in-` / `out-` 前缀

- **理由**：避免与现有 `#para-1` 等 ID 冲突；使「视口内」「视口外」语义在测试代码中一目了然。
- **替代方案被否决**：沿用 `#para-1..#para-9` —— 易与现有 fixture 混淆，断言代码不清晰。

### 决策 3：spacer 用 `<div>` 元素，不用 `padding-top` 撑高

- **理由**：用 `<div>` 元素是 jsdom / 真实 Chromium 一致的几何模型。`padding` 在 `body` 上累计时，body 子元素分布保持 DOM 顺序，spacer 元素也参与 DOM 树（但不会被 `collectSegments` 收为段，因其无字母文本）。
- **关键点**：`collectSegments` 在 `getDirectTextNodes` 为空时不会创建段（即使 spacer 是块级 DIV），仍会向下递归（这里 spacer 无子节点，递归不进入）。

### 决策 4：分步滚动而非单次 `scrollTo(0, scrollHeight)`

- **理由**：`IntersectionObserver` 在元素「相交状态改变」时触发回调（从 `isIntersecting=false` 到 `true`）。单次 `scrollTo` 跳到底部时，位于视口上方之外的段其状态从「初始未相交」变「最终仍未相交」（滚过了视口顶部），**IO 不会触发 onEnter**。分步滚动（半视口步进）让每个 `#out-N` 都自然经过视口中央，触发 IO 进入 `isIntersecting=true`。
- **TDD 实证**：初版用 `window.scrollTo(0, document.body.scrollHeight)` 单步跳，6 段都未译出，debug 输出 `out1Top: -11751`、`out6Top: -1365`（全部在视口上方之外）。改分步滚动后立即全绿。
- **替代方案被否决**：让 fixture 中 spacer 高度 < innerHeight（如 500px）以确保滚到底时所有段都在视口内 —— 数学上不可行（body 高度至少 N × 视口高度 + 段高，scrollHeight 时总有部分段在视口上方外）。

## 关键约定

- **Open 滚动策略**：分步滚动 + requestAnimationFrame 让 IO callback 排入微任务队列；末尾再 `scrollTo(0, total)` 确保最后段经过视口。
- **断言顺序**：先确认视口内段已译出（IO 不参与）→ 计数 = 3（视口内）→ 视口外段初始为原文 → 滚动 → 视口外段译出 → 计数 = 9。`toHaveText` 断言不要求在视口内（Playwright 真实 Chromium 对屏外元素仍可读取 textContent 并轮询）。
- **失败开关复位**：与既有 `beforeEach / afterEach` 一致，新用例遵守 `setFailMode(false)` 复位约定（用例 1/2 不使用失败开关，但 beforeEach 仍会 `resetRequestCount`）。

## 边界与风险

- **单 worker + 持久化 context**：与既有约定一致，跨 spec 模块状态共享；新用例不引入跨例状态泄漏。
- **滚动时机**：用例 2 滚动后 `waitForTimeout(2_000)` 是吸收 IO callback 微任务排入 + runPool 派发的余量；不依赖绝对时间做断言。
- **jsdom 单测兼容**：新 fixture 中 9 段在 jsdom 下 `getClientRects()` 恒空 → `isSegmentInViewport` 兜底路径返回 `true` → 视口分组退化为「全部视口内」→ 行为等同现有 fixture（不污染 `translate-pool.test.ts` / `orchestrator.test.ts` 既有断言）。

## 验证（实测）

### v2 审查反馈修订后

| 验证项 | 命令 | 结果 |
|------|------|------|
| 单元测试 | `vitest run` | **381 passed** (16 files) |
| e2e | `playwright test` | **20 passed** (fullpage 10 + translate 10) |
| typecheck | `pnpm typecheck` | **passed**（vue-tsc 无错误） |
| lint | `pnpm lint` | **passed** |
| 扩展构建 | `pnpm build` | **success**（built in 800ms） |

### TDD-RED 实证（v2 修订后的用例 2）

为验证修订后用例 2 能捕获 `handleRestore` 末尾 `disconnect` 被移除的回归，临时将
`shared/fullpage/orchestrator.ts` 中 `handleRestore` 的 `viewportObserver?.disconnect();` 与
`viewportObserver = null;` 两行注释掉，重新构建并跑用例 2：

```
[chromium] › e2e/fullpage.spec.ts:360:1 › 恢复原文后 IntersectionObserver 已 disconnect,滚动不触发新 loading 宿主
  Error: expect(locator).toHaveCount(expected) failed
    Locator:  locator('[data-llm-translator]')
    Expected: 0
    Received: 6
    Timeout:  10000ms
```

预期：6 个新 `[data-llm-translator]` 宿主（6 视口外段的 onEnter 触发后 `markSegmentsLoading` 加的 loading 宿主）。
实测：与预期一致，测试失败。

还原 `disconnect` 调用后，重跑测试全绿。验证用例 2 不是假阳性。

### v1 验证（修订前）

| 验证项 | 命令 | 结果 |
|------|------|------|
| 单元测试 | `vitest run` | **381 passed** (16 files) |
| e2e | `playwright test` | **20 passed** (fullpage 10 + translate 10) |
| typecheck | `pnpm typecheck` | **passed**（vue-tsc 无错误） |
| lint (e2e) | `pnpm exec eslint --no-ignore e2e/fullpage.spec.ts` | **passed** |
| 扩展构建 | `wxt build` | **success**（built in 775ms） |
| Playwright Chromium | `playwright install chromium` | **downloaded** (chromium-1228) |

## 沉淀映射

无新增/变更产品代码;本次仅扩展 e2e 覆盖。视口优先调度的产品代码(`shared/fullpage/translate-pool.ts` `isSegmentInViewport` / `createViewportObserver`、`shared/fullpage/orchestrator.ts` `enqueueSegments` 提取 + `viewportObserver` 共享句柄 + `handleRestore` 末尾 disconnect 清理)已在任务 `83a350c8-48b5-4875-b7a2-8f97e90f13af` 落地。

## 知识沉淀

本次 e2e 扩展中提炼出两条可复用 e2e 技术,合并归并到现有长期知识 `runbook:e2e:fullpage-trigger-assertions` 文档(同一文档已覆盖 SW 广播触发、相对时序断言、shadow DOM 断言、waitForSettled 等待点,本轮追加「IO 滚动」与「disconnect 双断言」两条技术 3/4):

- **知识 ID**: `runbook:e2e:fullpage-trigger-assertions`(复用稳定 ID,同一 runbook 增补「技术 3:IO 触发的分步滚动策略」与「技术 4:disconnect/cleanup 验证的强/弱双断言」两节,未创建新文档,避免重复)
- **候选映射**:
  - 候选 0(技术 3:分步滚动)→ 合并至 `runbook:e2e:fullpage-trigger-assertions`
  - 候选 1(技术 4:强/弱双断言)→ 合并至 `runbook:e2e:fullpage-trigger-assertions`
- **复用场景**:
  - **技术 3** 适用于后续编写依赖 IntersectionObserver / 滚动触发的 Playwright e2e 用例(懒加载、视口优先调度、文本阅读进度跟踪等)时,复用「半视口步进 + rAF + 末尾 scrollTo bottom」模式,避免单次 scrollTo 跳到底部导致 IO 不触发的常见陷阱。
  - **技术 4** 适用于编写「disconnect / cleanup 副作用已被清理」类断言(如验证 observer 句柄、订阅、worker 终止)时,组合「强观察(宿主 / 副作用元素计数为 0)+ 弱观察(请求 / 事件计数不变)」双断言避免假阳性,同时确认 fixture 让被清理资源真实被创建。
