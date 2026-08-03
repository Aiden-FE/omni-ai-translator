# PLAN — 编写全文翻译 e2e 用例并扩展 mock server

> 依据 DESIGN.md 拆分。每步保持绿色边界：类型检查/既有测试不被中间态破坏。

## 任务拆分（按序执行）

### s1 测试页 fixture ✅
- 文件：`e2e/fixtures/fullpage-test-page.html`（新增）
- 产出：nav(3 链接列表) + main(4 段，#para-fail 含 `__FAIL__`) + footer + button#add-paragraph(点击追加 `<p id="added-para-N">`)
- 验证：jsdom + collectSegments 一次性实测段数（临时 vitest 文件，用后删除）→ 实测 9 段 ✔

### s2 mock server 扩展 ✅
- 文件：`e2e/mock-server.ts`（修改）
- 产出接口：`NONSTREAM_DELAY_MS=300`、`getRequestCount(route?)`、`resetRequestCount()`、`setFailMode(on)`
- 消费：s4 的 spec
- 验证：`pnpm e2e e2e/translate.spec.ts` → 7 passed，零回归 ✔

### s3 e2e tsconfig 补 chrome 类型 ✅
- 文件：`e2e/tsconfig.json`（types + "chrome"）
- 验证：编辑器/IDE 类型正确；playwright 运行期不类型检查，不影响执行 ✔

### s4 全文翻译 spec ✅
- 文件：`e2e/fullpage.spec.ts`（新增）
- 消费：s1 fixture、s2 mock 接口、`e2e/fixtures.ts`、`shared/fullpage/*` 的 DOM 契约（DESIGN §3.3 映射表）
- 8 用例：渐进渲染 / 双语对照 / 切换模式免重译 / 恢复原文 / 失败重试 / 增量翻译 / 缓存复用 / 收起唤出
- 验证：`playwright test e2e/fullpage.spec.ts` → 8 passed ✔
- 实现修正：页签定位由 URL 精确匹配改为广播下发（Tab.url 无权限被剥离，详见 DESIGN §2.4）

### s5 工程门禁 + 文档收尾 ✅
- `pnpm e2e`（全量 15 passed）+ `pnpm typecheck` + `pnpm lint` + `pnpm test`（309 passed）全绿 ✔
- 编写 CHANGELOG.md，更新 index.md / PLAN.md 勾选状态 ✔

## 依赖与顺序说明

- s1 ↔ s2 无相互依赖，可任意序；s4 依赖 s1+s2+s3。
- s2 先落地并跑 translate.spec.ts 零回归，构成第一个绿色边界，再写 s4。
- 段数实测（s1 验证）在完成 s1 后立即做，结果回填 s4 缓存复用用例的精确计数。
