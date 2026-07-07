# 技术设计文档

本文档记录当前任务的技术设计方案，经自动批准后作为实现依据。

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #11 |
| 基础分支 | 10（stacked-on-upstream） |
| 设计状态 | approved（无人值守自动批准） |

---

## 一、需求背景

v0.1 划词浮层翻译失败时显示笼统 `❌ ${error}`（error 为底层原始信息如 `HTTP 429: ...`），用户无法据此判断原因和操作。上游 #10 已建立 `TranslateResult.errorType` 四类错误契约，本任务在 content.ts 消费该契约，将单一失败态细化为四类差异化反馈（主文案 + 引导次要行）。

---

## 二、技术选型

| 技术/依赖 | 版本 | 选型原因 |
|-----------|------|----------|
| TypeScript | 5.4 | 项目已有，严格模式 |
| Vitest | ^2.x | 上游 #10 已引入，复用现有测试框架 |
| DOM API | - | content script 原生 DOM 操作，无框架依赖 |

---

## 三、整体设计

### 3.1 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 新增 `errorFeedback` 拆分函数 + 内联 DOM 构建（推荐） | 在 error.ts 新增 `errorFeedback(errorType): {main, guidance}`，content.ts 内联构建主行+引导行 DOM | 职责内聚，最小改动，不破坏 errorTypeMessage 签名 | error.ts 承担 UI 文案职责 |
| B. 修改 `errorTypeMessage` 返回结构化数据 | 将 errorTypeMessage 返回值改为 `{main, guidance}` | 单一函数 | 破坏上游 #10 契约（适配层 index.ts 在使用），需改所有调用方 |
| C. content.ts 自行 switch errorType | 在 content.ts 内联 switch 渲染四类文案 | 无新函数 | 文案散落在 content script 中，不可复用不可测 |

**最终选择：方案 A**。理由：不破坏上游 #10 的 `errorTypeMessage` 签名（适配层 `translateWithAdapter` 仍在使用它设置 `result.error`）；新增 `errorFeedback` 是 errorType → UI 反馈映射的自然延伸；content.ts 改动最小；errorFeedback 可独立单元测试。

### 3.2 数据流

```
background.ts sendResponse(TranslateResult{translatedText, error, errorType})
    │
    ▼
content.ts doTranslate 接收 resp
    │
    ├── 成功（无 error）→ panel.textContent = translatedText
    │
    └── 失败（有 error）
        ├── 有 errorType → errorFeedback(errorType) → {main, guidance}
        │       → 清空 panel → 主行 div(❌ + main) + 引导 div(guidance)
        └── 无 errorType → panel.textContent = `❌ ${error}`（回退）
```

### 3.3 浮层 DOM 结构（错误态）

```
<div class="llm-translator-panel">           ← 沿用现有 class
  <div class="llm-translator-error-main">    ← 新增：主行
    ❌ 未配置可用翻译源
  </div>
  <div class="llm-translator-error-hint">    ← 新增：引导次要行
    请在配置页选择或添加源
  </div>
</div>
```

---

## 四、数据结构设计

### 4.1 新增 errorFeedback 函数（shared/translator/error.ts）

```typescript
/** 错误反馈结构：主文案 + 引导次要行 */
interface ErrorFeedback {
  main: string;      // 主文案（不含 ❌ 前缀，由调用方添加）
  guidance: string;  // 引导次要行
}

/**
 * 根据 errorType 返回拆分的主文案与引导文案，供前端浮层差异化渲染
 */
export function errorFeedback(errorType: ErrorType): ErrorFeedback;
```

四类映射：

| errorType | main | guidance |
|---|---|---|
| `no-config` | 未配置可用翻译源 | 请在配置页选择或添加源 |
| `network` | 翻译请求失败 | 请检查网络或源地址 |
| `rate-limit` | 翻译源繁忙（限流） | 请稍后再试或在配置页切换源 |
| `unreachable` | 翻译源不可达 | 请在配置页切换到其它源 |

### 4.2 errorTypeMessage 重构（可选，保持向后兼容）

`errorTypeMessage` 可改为内部调用 `errorFeedback` 并拼接 `main + '，' + guidance`，保持返回值不变。这样主文案与引导文案单一数据源，避免维护两份文案。

---

## 五、接口设计

本任务无新增对外接口。`errorFeedback` 为 internal 函数，仅 content.ts 消费。

---

## 六、主要变更点

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `shared/translator/error.ts` | 修改 | 新增 `errorFeedback(errorType): {main, guidance}` 函数；`errorTypeMessage` 改为内部委托 `errorFeedback` 拼接 |
| `entrypoints/content.ts` | 修改 | doTranslate 结果类型改为 `TranslateResult`；错误分支按 errorType 调用 `errorFeedback` 构建主行+引导行 DOM；无 errorType 时回退旧逻辑 |
| `assets/content.css` | 修改 | 新增 `.llm-translator-error-main` 和 `.llm-translator-error-hint` 样式 |
| `shared/translator/__tests__/error.test.ts` | 修改 | 新增 `errorFeedback` 四类 errorType 测试 |

---

## 七、兼容性考虑

1. **errorTypeMessage 签名不变**：返回值类型和内容不变，适配层 `translateWithAdapter` 继续正常使用
2. **TranslateResult 向后兼容**：errorType 为可选字段，旧代码不读取不受影响
3. **无 errorType 回退**：content.ts 在 errorType 缺失时回退到 `❌ ${error}`，与 v0.1 行为一致
4. **浮层 CSS 不破坏现有样式**：新增 class 不影响成功态/加载态的 panel 渲染
5. **e2e 回归**：v0.1 划词成功/加载/触发流程行为不变

---

## 八、风险评估

| 风险 | 影响程度 | 概率 | 应对措施 |
|------|----------|------|----------|
| errorTypeMessage 重构后返回值变化 | 中 | 低 | 重构后运行现有 errorTypeMessage 测试，确保返回值一致 |
| CSS 引导行对比度不满足 WCAG AA | 中 | 低 | 使用 #D1D5DB（对比度约 10:1，远超 AA 4.5:1），代码审查验证 |
| content.ts DOM 构建引入 XSS | 低 | 低 | 使用 textContent 而非 innerHTML，文案为静态字符串 |
| e2e 回归失败 | 高 | 低 | 成功态/加载态渲染逻辑不变，仅新增错误分支 |
