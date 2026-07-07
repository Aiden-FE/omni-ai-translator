## 变更摘要

本 PR 落地 PRD #3 功能事项 3 的后端部分（Issue #18）：传统翻译源在用户填入官方 API Key 后走官方 API 端点；无 Key 时维持现有免 Key 公共端点逻辑不变。

### 主要改动
- `shared/types.ts`：`ProviderConfig` 新增可选 `region?: string` 字段（供 microsoft Azure Translator 有 Key 时携带 `Ocp-Apim-Subscription-Region`；google 不使用；缺省/纯空白不发）。向后兼容，无需数据迁移。
- `shared/translator/traditional-provider.ts`：新增 `callGoogleWithKey`（官方 v2 端点 `?key=`，POST `{q,target,source?,format}`）与 `callMicrosoftWithKey`（官方 Key 端点，headers `Ocp-Apim-Subscription-Key` + `Ocp-Apim-Subscription-Region`，不走 edge auth）；`translate` 内按 `config.apiKey` 是否存在切换有/无 Key 调用；保留 `await` 以使 catch 捕获 rejected promise。
- `shared/translator/__tests__/traditional-provider.test.ts`：新增 14 个单测，覆盖 google/microsoft 有/无 Key 双路径、microsoft 有 Key region header 校验（含 region 缺省/纯空白不发）、错误归一化（429/500/TypeError）、test() 委托、未知类型。

### 影响面
- 仅 shared 层，与已合并 #14/#16 无代码冲突。
- region 字段为可选新增，v0.1 LLM 配置回归不退化。
- 前端 region 输入框 UI 与有 Key 联调由后续任务 #19 负责（消费 `ProviderConfig.region`）。

### 测试结果
- `pnpm test`：85 项全绿（含新增 14 项）。
- `pnpm typecheck`（vue-tsc）：零错误。
- `pnpm lint`（eslint）：零告警。

### 安全
- Key / region 仅入 query 参数 / header，不入日志、错误文案、commit。
- 错误文案仅含 HTTP 状态码与响应体，不含 Key/region。

### 回滚方案
移除 `config.apiKey` 分支与 `region` 字段即恢复免 Key 单路径行为。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #3（https://github.com/Aiden-FE/llm-translator/issues/3） |
| PRD 文档 | `releases/v0.2/3-traditional-apikey-config/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环（https://github.com/Aiden-FE/llm-translator/milestone/1） |
| DESIGN | `releases/v0.2/issue-18/DESIGN.md` |
| PLAN | `releases/v0.2/issue-18/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-18/CHANGELOG.md` |
| 验收标准 | 见 PRD §验收标准；#18 验收：region 字段向后兼容、有 Key 走官方端点、microsoft region header、无 Key 兜底不变、连通性测试、错误归一化、Key/region 安全、单测覆盖有/无 Key 双路径 |
| 知识沉淀 | context: 无; adr: 无; feature: `knowledges/feature/translator/unified-adapter.md`（补充传统 provider 有 Key/无 Key 双模式 + region 契约）、`knowledges/feature/translator/index.md`; runbook: 无 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无 |
| 基线分支 | master |
| 推荐合并顺序 | 本任务 #18 先于 #19 合并 |
| Stacked MR | 否 |
| 依赖契约或接口文档 | PRD `releases/v0.2/3-traditional-apikey-config/PRD.md`；DESIGN 决议 region 方案 A：ProviderConfig 新增可选 `region?: string`，microsoft 有 Key 时全局端点携带 `Ocp-Apim-Subscription-Key` + `Ocp-Apim-Subscription-Region: config.region`；google 无 region 概念 |
