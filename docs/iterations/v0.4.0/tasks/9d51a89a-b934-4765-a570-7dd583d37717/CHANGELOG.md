# CHANGELOG — 编写全文翻译 e2e 用例并扩展 mock server

## 变更摘要

为 v0.4.0 全文翻译链路补齐 Playwright e2e 覆盖（验收标准 1-11 核心链路 + 12 工程门禁），
并扩展 mock server 支撑计数/失败/延迟三类断言。不改动任何生产代码。

## 新增

- `e2e/fixtures/fullpage-test-page.html` — 全文翻译测试页：nav（3 链接列表）+ main（4 正文段，
  `#para-fail` 含 `__FAIL__` 标记）+ footer + `button#add-paragraph`（点击追加 `<p id="added-para-N">`）。
  jsdom + collectSegments 实测共 9 段（3 nav 行内 + 4 块级段 + footer + 按钮行内）。
- `e2e/fullpage.spec.ts` — 8 个用例：
  1. 替换模式触发 → 渐进渲染（相对时序：`#para-1` 译出时 `#para-4` 仍原文，最终全部译出）；
  2. 双语对照（原文不变 + `.llm-translator-block-host` × 9 + shadow 内含译文）；
  3. 切换模式 DOM 翻转且 `getRequestCount()` 不变（免重译，标准 6/10）；
  4. 恢复原文（无 `[data-llm-translator]` 残留 + textContent 逐字还原 + 工具栏消失）；
  5. 失败重试（`__FAIL__` 段保留原文 + 失败徽标 ⚠ + 重试按钮；复位后重试译出、徽标消失、按钮隐藏）；
  6. 增量翻译（点 `#add-paragraph` → 新段自动译出，请求数恰好 +1）；
  7. 缓存复用（恢复后再次触发，首触发 9 请求，再触发 0 新请求）；
  8. 工具栏收起/唤出（收起后把手可见，点把手恢复）。
- `e2e/mock-server.ts` 扩展：
  - `NONSTREAM_DELAY_MS = 300` — 非流式成功响应统一 300ms 可观测延迟（四路由一致），支撑渐进渲染相对时序断言；
  - `getRequestCount(route?)` / `resetRequestCount()` — 按路由（pathname）累计请求数（含失败请求），
    供免重译/缓存复用/增量精确计数断言；
  - `setFailMode(on)` — 失败开关：开启后 OpenAI 兼容路由仅对请求体含 `__FAIL__` 的请求返回 500
    （快速失败无延迟），实现「部分失败隔离」场景。

## 修改

- `e2e/tsconfig.json` — types 增加 `"chrome"`（sw.evaluate 内 `chrome.tabs` API 类型，仅编辑器侧）。

## 关键决策与偏差记录

- **失败开关语义**：按请求内容匹配 `__FAIL__` 子串返回 500，而非全局 500——保留 fixture 标记的技术意义，
  并验证「部分失败隔离」（DESIGN §2.1）。
- **触发页签定位（相对初版设计的偏差）**：初版按 `tabs.find(t => t.url === page.url())` 精确匹配；
  实测 manifest 无 `tabs` 权限且 host_permissions 不含 `file://`，`Tab.url/title` 被 Chrome 剥离，
  URL 匹配不可行。改为向全部页签广播：仅注入 content script 的测试页有接收端，
  `Promise.allSettled` 吞掉无接收端 reject，0 送达抛错快失败（DESIGN §2.4 已回填）。
- **渐进渲染断言**：只用相对时序（「首段已译 && 末段未译」），不用绝对时间，批次间隔 300ms 抗 CI 抖动。

## 验证（实际运行）

- `pnpm e2e e2e/translate.spec.ts` → 7 passed（mock 扩展后既有用例零回归）
- `playwright test e2e/fullpage.spec.ts` → 8 passed
- `pnpm e2e`（全量）→ 15 passed
- `pnpm typecheck` → 通过
- `pnpm lint` → 通过
- `pnpm test` → 15 文件 309 passed（单元测试零回归）
