# DESIGN — 编写全文翻译 e2e 用例并扩展 mock server

> 任务：为 v0.4.0 全文翻译链路补齐 Playwright e2e 覆盖（验收标准 1-11 核心链路 + 12 工程门禁）。
> 上游契约：`shared/fullpage/orchestrator.ts`（状态机）、`shared/fullpage/renderer.ts`（DOM 结构）、`shared/fullpage/toolbar.ts`（按钮 aria-label）、`entrypoints/background.ts`（`BackgroundCommand` 通道）。本任务不改生产代码，只新增/修改 e2e 资产。

## 1. 总体架构与模块职责

```
e2e/fixtures/fullpage-test-page.html   新增  测试页(nav+列表链接 / 4 正文段含 __FAIL__ / footer / #add-paragraph)
e2e/mock-server.ts                     修改  +按路由请求计数 getRequestCount/resetRequestCount
                                             +失败开关 setFailMode(仅 __FAIL__ 请求 500)
                                             +非流式成功响应 300ms 延迟 NONSTREAM_DELAY_MS
e2e/fullpage.spec.ts                   新增  7 个用例覆盖全文翻译核心链路
e2e/tsconfig.json                      修改  types 增加 "chrome"(sw.evaluate 内 chrome.tabs API 类型)
```

复用既有基建：`e2e/fixtures.ts`（context/extensionId fixture）、`translate.spec.ts` 的「options 页配置 mock 提供方并启用」模式与 beforeAll/afterAll mock server 生命周期。

## 2. 关键设计决策

### 2.1 失败开关语义：按请求内容匹配 `__FAIL__`（而非全局 500）

任务描述的字面是「开启后 OpenAI 兼容路由返回 500」，但 fixture 要求「一段文本含 `__FAIL__` 标记，供失败重试用」。
若 failMode 为全局 500，则所有段同时失败，`__FAIL__` 文本标记没有技术意义（任意段落都可作断言锚点），
且无法验证「部分失败隔离」这一核心价值。

**决策**：`setFailMode(true)` 后，OpenAI 兼容路由**仅对请求体含 `__FAIL__` 的请求返回 500**，其余正常。
效果：失败重试用例中只有 `__FAIL__` 段失败（保留原文 + 失败徽标 + 重试按钮计数 1），其余段正常译出——
精确匹配任务用例描述「`__FAIL__` 段保留原文且出现失败标记」（单数），并额外覆盖失败隔离。

被否决方案：全局 500——语义粗糙、fixture 标记失去意义、无法断言失败隔离。

### 2.2 非流式延迟只加在成功响应，500 快速失败

`NONSTREAM_DELAY_MS = 300` 的目的是「使先译完的段落先渲染可被断言」（渐进渲染相对时序断言），
只作用于非流式**成功**响应（OpenAI/Anthropic/Ollama/microsoft 四路由统一）。
500 失败响应立即返回：失败路径与渐进渲染无关，快速失败让失败用例更快、失败徽标更早出现。

被否决方案：500 也延迟 300ms——无断言收益，徒增用例耗时。

### 2.3 渐进渲染断言用「相对时序」而非绝对时间

并发池 concurrency=3、每段 300ms：测试页 9 段（3 nav 链接 + 4 正文段 + footer + 按钮）分 3 批，
`#para-1` 在第 2 批（≈600ms 译出），`#para-4` 在第 3 批（≈900ms 译出），批次间隔 300ms 远超断言执行耗时。

断言序列：`expect(#para-1).toHaveText('你好,世界', {timeout:15s})`（等待至译出即返回）
→ 紧接着 `expect(#para-4).toHaveText(原文)`（此刻尚未译完，立即通过）。
若时序被意外打破（如并发模型变更），第二条会 polling 超时失败——断言自校验，非静默通过。

被否决方案：`page.waitForTimeout` + 绝对时间断言——CI 抖动高危（任务风险点已明示）。

### 2.4 触发通道：service worker 直发 BackgroundCommand，广播下发（已按实现修正）

Playwright 无法操作原生右键菜单，经 SW 直发 t1 约定的 `BackgroundCommand`
（与真实右键链路在 content script 侧汇合，content 侧行为与线上一致）。

**实现修正（e2e 首跑红灯后定位）**：原方案按 `tabs.find(t => t.url === page.url())` 精确匹配，
但 manifest 无 `tabs` 权限且 host_permissions 不含 `file://`，`chrome.tabs.query({})` 返回的
`Tab.url/title` 被 Chrome 剥离（undefined）——按 URL 匹配不可行且不值得为 e2e 放宽生产权限。

落地实现：**向全部页签广播**，仅注入 fullpage content script 的页签（file:// 测试页）注册了
onMessage 接收端，`sendMessage` 成功；其余页签（初始空白页等）无接收端 reject，`Promise.allSettled`
吞掉；0 送达时抛错快失败（防静默挂起）。每用例独立持久化 context 且仅一个测试页 tab，广播
确定送达唯一目标：

```ts
sw.evaluate(async (mode) => {
  const tabs = await chrome.tabs.query({});
  const results = await Promise.allSettled(tabs.map((t) =>
    chrome.tabs.sendMessage(t.id, { type: 'fullpage-translate', mode })));
  if (results.every((r) => r.status === 'rejected')) throw new Error('no receiver');
}, mode);
```

风险与对策：
- 广播副作用：非测试页 tab 无 content script 接收端，reject 被吞，无影响；
- 跨用例残留：fixture 每用例新建持久化 context 并关闭，tab 不跨用例残留；
- SW 可能被回收 → 触发前 `context.waitForEvent('serviceworker')` 兜底唤醒(同 fixtures.ts 模式)。

### 2.5 跨文件共享 mock 模块状态

workers=1 且单 worker 进程内 Node 模块缓存共享：`fullpage.spec.ts` 与 `translate.spec.ts`
的 mock-server 模块级状态（计数/失败开关）互通。对策：
- `beforeEach` `resetRequestCount()` —— 计数断言与执行顺序/其它文件解耦；
- `afterEach` `setFailMode(false)` —— 失败开关用后复位（任务关键约定），防泄漏到后续用例。

### 2.6 shadow DOM 断言策略

- 工具栏按钮：Playwright role 引擎穿透 open shadow root → `getByRole('button', { name })` 直接定位点击
  （aria-label 提供可访问名：切换为双语对照/恢复原文/重试失败段落（n 个）/收起工具栏/展开工具栏）。
- 译文块/失败徽标内容：宿主在 light DOM(`.llm-translator-block-host` / `.llm-translator-failed-host` 可定位、
  可用 `#para-1 + .llm-translator-block-host` 相邻兄弟选择器断言位置），shadow 内文本用
  `expect.poll` + `evaluate(el => el.shadowRoot?.textContent)` 读取。

### 2.7 「全部请求落盘」等待点

计数断言（切换模式/缓存复用）前必须确保所有段已 settle。批次归纳：`#para-4`、footer、`#add-paragraph`
按钮同在第 3 批；三者文本均变为译文 ⇒ 第 3 批全部 settle ⇒ 此前批次更早完成 ⇒ 请求计数稳定。
封装 `waitForSettled()` 统一等待，避免逐用例手写易错。

## 3. 数据契约

### 3.1 mock-server.ts 新增导出

| 导出 | 签名 | 语义 |
|---|---|---|
| `NONSTREAM_DELAY_MS` | `const = 300` | 非流式成功响应延迟(ms) |
| `getRequestCount` | `(route?: string) => number` | 按路由(pathname)累计；无参返回总数 |
| `resetRequestCount` | `() => void` | 清空计数 |
| `setFailMode` | `(on: boolean) => void` | 开启后 OpenAI 路由对含 `__FAIL__` 请求返回 500(立即,无延迟) |

计数 key：`req.url` 去 query 的 pathname；在请求体解析后、路由分发前统一累计（含失败请求——缓存复用断言语义是「未发起新请求」）。

既有导出（`startMockServer` / `getLastRequestBody` / `getLastRequestHeaders`）与路由行为不变：流式分支不动，
非流式仅在响应前 `await sleep(NONSTREAM_DELAY_MS)`——现有 `translate.spec.ts` 超时(15s)完全容纳 300ms，零回归。

### 3.2 fixture 页面结构（段清单）

```html
nav > ul > li×3 > a[href]        → 3 个行内段(链接文本)
main > p#para-1 / #para-2 / #para-fail(含 __FAIL__) / #para-4  → 4 个块级段
footer                            → 1 个块级段
button#add-paragraph              → 1 个行内段(替换模式下按钮文本被译,点击定位用 id)
script: 点击 #add-paragraph 向 body 追加 <p id="added-para-N">  → 增量翻译段
```

合计 9 段（实现后先用 jsdom + collectSegments 一次性实测核对，再固化进缓存复用用例的精确计数断言）。
`__FAIL__` 出现在段落纯文本中，经 prompt 原样进入请求体（下划线无需 JSON 转义），mock 按子串匹配。

### 3.3 fullpage.spec.ts 用例 → 验收标准映射

| # | 用例 | 核心断言 | 验收标准 |
|---|---|---|---|
| 1 | 替换模式触发→渐进渲染 | #para-1 译出时 #para-4 仍原文；最终 4 段均「你好,世界」 | 1/2/3 渐进渲染 |
| 2 | 双语对照 | 原文不变；`#para-1 + .llm-translator-block-host` shadow 含译文 | 4 双语模式 |
| 3 | 切换模式 | replace→bilingual DOM 翻转且 getRequestCount() 不变 | 6/10 免重译 |
| 4 | 恢复原文 | `[data-llm-translator]` 计数 0、原文逐字还原(textContent ===)、工具栏消失 | 7 恢复 |
| 5 | 失败重试 | failMode 下 __FAIL__ 段保留原文+失败徽标+重试按钮；复位后重试译出、徽标消失、按钮隐藏 | 8 失败处理 |
| 6 | 增量翻译 | 点 #add-paragraph → #added-para-1 自动译出 | 9 增量 |
| 7 | 缓存复用 | 恢复后再触发,段落秒级译出且 getRequestCount() 不变 | 10 缓存 |
| 8 | 收起/唤出 | 收起→工具栏隐藏+迷你把手可见;点把手→恢复 | 11 工具栏 UX |

用例 8 个（切换模式双向归并到用例 3 的单向翻转 + 工程门禁为第 12 条：pnpm e2e/typecheck/lint 全绿）。
每个用例独立：配置提供方(新卡片并启用)→ 新开测试页 → SW 触发 → 断言；超时 10-15s 抗 CI 抖动。

## 4. 边界与风险

- **file:// 注入**：现有 translate.spec.ts 已验证可行；fullpage.content.ts 同为 `<all_urls>`，一并注入。
- **按钮文本被翻译**：替换模式下 `#add-paragraph` 文本变为译文，点击定位一律用 id 选择器。
- **options 页残留**：配置 helper 关闭 options 页；SW 触发按 url 精确匹配双保险。
- **旧测试页残留**：afterEach 关闭全部测试页，避免 SW 触发匹配到上一用例的旧 tab。
- **SW 回收**：触发前 waitForEvent('serviceworker') 兜底。
- **时序 flaky**：只用相对时序断言（2.3），超时 10-15s；计数断言前 waitForSettled（2.7）。
- **API Key 安全**：e2e 不配置真实 Key；mock 不记录/输出任何凭证（沿用既有约束）。

## 5. 验证方式（TDD 边界）

1. mock 扩展后先跑 `translate.spec.ts` 单文件 → 零回归（既有 7 用例全绿）。
2. jsdom + collectSegments 实测 fixture 段数（一次性 vitest 文件，用后删除）→ 固化计数断言。
3. `pnpm e2e` 全量绿 + `pnpm typecheck` + `pnpm lint`（验收标准 12）；`pnpm test` 单元测试零回归。
