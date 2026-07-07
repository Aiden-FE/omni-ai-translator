# PRD — 传统 API Key 配置（traditional-apikey-config）

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（PRD） |
| 状态 | draft |
| 负责人 |  |
| 创建日期 | 2026-07-01 |
| 最近更新 | 2026-07-01 |
| 适用范围 | LLM Translator v0.2 — 功能事项 3 |
| 关联材料 | [../1-unified-adapter/PRD.md](../1-unified-adapter/PRD.md)、[../2-builtin-fallback/PRD.md](../2-builtin-fallback/PRD.md)、[../../../knowledges/product-wiki/privacy/PRIVACY-POLICY.md](../../../knowledges/product-wiki/privacy/PRIVACY-POLICY.md) |

---

## 1. 摘要

本 PRD 定义「传统翻译源 API Key 配置」：在配置页支持用户为传统翻译源（Google / 微软）填入自有 API Key 与端点，启用后覆盖免 Key 兜底，提升额度与稳定性。使用户在不想用 LLM、又想要比免 Key 兜底更稳定体验时，有传统翻译 API 这条中间路径。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 / 负责人 | 待定 | 本迭代由 prodflow-sprint-open 推进 |
| 研发（前端/扩展） | 待定 | 配置页扩展 + provider 复用 |
| UX | 待定 | UX 章节待 issue 创建后补全 |

## 3. 背景

v0.2 提供了三条翻译路径：
1. **免 Key 兜底**（功能事项 2）：零配置，但非官方端点不稳定、有限额。
2. **LLM 配置**（v0.1 已有）：质量高、可定制，但需 Key / 本地模型。
3. **传统 API Key 配置**（本 PRD）：用户为 Google / 微软填自有官方 API Key。

第三条路径解决中间地带用户：他们没有 LLM Key、不想折腾本地模型，但希望比免 Key 兜底更稳定（官方 API 有额度保障、无地域封禁风险），且传统翻译 API Key 申请门槛低于 LLM、成本可控。

本 PRD 复用功能事项 1 的 `TranslationProvider` 接口与功能事项 2 的 google / microsoft provider 实现，区别在于：免 Key 兜底用内置公共端点，本 PRD 让用户填自有官方 API Key + 端点，走官方 API。配置页交互由功能事项 4 统一承担，本 PRD 定义数据模型与配置能力。

## 4. 目标

**目标**：配置页支持传统翻译源填 Key/端点，启用后覆盖免 Key 兜底，连通性测试通过。

**对齐愿景**：产品策略「模型自选 + 隐私可控」——把「源」的选择权交给用户。传统 API Key 是 LLM 之外的可选源，用户按质量、成本、隐私偏好自选。

**关键结果（SMART）**：

| 编号 | 关键结果 | 衡量方式 |
|---|---|---|
| KR1 | 配置页可为 google / microsoft 传统源填入 API Key 与端点 | 配置页审查 |
| KR2 | 填 Key 启用后，翻译走官方 API 而非免 Key 公共端点 | e2e：填 Key 后请求落到官方端点 |
| KR3 | 连通性测试覆盖传统 API Key 源 | 测试功能验证 |
| KR4 | 用户 Key 仅存本地，不上传 | 代码审查 + 隐私声明一致 |

## 5. 细分市场

- **普通阅读用户（进阶）**：已用免 Key 兜底，但遇到限流/不可达，想花点小钱买官方 Key 求稳定。本 PRD 给他们升级路径。
- **技术用户 / 开发者**：可能更倾向 LLM，但传统 API Key 作为备用源也有价值。本 PRD 让他们能在同一配置页管理多种源。

**约束**：
- 用户 Key 仅存 `chrome.storage.local`，不上传、不入日志（沿用 v0.1 安全要求）。
- 官方 API 端点与免 Key 端点不同，provider 需按「是否有 Key」切换调用方式。

## 6. 价值主张

| 客户任务 / 需求 | 客户获得 | 客户避免的痛点 | 我们做得更好的地方 |
|---|---|---|---|
| 想要稳定传统翻译 | 自有官方 Key，额度与稳定性有保障 | 免 Key 兜底被限流/封禁 | 同一插件内免 Key 与有 Key 两种模式平滑切换 |
| 想控制成本 | 传统 API 按量计费，门槛低于 LLM | LLM 成本高或需部署 | 提供介于兜底与 LLM 之间的中间选项 |
| 想要 Key 安全 | Key 仅存本地 | Key 被上传第三方 | 沿用 v0.1 本地存储安全要求 |

## 7. 解决方案

### 7.1 UX / 原型

配置页交互由功能事项 4（source-picker-ui）统一设计。本 PRD 约束的配置要素：
- 源类型可选「传统翻译（Google / 微软）」。
- 选中传统源后，表单提供字段：API Key、端点（BaseURL，可默认填官方端点）。
- 启用后标记为当前生效源，覆盖免 Key 兜底。
- 「测试连通」按钮对传统 API Key 源生效。

> 详细 UX 设计待 issue 创建后由 prodflow-prd revise 模式补全（参考 prodflow-ux-evaluate 技能产出）。

### 7.2 核心功能

**7.2.1 配置数据模型**

扩展现有 `ProviderConfig`（`shared/types.ts`）以兼容传统源：
- 传统源 provider 配置包含：`id`、`name`、`type`（如 `google` / `microsoft`）、`apiKey`、`baseUrl`（官方端点）。
- 与 LLM 配置共用同一存储结构（`getProviders/setProviders`），保证配置页统一管理。
- 兼容性：v0.1 既有 LLM 配置可平滑读取，不被破坏。

**7.2.2 有 Key 调用逻辑**

- google / microsoft provider（功能事项 2 实现）扩展：当配置含 `apiKey` 时，走官方 API 端点（需 Key 鉴权）；无 Key 时走免 Key 公共端点。
- 路由（功能事项 1）：用户启用某传统 API Key 源后，该源成为当前生效源，覆盖兜底。

**7.2.3 连通性测试**

- 复用 `testProvider` 通道：对传统 API Key 源发送最小翻译请求，验证 Key 与端点可用。
- 测试结果在配置页展示（成功/失败 + 提示）。

**7.2.4 Key 安全**

- 用户填入的传统 API Key 仅存 `chrome.storage.local`，与 LLM Key 同等保护。
- 不写入日志、错误上报、commit。

### 7.3 技术

- 配置页（`entrypoints/options/App.vue`）扩展源类型下拉项与字段。
- `shared/types.ts` 扩展 `ProviderType` / `ProviderConfig` 以容纳传统源，保持向后兼容。
- `shared/storage.ts` 无需改动（已通用）。
- background 经适配层调用，不感知源类型。

### 7.4 假设

| 假设 | 验证方式 | 失败信号 |
|---|---|---|
| Google / 微软官方翻译 API 支持 Key 鉴权 | 查官方文档 | 某源无官方 Key API |
| 有 Key 与无 Key 可共用同一 provider 实现 | 代码审查 | 调用方式差异过大需拆分 |
| 用户能自行获取官方 API Key | 文档引导 | 用户不知如何申请 |

## 8. 发布

**时间范围**：约 0.5–1 周（复用功能事项 1/2 的 provider，主要是配置页扩展）。

**第一版（v0.2 本 PRD 范围）**：
- 传统源 API Key + 端点配置
- 有 Key 走官方 API 逻辑
- 连通性测试覆盖
- Key 本地安全存储

**未来版本**：
- 更多传统翻译源接入（由适配层支撑）

## 本轮不做

| 功能 | 延后原因 | 预计版本 |
|---|---|---|
| 自动降级 | 超三周风险 | v0.3+ |
| 传统源用量统计 | 非本轮范围 | 后续 |
| 内置默认官方 Key | 违背「不内置 Key」安全要求 | 不做 |

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 配置能力 | 配置页可为 google/microsoft 填 Key + 端点 | P0 |
| 覆盖兜底 | 启用传统 API Key 源后翻译走官方端点 | P0 |
| 连通性测试 | 测试覆盖传统 API Key 源 | P0 |
| Key 安全 | Key 仅存本地，不上传不入日志 | P0 |
| 向后兼容 | v0.1 LLM 配置可平滑读取 | P0 |

## UX 设计

### UX 依据

- Issue: `#3`（https://github.com/Aiden-FE/llm-translator/issues/3）
- 版本: v0.2
- 知识来源: [knowledges/ux/interaction-patterns.md](../../../knowledges/ux/interaction-patterns.md)（设置页提供方管理、测试连通反馈）、[knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)（提供方卡片、输入框）、[knowledges/ux/accessibility.md](../../../knowledges/ux/accessibility.md)（输入框 placeholder、键盘聚焦）
- 设计假设: 用户能区分「填 Key 走官方 API」与「留空走免 Key 兜底」两种模式，靠 placeholder 与提示文案即可理解——待 UX 评审验证

### 视觉设计

> 本 PRD 的配置页字段交互由 [../4-source-picker-ui/PRD.md](../4-source-picker-ui/PRD.md) 统一承担视觉实现。本 PRD 沿用 v0.1 提供方卡片视觉（[knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)），不单独产出视觉原型。

### 交互逻辑（差异）

通用配置页提供方管理（增删改、启用、测试连通）引用 [knowledges/ux/interaction-patterns.md](../../../knowledges/ux/interaction-patterns.md)，不重复展开。本 PRD 差异：

1. **传统源字段差异化**：选择传统源类型（google/microsoft）后，字段为 name / apiKey / baseUrl（不显示 LLM 的 model 字段）。baseUrl 默认填官方端点，可改。
2. **Key 留空语义**：传统源 apiKey 可留空——留空时该源走「免 Key 兜底」端点，填入时走「官方 API」。placeholder 需明示此语义（如「留空使用免 Key 兜底；填入则走官方 API」），避免用户困惑。
3. **Key 输入安全**：apiKey 输入框 `type="password"`，沿用 v0.1 LLM Key 模式，掩码显示。
4. **连通性测试反馈**：沿用 v0.1 `testProvider` 反馈模式——成功显示「✅ <译文>」，失败显示「❌ <错误>」。

### 业务约束

- Key 仅存 `chrome.storage.local`，不入日志/错误上报/commit（沿用 v0.1 安全要求）。
- 有 Key 与无 Key 走不同端点，provider 按 apiKey 是否存在切换调用方式。
- 启用传统 API Key 源后覆盖免 Key 兜底，成为当前生效源。

### 状态变化（差异）

| 状态 | 反馈 |
|---|---|
| 字段填写中 | placeholder 引导（留空=兜底，填入=官方 API） |
| 测试中 | 「测试中…」（沿用 v0.1） |
| 测试成功 | ✅ <译文>（沿用 v0.1） |
| 测试失败 | ❌ <错误>（沿用 v0.1，错误经第 1 项统一错误模型归一化） |
| 已启用 | 启用按钮高亮（沿用 v0.1） |

### 设备适配（差异）

无差异。配置页最大 720px 居中，沿用 [knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)。

### 可访问性（差异）

- apiKey 输入框带 placeholder 说明用途与留空语义（符合 [knowledges/ux/accessibility.md](../../../knowledges/ux/accessibility.md)「输入框带 placeholder」）。
- 所有字段可 Tab 聚焦操作（沿用）。
- 测试结果不依赖颜色，含「✅/❌」文字前缀（沿用）。

### 验收补充

- 传统源字段含 name/apiKey/baseUrl，不显示 model。
- apiKey 留空语义有 placeholder 明示。
- apiKey 输入掩码（password），仅存本地。
- 连通性测试对传统 API Key 源生效，反馈沿用 v0.1 模式。
- v0.1 LLM 配置流程不退化（回归）。
