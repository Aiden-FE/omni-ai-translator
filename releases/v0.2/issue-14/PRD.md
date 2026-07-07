# PRD — 免 Key 翻译源 google/microsoft provider 实现与生效源切换契约

| 项 | 内容 |
|---|---|
| 文档类型 | 研发任务需求文档（基于 PRD #2 澄清补充） |
| ISSUE_ID | #14 |
| 所属 PRD Issue | #2 [v0.2-2] 免 Key 免费翻译源 builtin-fallback |
| 迭代版本 | v0.2 |
| 状态 | confirmed（无人值守自动确认） |
| 关联材料 | [../2-builtin-fallback/PRD.md](../2-builtin-fallback/PRD.md)、[ADR-001](../../../knowledges/adr/001-unified-translator-adapter-layer.md)、[unified-adapter 功能知识](../../../knowledges/feature/translator/unified-adapter.md) |

> 本文档不重写 #2 PRD，仅记录 #14 研发任务的需求澄清结果与实现约束。完整需求以 #2 PRD（2026-07-02 语义修订版）为准。

## 1. 任务目标

在 unified-adapter #10 已落地的 `TranslationProvider` 接口与注册表之上，实现 google、microsoft 两个免 Key 免费 provider，注册到适配层作为用户可选源；实现默认选中 microsoft 的生效源逻辑与切换契约；声明 host_permissions；归类免费源失败错误；更新隐私声明。

## 2. 语义澄清（关键，与 PRD 原文「兜底源」偏差，以 #14 为准）

经需求澄清（#14 Issue 正文 + #2 PRD 2026-07-02 修订区块），本任务实现的是「用户可选的免费翻译源」，而非「兜底源」：

- **不存在「兜底」概念**：google/microsoft 是用户可选的免费翻译源，与 LLM 源并列出现在可选列表中。
- **无隐式自动回退机制**：源失败时不自动切到其它源，仅返回明确错误提示，由用户人工切换。
- **默认选中 microsoft**（显式默认值，保证开箱即用）：全新安装、用户未做选择时默认生效 microsoft，用户可随时切到 google / LLM。原「未配置时自动启用兜底 / 兜底被自有源覆盖」等表述作废。
- **端点内置为常量，不可编辑**：免费源只能选择/切换或被自有源替换为生效项，不能编辑端点。

> 后续动作：PRD.md（#2）顶部已含「2026-07-02 语义修订」区块，本任务范围内可执行的部分（隐私声明措辞同步）在实现中完成；如需进一步用 prodflow-prd revise 修订，在 CHANGELOG/收尾中标注。

## 3. 处理范围

### 3.1 包含

- google、microsoft 两个免 Key provider 实现（调用免 Key 公共端点，解析非标准响应结构，容错）。
- 将两个 provider 注册到统一适配层，作为用户可选的免费翻译源。
- 默认生效源逻辑：全新安装默认选中 microsoft（显式默认值）；无隐式自动回退。
- 生效源切换契约：background 暴露 `getActiveSources`（返回含免费源的可用源列表及当前生效源）、`setActiveSource`（切换生效源）消息接口供 #4 消费。
- host_permissions 声明：google/microsoft 域名在 wxt.config.ts 声明。
- 错误归类映射：免费源失败按统一错误模型归类（源不可达 / 限流），返回可读提示。
- 隐私声明更新：更新 `knowledges/product-wiki/privacy/PRIVACY-POLICY.md`，将「兜底」措辞改为「用户可选的免费翻译源」，明示默认 microsoft 外传行为。

### 3.2 不包含

- 配置页源选择 UI（归功能事项 4 / #4，另一 PRD）。
- 自动降级与优先级列表（v0.3+）。
- 免费源端点可编辑（端点内置，不可编辑）。
- 内置 LLM 免 Key 接口（不可行，不做）。

## 4. 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 免 Key provider | google、microsoft 两个 provider 注册到适配层，出现在可用源列表 | P0 |
| 开箱即用 | 全新状态默认选中 microsoft，划词翻译返回译文 | P0 |
| 切换生效源 | 用户可通过 `setActiveSource` 切换生效源（切到 google / LLM） | P0 |
| 错误提示 | 免费源失败返回「源不可达/限流」可读提示（不自动回退） | P0 |
| host_permissions | 免费源域名已声明，background 可跨域请求 | P0 |
| 隐私声明 | 已更新默认外传行为（免费源语义 + 默认 microsoft） | P0 |

## 5. 依赖与联调

- 依赖功能事项 1（unified-adapter #10 已合并）的 `TranslationProvider` 接口与注册表。
- 为功能事项 4（#4 source-picker-ui）暴露 `getActiveSources`/`setActiveSource` 消息契约，#4 为下游消费方。
- 并发安全等级：parallel-safe；MR 基线策略：base-branch；无上游阻塞。
