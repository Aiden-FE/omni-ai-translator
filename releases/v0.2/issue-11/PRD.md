# 需求文档

---

## 基础信息【必填】

| 项目 | 内容 |
|------|------|
| **ISSUE ID** | #11 |
| **标题** | 【AI】【前端】content 划词浮层 - 四类错误差异化反馈 |
| **版本号** | v0.2 |

---

## 需求内容【必填】

### 需求背景

LLM Translator v0.1 的划词浮层在翻译失败时仅显示笼统的 `❌ ${error}`，error 为底层原始信息（如 `HTTP 429: ...`），用户无法据此判断失败原因和应采取的操作。

v0.2 上游 #10 已建立统一错误模型，`TranslateResult` 新增 `errorType?: 'no-config'|'network'|'rate-limit'|'unreachable'` 四类互斥错误标识。本任务消费该契约，将 content 浮层的单一失败态细化为四类差异化反馈，每类含可读主文案 + 可操作性引导次要行，使用户能据此采取行动（配置源 / 检查网络 / 稍后重试 / 切换源）。

### 需求目标

改造 `entrypoints/content.ts` 的 `doTranslate`，将笼统 `❌ ${error}` 细化为按 `TranslateResult.errorType` 分支的差异化文案 + 引导次要行，使四类错误在浮层均显示对应可读文案与引导，且互斥可判别。

### 需求范围

- **涉及文件**：`entrypoints/content.ts`、`shared/translator/error.ts`、`assets/content.css`、`shared/translator/__tests__/error.test.ts`
- **涉及模块**：content script 浮层渲染层
- **不包含**：错误归一化逻辑本身（后端 #10 产出）、浮层视觉/宽度等沿用项改动、配置页（功能事项 4）

### 业务规则

1. **四类错误差异化反馈**：按 `errorType` 分支渲染，每类有独立的主文案和引导文案
2. **错误反馈不依赖颜色区分类型**：沿用「❌」文字前缀 + 可读文案（符合可访问性）
3. **引导文案为浮层次要信息**：字号/颜色对比度满足 WCAG AA；引导为纯文本，不可点击跳转配置页
4. **四类错误互斥可判别**：按 errorType 分支，不可混叠
5. **向后兼容**：若 result.error 存在但 errorType 缺失，回退到旧 `❌ ${error}` 行为
6. **v0.1 行为不退化**：划词成功/加载/触发流程行为不变

### 需求详情

#### 四类错误浮层反馈文案

| errorType | 主文案（❌ 前缀） | 引导次要行 |
|---|---|---|
| `no-config` | ❌ 未配置可用翻译源 | 请在配置页选择或添加源 |
| `network` | ❌ 翻译请求失败 | 请检查网络或源地址 |
| `rate-limit` | ❌ 翻译源繁忙（限流） | 请稍后再试或在配置页切换源 |
| `unreachable` | ❌ 翻译源不可达 | 请在配置页切换到其它源 |

#### 浮层状态扩展

| 状态 | 反馈 | 变化 |
|---|---|---|
| 待触发 | 圆形「译」按钮 | 沿用 |
| 加载 | 「翻译中…」 | 沿用 |
| 成功 | 译文文本 | 沿用 |
| 失败-配置缺失 | ❌ 未配置可用翻译源 + 引导 | 新增 |
| 失败-网络 | ❌ 翻译请求失败 + 引导 | 新增 |
| 失败-限流 | ❌ 翻译源繁忙 + 引导 | 新增 |
| 失败-源不可达 | ❌ 翻译源不可达 + 引导 | 新增 |

### 交互说明

浮层交互流程不变（选中→触发按钮→浮层→关闭）。变化仅在失败态渲染：
- 主行：`❌` + 可读主文案（如「未配置可用翻译源」）
- 引导次要行：可操作性引导文案（如「请在配置页选择或添加源」），字号较小、颜色对比度满足 WCAG AA，纯文本不可点击
- 浮层最大宽度 360px 不变，引导文案较长时自动换行

---

## 非功能需求

### 性能要求

- 浮层渲染无额外异步操作，不引入延迟

### 兼容性要求

- content.ts 结果类型从 `{ translatedText?: string; error?: string }` 升级为 `TranslateResult`，消费 `errorType` 字段
- 若 errorType 缺失（理论上不应发生，但防御性处理），回退到旧 `❌ ${error}` 行为

### 安全性要求

- 无新增安全风险，错误文案为静态字符串，不含用户输入

### 边界场景与异常处理

| 场景 | 处理方式 |
|------|----------|
| result.errorType 存在且为四类之一 | 按对应分支渲染主文案 + 引导次要行 |
| result.error 存在但 errorType 缺失 | 回退到旧 `❌ ${error}` 单行渲染 |
| result.error 和 errorType 均不存在 | 显示 translatedText（成功态） |
| panel 在异步响应前被用户关闭（panel=null） | 跳过渲染（沿用现有 `if (panel)` 守卫） |

---

## 需求歧义处

| 编号 | 疑问点 | 影响范围 | 决策 |
|------|--------|----------|------|
| 1 | errorTypeMessage 已合并主文案+引导，是否复用？ | error.ts / content.ts | 不复用，新增 errorFeedback 返回拆分的 {main, guidance}；errorTypeMessage 签名不变以保持上游契约稳定 |
| 2 | 单元测试如何覆盖「渲染路径」？ | 测试策略 | 测试 errorFeedback 数据层（四类 errorType → {main, guidance}），DOM 构建为确定性操作由 e2e 回归覆盖 |

---

## 参考资料

- PRD Issue #1: https://github.com/Aiden-FE/llm-translator/issues/1
- 研发任务 Issue #11: https://github.com/Aiden-FE/llm-translator/issues/11
- PRD 文档: `releases/v0.2/1-unified-adapter/PRD.md`
- 上游 #10 DESIGN: `releases/v0.2/10/DESIGN.md`
- 上游 #10 CHANGELOG: `releases/v0.2/10/CHANGELOG.md`
- 上游 PR #12: https://github.com/Aiden-FE/llm-translator/pull/12
