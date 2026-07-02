# CHANGELOG — #18 传统翻译源 有 Key 走官方 API 调用（后端）

| 项 | 内容 |
|---|---|
| 关联 Issue | #18 |
| 关联 PRD | #3 功能事项 3 |
| 迭代版本 | v0.2 |
| 变更类型 | feat（新增功能，向后兼容） |

## 新增功能

- **ProviderConfig 新增可选 `region?: string` 字段**（`shared/types.ts`）：供 microsoft Azure Translator 在有 Key 时携带 `Ocp-Apim-Subscription-Region` header；google 不使用。字段可选，缺省不影响既有配置读取，向后兼容。
- **传统翻译源有 Key 走官方 API 端点**（`shared/translator/traditional-provider.ts`）：provider 按 `config.apiKey` 是否存在切换调用方式：
  - 有 Key → google 走官方 v2 端点（`<baseUrl>/language/translate/v2?key=<apiKey>`，POST `{q,target,source?,format}`）；microsoft 走官方 Key 端点（`<baseUrl>?api-version=3.0&to=`，headers `Ocp-Apim-Subscription-Key` + `Ocp-Apim-Subscription-Region`（region 非空才发），不走 edge auth）。
  - 无 Key → 维持现有免 Key 公共端点逻辑（builtin-sources.ts 常量端点），行为完全不变。
- **连通性测试天然覆盖**：现有 `test()` 委托 `translate`，有/无 Key 两条路径均可经连通性测试验证。

## Bug 修复

无。

## API 变更

- `ProviderConfig` 新增可选字段 `region?: string`（非破坏性，向后兼容）。
- `createTraditionalProvider` 行为扩展：有 `apiKey` 时读 `config.baseUrl` 走官方端点；无 `apiKey` 时行为不变。

## 破坏性变更

无。region 为可选新增字段；无 Key 路径与既有 LLM 配置均不受影响。

## 部署注意事项

- 无需数据迁移：region 字段可选，既有存储的 `ProviderConfig` 无需变更即可读取。
- Key / region 仅存 `chrome.storage.local`，不入日志、错误上报、commit。
- microsoft region 为纯空白时 trim 后不发送 Region header（防御无效值）。
- 前端 region 输入框 UI 与有 Key 联调由后续任务 #19 负责。

## 测试

- 新建 `shared/translator/__tests__/traditional-provider.test.ts`，14 个用例覆盖：
  - google 有/无 Key（v2 端点 URL/body 校验、防重复追加路径、免 Key 端点解析）
  - microsoft 有/无 Key（含 region header 校验、region 缺省/纯空白不发 header、不走 auth、auth+translate 两步）
  - 错误归一化：429→rate-limit、500→unreachable、fetch TypeError→network（有/无 Key 路径）
  - test() 委托 translate、未知类型 unreachable
- 全量 `pnpm test`：85 项全绿；`pnpm typecheck`：零错误；`pnpm lint`：零告警。
