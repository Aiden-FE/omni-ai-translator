# PRD — #19 传统 API Key 源 有 Key 场景前端联调与回归

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（开发 Issue 视角的 PRD 摘要） |
| 状态 | approved（无人值守自动批准） |
| 关联 Issue | #19 |
| 关联 PRD | #3 功能事项 3（[releases/v0.2/3-traditional-apikey-config/PRD.md](../3-traditional-apikey-config/PRD.md)） |
| 上游依赖 | #18（已合并到 master，PR #20） |

## 1. 需求来源

本任务为 PRD #3 功能事项 3 的前端联调与回归部分，承接后端 #18 已交付的 `ProviderConfig.region` 字段与 microsoft/google 有 Key 走官方 API 调用实现，在配置页消费 region 字段并做端到端验证与回归。

## 2. 处理范围（来自 Issue #19）

### 包含
- 配置页为 microsoft 有 Key 场景新增 region 输入框（消费 `ProviderConfig.region` 字段）。
- 配置页有 Key 场景端到端联调验证。
- baseUrl 默认值 / placeholder 与后端语义一致校对。
- Key / region 安全（password 掩码 + 仅存本地）回归。
- v0.1 LLM 配置流程回归。

### 不包含
- `ProviderConfig.region` 字段定义与后端官方 Key 调用实现（#18 已完成）。
- 配置页其他 UI 新功能开发（#16 已交付）。

## 3. 交付内容与验收标准

| 交付项 | 验收条件 | 优先级 |
|---|---|---|
| region 输入框 | microsoft 有 Key 时显示 region 输入框（placeholder 如「Azure 区域，如 eastus」），无 Key 或非 microsoft 源不显示 | P0 |
| 有 Key e2e | 有 Key 传统源填入后启用，划词翻译落到官方端点的 e2e 验证 | P0 |
| baseUrl/placeholder 校对 | apiKey / region placeholder、baseUrl 默认值与后端官方端点语义一致，必要时小幅修正 | P0 |
| Key/region 安全回归 | Key / region 不上传 / 不入日志的回归确认；Key password 掩码 | P0 |
| LLM 回归 | v0.1 LLM 配置读取与连通性回归通过 | P0 |

## 4. 依赖契约（#18 已交付）

- `ProviderConfig.region?: string`（可选，microsoft 有 Key 场景使用，google 不使用）。
- microsoft 有 Key 时后端读 `config.region`（trim 后非空）携带 `Ocp-Apim-Subscription-Region` header；region 为空/纯空白则不发。
- apiKey 留空走免 Key 兜底，填入走官方 API。

## 5. 约束

- Key / region 不入日志、错误上报、commit。
- 不破坏 v0.1 LLM 配置流程与 #16 配置页既有功能。
- region 字段向后兼容，既有配置无 region 可正常读取。
