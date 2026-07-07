# PRD — #18 传统翻译源 有 Key 走官方 API 调用（后端）

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（开发任务级，引用 PRD Issue #3 功能事项 3） |
| 状态 | approved（无人值守自动批准） |
| 关联 Issue | #18（https://github.com/Aiden-FE/llm-translator/issues/18） |
| 关联 PRD | #3 — releases/v0.2/3-traditional-apikey-config/PRD.md |
| 迭代版本 | v0.2 |
| 负责层 | 后端（shared 层） |

## 1. 任务背景

PRD Issue #3 功能事项 3「traditional-apikey-config」定义传统翻译源 API Key 配置能力。本任务 #18 是其后端落地部分：扩展数据模型与 provider 调用逻辑，使传统翻译源在用户填入官方 API Key 后走官方 API 端点；无 Key 时维持现有免 Key 公共端点逻辑不变。前端 region 输入框 UI 与联调回归由 #19 负责，不在本任务范围。

## 2. 需求范围

### 2.1 包含

- `shared/types.ts`：`ProviderConfig` 新增可选 `region?: string` 字段（供 microsoft Azure Translator 携带 `Ocp-Apim-Subscription-Region`；google 不使用）。向后兼容，缺省不影响既有配置。
- `shared/translator/traditional-provider.ts`：provider 按 `config.apiKey` 是否存在切换调用方式：
  - 有 Key → google/microsoft 走官方 Key 鉴权端点（读 `config.baseUrl`）。
  - microsoft 有 Key 时携带 `Ocp-Apim-Subscription-Key` + `Ocp-Apim-Subscription-Region: config.region`。
  - 无 Key → 维持现有免 Key 公共端点逻辑（builtin-sources.ts 常量端点），行为不变。
- 连通性测试经现有 `test()` 天然覆盖（test 委托 translate）。
- 单测覆盖有 Key / 无 Key 两条路径（microsoft 有 Key 含 region header 校验）。

### 2.2 不包含

- 配置页 region 输入框 UI（由 #19 前端任务负责消费 `ProviderConfig.region`）。
- 配置页 baseUrl 默认值/字段联动调整（#19 范围）。
- 自动降级、用量统计（PRD 本轮不做）。

## 3. 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| region 字段 | `ProviderConfig` 新增可选 `region?: string`，向后兼容 | P0 |
| 有 Key 走官方端点 | 填 Key 后翻译请求落到官方端点（覆盖免 Key 兜底） | P0 |
| microsoft region header | microsoft 有 Key 时携带 `Ocp-Apim-Subscription-Region` header（值取自 `config.region`） | P0 |
| 无 Key 兜底不变 | Key 留空时仍走免 Key 公共端点，行为不退化 | P0 |
| 连通性测试 | 连通性测试对传统 API Key 源成功（经现有 test()） | P0 |
| 向后兼容 | v0.1 LLM 配置回归不退化（region 可选，缺省不破坏既有配置读取） | P0 |
| 错误归一化 | 失败经 `classifyError` 归类为 network / rate-limit / unreachable | P0 |
| Key/region 安全 | Key / region 仅存本地，不入日志、错误上报、commit | P0 |
| 单测 | 覆盖有 Key / 无 Key 两条路径，microsoft 有 Key 含 region header 校验 | P0 |

## 4. 约束

- Key / region 不入日志、错误上报、commit（沿用 v0.1 安全要求）。
- 有 Key 与无 Key 走不同端点，provider 按 apiKey 是否存在切换调用方式。
- region 字段为可选新增，缺省时 microsoft 不发送 Region header（部分全局资源可省略）。
- 改动局限于 shared 层，与已合并 #14/#16 无代码冲突。
