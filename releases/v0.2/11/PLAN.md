# 任务执行计划

本文档记录当前任务的实现拆分和执行进度，**执行过程中计划变更时必须同步更新**。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #11 |
| 基础分支 | 10（stacked-on-upstream） |

---

## 执行任务列表

- 实现阶段
  - [x] T1: 在 `shared/translator/error.ts` 新增 `errorFeedback(errorType)` 函数，返回 `{main, guidance}` 拆分结构；重构 `errorTypeMessage` 内部委托 `errorFeedback`
  - [x] T2: 在 `assets/content.css` 新增 `.llm-translator-error-main` 和 `.llm-translator-error-hint` 样式（引导行字号 12px、颜色 #D1D5DB，满足 WCAG AA）
  - [x] T3: 改造 `entrypoints/content.ts` 的 `doTranslate`：结果类型改为 `TranslateResult`，错误分支按 errorType 调用 `errorFeedback` 构建主行+引导行 DOM，无 errorType 时回退旧逻辑
  - [x] T4: 在 `shared/translator/__tests__/error.test.ts` 新增 `errorFeedback` 四类 errorType 单元测试
- 测试验证
  - [x] T5: 运行全部单元测试（`pnpm test`），确认全部通过（54 passed）
  - [x] T6: 运行 typecheck（`pnpm typecheck`），确认无类型错误
  - [x] T7: 运行 e2e 回归（`pnpm e2e`），确认 v0.1 划词链路不退化（2 passed）

> 代码提交（T8-T10）由 Step6 提交与收尾流程执行，不属于实现计划 checkbox 范围：
> - T8: 提交代码与迭代文档（commit 消息符合 prodflow-ai-commit 规范，含 [AICODING]）
> - T9: 推送并创建 stacked MR（base=10，描述含审查上下文 + stacked 声明）
> - T10: 关闭 Issue #11

---

## 任务分解（详细）

### T1: 新增 errorFeedback 函数

**描述：** 在 `shared/translator/error.ts` 新增 `errorFeedback(errorType: ErrorType): { main: string; guidance: string }`，返回四类错误拆分后的主文案与引导文案。重构 `errorTypeMessage` 内部委托 `errorFeedback` 并拼接，保持返回值不变。

**依赖：** 无

**验收标准：**
- errorFeedback 导出，四类 errorType 各返回正确的 {main, guidance}
- errorTypeMessage 返回值与重构前一致（现有测试通过）

---

### T2: 新增浮层错误态 CSS 样式

**描述：** 在 `assets/content.css` 新增 `.llm-translator-error-main`（主行，14px，#f9fafb）和 `.llm-translator-error-hint`（引导次要行，12px，#D1D5DB，margin-top 4px）样式。

**依赖：** 无

**验收标准：**
- 引导行颜色 #D1D5DB 在 #1f2937 背景上对比度 ≥ 4.5:1（WCAG AA）
- 不影响现有 panel/trigger 样式

---

### T3: 改造 content.ts doTranslate

**描述：** 改造 `entrypoints/content.ts`：
1. 结果类型从 `{ translatedText?: string; error?: string } as any` 改为 `TranslateResult`
2. 错误分支：若 `result.errorType` 存在，调用 `errorFeedback(result.errorType)` 获取 {main, guidance}，清空 panel 后构建主行 div（`❌ ${main}`，class=error-main）+ 引导 div（guidance，class=error-hint）
3. 若 `result.error` 存在但 `errorType` 缺失，回退到 `panel.textContent = ❌ ${result.error}`
4. 成功态不变：`panel.textContent = result.translatedText`

**依赖：** T1, T2

**验收标准：**
- 四类 errorType 各显示对应主文案 + 引导次要行
- 无 errorType 时回退旧逻辑
- 成功态/加载态行为不变

---

### T4: 新增 errorFeedback 单元测试

**描述：** 在 `shared/translator/__tests__/error.test.ts` 新增 `describe('errorFeedback')` 块，覆盖四类 errorType 的 {main, guidance} 正确性、互斥可判别性。

**依赖：** T1

**验收标准：**
- 四类 errorType 各有测试
- main 和 guidance 均非空
- 四类 main 互不相同、四类 guidance 互不相同

---

### T5-T7: 测试验证

**描述：** 运行单元测试、typecheck、e2e 回归。

**验收标准：**
- `pnpm test` 全绿
- `pnpm typecheck` 无错误
- `pnpm e2e` 全绿（v0.1 划词链路不退化）

---

## 进度跟踪

| 状态 | 任务数 |
|------|--------|
| 未开始 | 0 |
| 进行中 | 0 |
| 已完成 | 7 |
| **总计** | **7** |

**完成进度：** 100%

---

## 变更记录

| 变更日期 | 变更内容 | 变更原因 |
|----------|----------|----------|
| 2026-07-02 | 初始计划创建 | 任务启动 |
