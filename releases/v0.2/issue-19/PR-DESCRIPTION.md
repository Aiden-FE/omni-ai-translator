## 变更摘要

本 PR 落地 PRD #3 功能事项 3 的前端联调与回归部分（Issue #19）：配置页为 microsoft 有 Key 场景新增 region 输入框（消费 #18 交付的 `ProviderConfig.region` 字段），并完成有 Key 端到端联调验证与安全/LLM 回归。本任务在 #18（PR #20）合并到 master 后基于最新 master 创建分支，非 stacked。

### 主要改动
- `entrypoints/options/App.vue`：provider-card 新增 region 输入框，条件渲染 `v-if="p.type === 'microsoft' && p.apiKey"`（microsoft 且已填 apiKey 时显示，无 Key 或非 microsoft 源不显示），`v-model="p.region"`，placeholder「Azure 区域，如 eastus」，`@change="saveProviders"` 经现有链路存入 `chrome.storage.local`。
- `e2e/mock-server.ts`：新增 microsoft `/translate` 路由（返回微软响应格式 `[{ translations: [{ text, to }] }]`）+ `lastRequestHeaders`/`getLastRequestHeaders()` 导出；保留既有 `/health` 与 `/v1/chat/completions` 路由不变。
- `e2e/translate.spec.ts`：新增 microsoft 有 Key 划词 e2e 用例 — 配置 microsoft+Key+region 启用，划词翻译断言浮层显示译文 + mock 收到请求携带 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region: eastus`。
- `knowledges/feature/translator/unified-adapter.md`：更新功能知识文档，标注 #19 前端消费 region 字段已完成 + 配置页 region 输入框 + e2e 覆盖。

### 影响面
- 仅前端配置页 + e2e，不改 shared 类型与后端调用逻辑（#18 已交付）。
- region 输入框为条件渲染新增项，既有配置（无 region）正常读取，无 Key 路径与 LLM 配置不受影响。
- baseUrl 默认值/placeholder 与后端官方端点语义一致校对（google host → 后端追加 `/language/translate/v2`；microsoft 含 `/translate` → 后端原样用 + `?params`），无需修改。

### 测试结果
- `pnpm typecheck`（vue-tsc）：零错误。
- `pnpm lint`（eslint）：零告警。
- `pnpm test`（vitest）：6 文件 85 用例全绿（含 traditional-provider 14 用例 region header 覆盖）。
- `pnpm e2e`（wxt build + playwright）：3 用例全绿（既有 2 个 LLM e2e + 新增 microsoft 有 Key 划词 e2e）。

### 安全
- apiKey 输入框 `type="password"` 掩码（既有）；region 为公开 Azure 区域值（如 eastus），普通文本输入（非凭证，无需掩码）。
- Key/region 仅存 `chrome.storage.local`，不上传第三方、不入日志/错误上报/commit（后端 #18 已确保错误文案不含 Key/region）。
- e2e 使用占位值 `test-ms-key`/`eastus`，无真实密钥。

### 回滚方案
移除 App.vue region 输入框 + 还原 mock-server.ts + 删除 microsoft e2e 用例即恢复 #18 合并态。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #3（https://github.com/Aiden-FE/llm-translator/issues/3） |
| PRD 文档 | `releases/v0.2/3-traditional-apikey-config/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环（https://github.com/Aiden-FE/llm-translator/milestone/1） |
| DESIGN | `releases/v0.2/issue-19/DESIGN.md` |
| PLAN | `releases/v0.2/issue-19/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-19/CHANGELOG.md` |
| 验收标准 | 见 Issue #19 与 PRD §验收标准；#19 验收：microsoft 有 Key 时显示 region 输入框（placeholder 如「Azure 区域，如 eastus」）、无 Key 或非 microsoft 源不显示、有 Key 传统源填入后启用划词翻译落到官方端点的 e2e 验证、apiKey/region placeholder 与 baseUrl 默认值与后端语义一致、Key/region 不上传不入日志、v0.1 LLM 配置回归通过 |
| 知识沉淀 | context: 无; adr: 无; feature: `knowledges/feature/translator/unified-adapter.md`（更新：标注 #19 前端 region 消费已完成 + 配置页 region 输入框 + e2e 覆盖）; runbook: 无 |
| 并发安全等级 | blocked-by-upstream（已解除：上游 #18 已合并到 master） |
| MR 基线策略 | after-upstream-merged（上游 #18 PR #20 已合并，从最新 master 创建分支，非 stacked） |
| 上游 Issue/MR | #18 → PR #20（已合并到 master） |
| 基线分支 | master |
| 推荐合并顺序 | 本任务在 #18 之后合并（#18 已合并，可直接合并本 PR） |
| Stacked MR | 否 |
| 依赖契约或接口文档 | PRD `releases/v0.2/3-traditional-apikey-config/PRD.md`；#18 DESIGN `releases/v0.2/issue-18/DESIGN.md`、CHANGELOG `releases/v0.2/issue-18/CHANGELOG.md`；关键契约：`ProviderConfig.region?: string`（可选，microsoft 有 Key 场景使用，google 不使用）；microsoft 有 Key 时后端 `callMicrosoftWithKey` 读 `config.region`（trim 后非空）携带 `Ocp-Apim-Subscription-Region` header（region 为空/纯空白则不发）；apiKey 留空走免 Key 兜底，填入走官方 API |

> 说明：本 PR 仅创建，不自行合并——合并由协调器在 prodflow-review 审查后统一执行。
