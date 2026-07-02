# MEMORY — #19 传统 API Key 源 有 Key 场景前端联调与回归

| 项 | 内容 |
|---|---|
| 关联 Issue | #19 |
| 关联 PRD | #3 功能事项 3（traditional-apikey-config） |
| 迭代版本 | v0.2 |
| 任务类型 | 前端开发 Issue（label: 前端、AI） |
| 基础分支 | master（已含 #18 改动） |
| Worktree | `.worktrees/master-issue-19`（分支 issue-19） |

## PRD 摘要（#3 功能事项 3）

配置页支持传统翻译源（google/microsoft）填入自有官方 API Key + 端点，启用后覆盖免 Key 兜底，走官方 API。Key 仅存 `chrome.storage.local`，不上传、不入日志。验收：配置页可填 Key+端点、填 Key 后翻译走官方端点、连通性测试覆盖传统源、Key 本地安全、v0.1 LLM 配置回归通过。

## 依赖链元数据

- 并发安全等级：`blocked-by-upstream`（现已解除：上游 #18 已合并到 master）
- MR 基线策略：`after-upstream-merged`（已满足，PR #20 已合并，从最新 master 创建分支，非 stacked）
- 上游 Issue/MR：#18 → PR #20（已合并）
- 推荐合并顺序：本任务在 #18 之后合并
- Stacked MR：否

## 依赖契约（#18 已交付，本任务消费）

- `ProviderConfig.region?: string`（`shared/types.ts`）已新增，可选，向后兼容。
- microsoft 有 Key 时后端 `callMicrosoftWithKey`（`shared/translator/traditional-provider.ts:193`）读 `config.region?.trim()`，非空则携带 `Ocp-Apim-Subscription-Region` header；纯空白不发。同时带 `Ocp-Apim-Subscription-Key`，不再走 edge auth。
- google 有 Key 时 `callGoogleWithKey`（同文件:145）走官方 v2 端点，不使用 region。
- apiKey 留空 → 走免 Key 兜底端点（行为不变）；填入 → 走官方 API。
- Key/region 仅存本地，不入日志/错误文案/commit（#18 已实现，本任务回归确认）。

## 代码现状关键信息

### 配置页 `entrypoints/options/App.vue`
- 源类型下拉 4 项（openai-compatible / ollama / google / microsoft）。
- `DEFAULT_BASE_URL`：google=`https://translation.googleapis.com`（后端追加 `/language/translate/v2`）；microsoft=`https://api.cognitive.microsofttranslator.com/translate`（后端原样用 + `?api-version=3.0&to=`）。**与后端语义一致**。
- `apiKeyPlaceholder`：`'留空使用免 Key 兜底；填入则走官方 API'`（已符合 PRD）。
- apiKey 输入框 `type="password"`（已符合安全要求）。
- `addProvider` 不设 region（可选字段，缺省正常）。
- **缺口：无 region 输入框**（本任务核心改动）。

### 测试
- 单测 `shared/translator/__tests__/traditional-provider.test.ts`（14 用例，#18 交付，覆盖 google/microsoft 有/无 Key、region header、错误归一化）。
- e2e `e2e/translate.spec.ts`：通过 options 页 UI 配置 provider 指向 mock server，划词验证。**当前 mock server 仅模拟 OpenAI 端点，未覆盖 microsoft 有 Key 路径**。
- `e2e/mock-server.ts`：仅 `/health` 与 `/v1/chat/completions` 路由，只记录 lastRequestBody 不记 headers。

## 开发范围

- 前端改动：`entrypoints/options/App.vue` 新增 region 输入框（microsoft 有 Key 时显示）。
- e2e 验证：扩展 mock server 支持 microsoft translate 路由 + 记录 headers，新增 microsoft 有 Key 划词 e2e。
- 校对：baseUrl 默认值/placeholder 与后端语义一致（已确认一致，无需改）。
- 回归：Key/region 安全、v0.1 LLM 配置流程（跑 `pnpm test` + `pnpm typecheck` + `pnpm lint`）。
- 不含：ProviderConfig.region 字段定义与后端调用（#18 已完成）、配置页其他 UI（#16 已交付）。

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚 |
|---|---|---|---|---|
| region 显示条件 | `p.type === 'microsoft' && p.apiKey`（microsoft 且有 Key） | Issue #19 明确「microsoft 有 Key 时显示…无 Key 或非 microsoft 源不显示」 | 用户先填 region 再清空 Key 时 region 输入框消失，但 region 值仍保留在 config（无害，后端无 Key 不读 region） | 移除 v-if |
| region 输入框 type | 普通文本（非 password） | region 是公开 Azure 区域值（如 eastus），非凭证；掩码损害可校验性。安全要求（仅存本地+不入日志）仍满足 | 低 | 改 type |
| region placeholder | `Azure 区域，如 eastus` | Issue #19 明示 | 无 | 改文案 |
| baseUrl 默认值 | 不改（已与后端一致） | 校对后端 callGoogleWithKey/callMicrosoftWithKey 端点构造逻辑，host-only google + /translate microsoft 均匹配 | 无 | 无 |
| e2e 策略 | 扩展 mock server + 新增 microsoft 有 Key e2e | Issue 要求「有 Key 传统源填入后启用，划词翻译落到官方端点的 e2e 验证」 | mock server 改动需兼容既有 LLM e2e | 还原 mock-server.ts |

## 测试结果（Step4 执行后）

- `pnpm typecheck`：零错误。
- `pnpm lint`：零告警。
- `pnpm test`：6 文件 85 用例全绿（含 traditional-provider 14 用例 region header 覆盖）。
- `pnpm e2e`：3 用例全绿（含新增 microsoft 有 Key 划词 e2e，断言 `Ocp-Apim-Subscription-Key: test-ms-key` 与 `Ocp-Apim-Subscription-Region: eastus` 落到官方端点）。

## 实际改动文件

- `entrypoints/options/App.vue`：新增 region 输入框（microsoft && apiKey 非空时显示）。
- `e2e/mock-server.ts`：新增 microsoft `/translate` 路由 + `lastRequestHeaders`/`getLastRequestHeaders()`。
- `e2e/translate.spec.ts`：新增 microsoft 有 Key 划词 e2e 用例 + 导入 `getLastRequestHeaders`。
