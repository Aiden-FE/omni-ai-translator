---
id: runbook:e2e:fullpage-trigger-assertions
type: runbook
status: active
owner: project
updated: 2026-08-03
confidence: 0.9
sources:
  - e2e/fullpage.spec.ts
  - docs/iterations/v0.4.0/tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md
  - docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md
related:
  - feature:fullpage:e2e-mock-contract
  - feature:fullpage:command-channel
  - feature:fullpage:orchestrator
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

## 复用场景

- 后续为右键菜单 / background 命令触发的扩展功能（如新增 `BackgroundCommand` 类型）编写 e2e 时，复用「SW 广播下发 + Promise.allSettled + 0 送达抛错」触发模式。
- 任何需要断言「渐进 / 分批渲染」的 e2e（流式输出、并发批处理 UI），复用「先行元素已完成 && 后行元素未完成」的相对时序断言替代绝对时间。
- 新增权限相关的 e2e 排查：先核对 manifest 权限对 `chrome.tabs.*` 返回字段的影响，再设计页签定位策略。

## 审查验证（REVIEW.md）

v0.4.0 全文翻译审查（REVIEW.md，2026-08-03）确认：

- **15 e2e 全绿**（7 划词 + 8 全文翻译），覆盖验收标准 1-11。
- **技术 1（SW 广播触发）**：§4.5 确认 `contextMenus` 权限正确（manifest 含 `contextMenus` + 双 content script），Firefox MV2 兼容（`browser.contextMenus` 原生支持）。
- **技术 2（相对时序断言）**：验收标准 2 确认--`#para-1` 译出时 `#para-4` 仍原文（相对时序断言自校验通过）。
- **shadow DOM 断言**：验收标准 4（双语对照）、8（失败徽标）均通过 `getByRole` + `expect.poll` shadow 穿透断言。

## 来源证据

- `e2e/fullpage.spec.ts`：`triggerFullpageTranslate`（SW 查找 / waitForEvent 兜底 / 广播 / allSettled / 0 送达抛错）、用例 1 相对时序断言（`#para-1` vs `#para-4`）、`waitForReplaceSettled` 批次归纳等待、shadow DOM 断言（getByRole / expect.poll）。
- `docs/iterations/v0.4.0/tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md`：§2.3 相对时序断言决策与被否决方案（绝对时间）、§2.4 触发通道修正经过（Tab.url 剥离 → 广播落地）与风险对策。
- `docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md`：§4.5 兼容性（contextMenus 权限 + Firefox MV2 + Shadow DOM 支持）、验收标准 1-3（渐进渲染时序）、4（双语对照 shadow 断言）、8（失败徽标 shadow 断言）逐条确认。
