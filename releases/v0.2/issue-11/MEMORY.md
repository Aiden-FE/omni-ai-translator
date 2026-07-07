# 任务记忆文档

本文档用于存储当前开发任务的**关键信息**，包括 API 接口、业务规则、技术决策、踩坑记录等。

## 任务基础信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #11 |
| 基础分支 | 10（stacked-on-upstream，基于上游 #10 的任务分支） |
| 任务分支 | 11 |
| 标题 | 【AI】【前端】content 划词浮层 - 四类错误差异化反馈 |
| worktree | /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/10-11 |

---

## 目录

- [任务记忆文档](#任务记忆文档)
  - [任务基础信息](#任务基础信息)
  - [PRD 摘要](#prd-摘要)
  - [上游契约](#上游契约)
  - [代码现状](#代码现状)
  - [业务规则与约束](#业务规则与约束)
  - [依赖关系](#依赖关系)
  - [自动决策记录](#自动决策记录)

---

## PRD 摘要

本任务对应 v0.2 迭代功能事项 1（unified-adapter）的前端部分，PRD 文档路径：`releases/v0.2/1-unified-adapter/PRD.md`，关联 PRD Issue #1。

**核心目标**：改造 `entrypoints/content.ts` 的 `doTranslate`，将笼统 `❌ ${error}` 细化为按 `TranslateResult.errorType` 分支的差异化文案 + 引导次要行。

**四类错误浮层反馈**：

| errorType | 主文案（❌ 前缀） | 引导次要行 |
|---|---|---|
| `no-config` | ❌ 未配置可用翻译源 | 请在配置页选择或添加源 |
| `network` | ❌ 翻译请求失败 | 请检查网络或源地址 |
| `rate-limit` | ❌ 翻译源繁忙（限流） | 请稍后再试或在配置页切换源 |
| `unreachable` | ❌ 翻译源不可达 | 请在配置页切换到其它源 |

**交付内容**：
- content.ts 按错误类型分支渲染文案 + 引导次要行
- 浮层失败态从单一「❌ <error>」扩展为四类子状态反馈
- 单元测试覆盖四类 errorType 渲染路径

**不包含**：错误归一化逻辑本身（后端 #10 产出）、浮层视觉/宽度改动、配置页。

---

## 上游契约

上游 #10 产出的 `TranslateResult.errorType` 四类错误契约（详见 `releases/v0.2/10/DESIGN.md` 与 `CHANGELOG.md`）：

```typescript
interface TranslateResult {
  translatedText: string;
  error?: string;
  errorType?: 'no-config' | 'network' | 'rate-limit' | 'unreachable';
}
```

四类错误互斥可判别：
- `no-config`：未配置任何源或当前源未启用
- `network`：fetch 抛异常、超时
- `rate-limit`：源返回 429
- `unreachable`：源返回 4xx/5xx（非 429）、域名不可达

数据流：content.ts → sendMessage → background.ts → `translateWithAdapter(req)` → TranslateResult（含 errorType）→ sendResponse 透传 → content.ts 接收。

background.ts 第 17 行 `sendResponse(await translateWithAdapter(message.payload))` 直接透传完整 TranslateResult，errorType 已包含。

---

## 代码现状

### entrypoints/content.ts — doTranslate（待改造）

当前第 64-67 行：
```typescript
const result: { translatedText?: string; error?: string } = resp as any;
if (panel) {
  panel.textContent = result.error ? `❌ ${result.error}` : result.translatedText ?? '';
}
```
- 结果类型仅声明 `{ translatedText?: string; error?: string }`，**未包含 errorType**
- 错误渲染为单行 `❌ ${result.error}`，无差异化、无引导次要行

### showPanel 函数（第 45-52 行）

```typescript
function showPanel(content: string, x: number, y: number) {
  panel = document.createElement('div');
  panel.className = 'llm-translator-panel';
  panel.textContent = content;
  // ...
}
```
- 仅接受单个字符串，设置 `textContent`
- 加载态调用 `showPanel('翻译中…', x, y)`，结果态直接修改 `panel.textContent`
- 需扩展以支持错误态的结构化内容（主行 + 引导次要行）

### shared/translator/error.ts — errorTypeMessage（第 23-35 行）

```typescript
export function errorTypeMessage(errorType: ErrorType): string {
  switch (errorType) {
    case 'no-config': return '未配置可用翻译源，请在配置页选择或添加源';
    case 'network': return '翻译请求失败，请检查网络或源地址';
    case 'rate-limit': return '翻译源繁忙（限流），请稍后再试或在配置页切换源';
    case 'unreachable': return '翻译源不可达，请在配置页切换到其它源';
    default: return '翻译失败';
  }
}
```
- 主文案与引导合并为一个字符串（用逗号连接）
- #11 需要拆分为主行 + 引导次要行，不能直接复用此函数

### assets/content.css — 浮层样式

```css
.llm-translator-panel {
  max-width: 360px;
  padding: 10px 12px;
  background: #1f2937;
  color: #f9fafb;
  font-size: 14px;
  line-height: 1.5;
  /* ... */
}
```
- 需新增引导次要行样式（较小字号、满足 WCAG AA 对比度）

### Vitest 配置

- `include: ['shared/**/*.test.ts']` — 测试文件必须放在 `shared/` 目录下
- `environment` 未设置（默认 node）— 无 jsdom，DOM 操作不可直接测试
- 现有测试在 `shared/translator/__tests__/` 下

---

## 业务规则与约束

1. **错误反馈不依赖颜色区分类型**：沿用「❌」文字前缀 + 可读文案（符合可访问性）
2. **引导文案为浮层次要信息**：字号/颜色对比度满足 WCAG AA；引导为纯文本，不可点击跳转配置页
3. **浮层最大宽度 360px 不变**：引导文案较长时自动换行
4. **四类错误互斥可判别**：按 errorType 分支渲染
5. **向后兼容**：若 result.error 存在但 errorType 缺失（理论上不应发生），回退到旧 `❌ ${error}` 行为
6. **v0.1 行为不退化**：划词成功/加载/触发流程行为不变（e2e 回归）
7. **TypeScript 严格模式**：禁止 any（用 unknown + 类型守卫），content.ts 的 `resp as any` 应改为 `TranslateResult` 类型

---

## 依赖关系

| 项 | 内容 |
|----|------|
| 并发安全等级 | blocked-by-upstream |
| MR 基线策略 | stacked-on-upstream（基于 #10 分支 `10` 开发，#10 合并后 rebase 到 master） |
| 上游依赖 | #10 — 统一翻译源适配层 / 错误类型契约 |
| 上游 Issue/MR | #10 → PR #12（https://github.com/Aiden-FE/llm-translator/pull/12 ，状态 OPEN、mergeable） |
| 推荐合并顺序 | 先合并 #10 的 PR #12 到 master，再 rebase 本任务分支到 master 后合并本任务 MR |
| 当前允许的 base 分支 | `10`（stacked 期间）；最终合并前 rebase 到 master |
| 依赖契约 | `TranslateResult.errorType` 四类错误契约，详见 `releases/v0.2/10/CHANGELOG.md` 与 `DESIGN.md` |
| 是否采用 stacked MR | 是 |

---

## 自动决策记录

### 1. errorType → 主行+引导 拆分函数位置：复用 `shared/translator/error.ts`

- **决策点**：PRD 要求主文案与引导次要行分离，现有 `errorTypeMessage` 合并了两者。新增拆分函数放在哪里？
- **采用值**：在 `shared/translator/error.ts` 新增 `errorFeedback(errorType): { main: string; guidance: string }` 函数，返回拆分后的主文案与引导文案
- **依据**：与 errorType 密切相关，放在 error.ts 职责内聚；不修改 `errorTypeMessage` 签名（上游 #10 契约稳定，适配层仍在使用）
- **风险**：error.ts 承担了 UI 文案职责，但该模块已负责「可读提示」，扩展为「结构化反馈」是自然延伸
- **回滚方式**：删除 `errorFeedback` 函数及相关测试

### 2. 浮层错误态渲染方式：内联构建 DOM

- **决策点**：`showPanel` 当前仅接受单字符串，错误态需主行+引导两行。如何渲染？
- **采用值**：在 `doTranslate` 的错误分支内联构建 DOM — 清空 panel、创建主行 div（设置 ❌ + 主文案）和引导 div（设置引导文案），添加对应 CSS class
- **依据**：最小改动，不改变 `showPanel` 签名（加载态和成功态行为不变）；错误态是新增分支，不影响现有路径
- **风险**：DOM 构建逻辑内联在 doTranslate 中，但逻辑简单（创建 2 个 div + 设置 textContent + className）
- **回滚方式**：恢复 `panel.textContent = result.error ? ❌ ${result.error} : result.translatedText`

### 3. 单元测试策略：测试 errorFeedback 数据层

- **决策点**：Issue 要求「单元测试覆盖四类 errorType 渲染路径」，但 vitest 默认 node 环境无 jsdom，无法测试 DOM 操作
- **采用值**：测试 `errorFeedback` 函数返回的 `{ main, guidance }` 数据，覆盖四类 errorType。渲染路径 = errorType → errorFeedback → {main, guidance} → DOM，数据层是渲染决策的核心
- **依据**：DOM 构建逻辑简单（textContent + className），数据层测试覆盖了四类分支的文案正确性与互斥可判别性
- **风险**：未测试实际 DOM 结构，但 DOM 构建为确定性操作，e2e 回归覆盖端到端
- **回滚方式**：删除测试文件

### 4. content.ts 结果类型：改用 TranslateResult

- **决策点**：content.ts 当前用 `resp as any` 且类型声明不含 errorType
- **采用值**：改为 `const result = resp as TranslateResult`，直接消费 errorType 字段
- **依据**：background.ts 已透传完整 TranslateResult，类型应与之对齐；消除 any 符合编码规范
- **风险**：无，TranslateResult 是已有类型
- **回滚方式**：恢复 `resp as any` 与旧类型声明

---

## 开发结果

- 单元测试：54 tests passed（4 test files，新增 14 个 errorFeedback 测试）
- typecheck：通过（vue-tsc --noEmit）
- e2e 回归：2 tests passed（v0.1 划词翻译链路全绿，首次运行第二个测试 flaky 失败，重跑通过）

### 踩坑记录

#### e2e 第二个测试 flaky（非本任务引入）

e2e 第二个测试「配置的默认目标语言生效」在首次运行时偶尔失败：fill('简体中文') 后 change 事件未及时触发保存，导致 prompt 使用了 navigator.language 回退值 "English" 而非 "简体中文"。此为持久化上下文测试隔离/时序问题，clean base 上也偶发。重跑通过。本任务改动仅影响错误渲染路径，不涉及目标语言配置逻辑。

#### errorTypeMessage 重构保持向后兼容

重构 `errorTypeMessage` 内部委托 `errorFeedback` 时，default 分支返回 `{ main: '翻译失败', guidance: '' }`。`errorTypeMessage` 拼接时检查 guidance 是否非空：`guidance ? ${main}，${guidance} : main`，确保 default 返回值仍为 `'翻译失败'`（无逗号），与重构前一致。现有 16 个 errorTypeMessage 测试全部通过。
