# CHANGELOG — #19 传统 API Key 源 有 Key 场景前端联调与回归

| 项 | 内容 |
|---|---|
| 关联 Issue | #19 |
| 关联 PRD | #3 功能事项 3 |
| 迭代版本 | v0.2 |
| 变更类型 | feat（前端联调，向后兼容） |

## 新增功能

- **配置页 microsoft 有 Key 场景新增 region 输入框**（`entrypoints/options/App.vue`）：当源类型为 microsoft 且已填入 API Key 时显示 region 输入框，placeholder「Azure 区域，如 eastus」，消费 #18 交付的 `ProviderConfig.region` 字段；无 Key 或非 microsoft 源不显示。region 经现有 `saveProviders` → `chrome.storage.local` 链路持久化，与 baseUrl/apiKey 同存储。
- **microsoft 有 Key 端到端联调验证**（`e2e/translate.spec.ts` + `e2e/mock-server.ts`）：新增 microsoft 有 Key 划词 e2e 用例，验证填入 Key + region 启用后划词翻译落到官方端点，并断言请求携带 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region: eastus` header。

## Bug 修复

无。

## API 变更

无。`ProviderConfig.region` 字段由 #18 新增（可选），本任务仅在前端消费，不改类型与消息通道。

## 破坏性变更

无。region 输入框为条件渲染新增项；既有配置（无 region）正常读取；无 Key 路径与 LLM 配置不受影响。

## 部署注意事项

- 无需数据迁移：region 可选字段，既有存储配置无需变更。
- Key / region 仅存 `chrome.storage.local`，不上传第三方、不入日志/错误上报/commit（后端 #18 已确保错误文案不含 Key/region）。
- apiKey 输入框 `type="password"` 掩码（既有）；region 为公开 Azure 区域值，普通文本输入（非凭证，无需掩码）。
- baseUrl 默认值与后端官方端点语义一致（google host → 后端追加 `/language/translate/v2`；microsoft 含 `/translate` → 后端原样用 + `?params`），无需修改。

## 测试

- `pnpm typecheck`：零错误。
- `pnpm lint`：零告警。
- `pnpm test`：6 文件 85 用例全绿（含 traditional-provider 14 用例 region header 覆盖，#18 交付）。
- `pnpm e2e`：3 用例全绿（既有 2 个 LLM e2e + 新增 microsoft 有 Key 划词 e2e，验证官方端点落点与 Key/region header 携带）。
