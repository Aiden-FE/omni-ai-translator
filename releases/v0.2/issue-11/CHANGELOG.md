# 变更日志

记录当前任务完成后的实际代码变更。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #11 |
| 基础分支 | 10（stacked-on-upstream，基于上游 #10） |
| 完成日期 | 2026-07-02 |
| Merge Request | 待创建 |

---

## 主要变更

### 新增功能

- 浮层失败态从单一「❌ <error>」扩展为四类 errorType 差异化反馈：配置缺失 / 网络 / 限流 / 源不可达，每类含可读主文案（❌ 前缀）+ 引导次要行
- 新增 `errorFeedback(errorType)` 函数（`shared/translator/error.ts`），返回拆分的 `{ main, guidance }` 结构，供前端浮层差异化渲染
- 新增浮层错误态 CSS 样式（`.llm-translator-error-main` / `.llm-translator-error-hint`），引导行字号 12px、颜色 #D1D5DB，对比度 9.96:1 满足 WCAG AA

### 代码重构

- 改造 `entrypoints/content.ts` 的 `doTranslate`：结果类型从 `{ translatedText?: string; error?: string } as any` 升级为 `TranslateResult`，消除 any；错误分支按 errorType 调用 `errorFeedback` 构建主行+引导行 DOM
- 重构 `errorTypeMessage`（`shared/translator/error.ts`）：内部委托 `errorFeedback` 拼接主文案+引导，保持返回值向后兼容

### 接口变更

- 无新增对外接口。`errorFeedback` 为 internal 函数，仅 content.ts 消费
- `errorTypeMessage` 签名与返回值不变，向后兼容

---

## 部署说明

无特殊操作。本次变更为前端浮层渲染逻辑改造，无需数据库迁移或配置变更。

---

## 升级注意事项

- content.ts 结果类型升级为 `TranslateResult`，消费 `errorType` 字段。若 errorType 缺失（如 background 外层 catch 返回的 `{ error }` 无 errorType），回退到旧 `❌ ${error}` 单行渲染，与 v0.1 行为一致
- `errorTypeMessage` 重构后返回值不变，适配层 `translateWithAdapter` 继续正常使用
- 回滚方案：恢复 `content.ts` 的 `doTranslate` 为旧逻辑（`panel.textContent = result.error ? ❌ ${result.error} : result.translatedText`），删除 `errorFeedback` 函数与 CSS 样式

---

## 依赖契约（本任务消费）

本任务消费上游 #10 产出的 `TranslateResult.errorType` 四类错误契约：

| errorType | 浮层主文案（❌ 前缀） | 引导次要行 |
|---|---|---|
| `no-config` | ❌ 未配置可用翻译源 | 请在配置页选择或添加源 |
| `network` | ❌ 翻译请求失败 | 请检查网络或源地址 |
| `rate-limit` | ❌ 翻译源繁忙（限流） | 请稍后再试或在配置页切换源 |
| `unreachable` | ❌ 翻译源不可达 | 请在配置页切换到其它源 |

---

## 测试结果

- 单元测试：54 passed（含 14 个新增 errorFeedback 测试，覆盖四类 errorType 的 main/guidance 正确性与互斥可判别性）
- typecheck：通过（vue-tsc --noEmit）
- e2e 回归：2 passed（v0.1 划词翻译链路全绿，成功/加载/触发流程不退化）
