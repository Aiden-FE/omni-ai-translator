# DESIGN — #18 传统翻译源 有 Key 走官方 API 调用（后端）

| 项 | 内容 |
|---|---|
| 文档类型 | 技术设计文档 |
| 状态 | approved（无人值守自动批准，依据 Issue #18 + 协调器 DESIGN 决议方案 A） |
| 关联 Issue | #18 |
| 关联 PRD | #3 功能事项 3 |

## 1. 背景与目标

现有 `createTraditionalProvider`（shared/translator/traditional-provider.ts:142）始终使用 builtin-sources.ts 的免 Key 公共端点常量，忽略 `config.baseUrl` 与 `config.apiKey`。本任务令其在用户填入官方 API Key 时切换到官方 Key 鉴权端点，并新增可选 `region` 字段供 microsoft Azure Translator 携带 `Ocp-Apim-Subscription-Region`。无 Key 时行为完全不变，保证向后兼容。

## 2. 技术选型与理由

在 provider 内部按 `config.apiKey` 是否非空分支：有 Key 走官方端点（读 `config.baseUrl`），无 Key 走现有免 Key 公共端点常量。不新增 provider 类型、不拆分文件，复用现有 `classifyError` 错误归一化与 `test()` 委托 translate 的连通性测试机制。

理由：改动最小、可测试、可回滚；region 为可选新增字段，对 #19 前端与既有 LLM 配置零侵入。

## 3. 方案对比（无人值守自动批准记录）

### 方案 A（推荐，采用）：provider 内按 apiKey 分支，region 作为 ProviderConfig 可选字段

- 实现：`createTraditionalProvider` 内判断 `config.apiKey` 非空 → 调官方端点；空 → 调免 Key 端点。microsoft 有 Key 时带 `Ocp-Apim-Subscription-Key` + `Ocp-Apim-Subscription-Region`。
- 优点：改动集中在单文件 + types 一字段；向后兼容；region 缺省可省略 Region header。
- 缺点：provider 内分支增多，但逻辑清晰。
- 回滚：移除分支与字段即可恢复。

### 方案 B：为有 Key 场景新增独立 provider 工厂（createOfficialTraditionalProvider）

- 实现：registry 按 apiKey 是否存在路由到不同工厂。
- 优点：职责分离。
- 缺点：改动面大（registry + 新文件 + 测试），超出「最小改动」原则；region 字段仍需在 ProviderConfig。
- 不采用原因：过度设计，#18 范围内方案 A 已满足且更易回滚。

### 方案 C：仅扩展 callGoogle/callMicrosoft 入参，不改类型

- 实现：把 apiKey/region 作为调用参数透传，不加 ProviderConfig.region。
- 缺点：region 无处承载，#19 无法消费；违背协调器 DESIGN 决议方案 A。
- 不采用原因：不符合依赖契约。

**最终选择：方案 A。**

## 4. 数据结构 / 模型变更

### shared/types.ts — ProviderConfig

新增可选字段：

```ts
/** microsoft Azure Translator 区域（如 eastus、global）；有 Key 时携带 Ocp-Apim-Subscription-Region。google 不使用。缺省则不发送该 header。 */
region?: string;
```

向后兼容：既有配置无 region 字段可正常读取（可选字段）。

## 5. 接口设计

### 5.1 google 有 Key 调用（callGoogleWithKey）

- 端点：`config.baseUrl` 去尾斜杠，若未以 `/language/translate/v2` 结尾则追加该路径；附加 `?key=<encodeURIComponent(apiKey)>`。
- 方法：POST，header `Content-Type: application/json`。
- body：`{ q: [text], target: langCode, source?: langCode, format: 'text' }`。
- 响应：`{ data: { translations: [{ translatedText }] } }`，取 `data.translations[0].translatedText`。
- 失败：HTTP 非 ok 经 `classifyError(null, status)` 归类，error 文案含状态码与响应体（不含 Key）。

### 5.2 microsoft 有 Key 调用（callMicrosoftWithKey）

- 端点：`config.baseUrl`（已含 /translate 路径），附加 `?api-version=3.0&to=<langCode>`（有 sourceLang 时加 `&from=`）。
- 方法：POST，headers：
  - `Ocp-Apim-Subscription-Key: <apiKey>`
  - `Ocp-Apim-Subscription-Region: <config.region>`（仅当 config.region 非空时发送）
  - `Content-Type: application/json`
- body：`[{ Text: text }]`。
- 响应：`[{ translations: [{ text, to }] }]`，取 `[0].translations[0].text`。
- 失败：经 `classifyError` 归类。
- 注：有 Key 时不再走 edge auth 取 JWT token（官方 Key 鉴权无需 token）。

### 5.3 无 Key 调用（不变）

沿用现有 `callGoogle` / `callMicrosoft`（builtin-sources.ts 常量端点 + 免 Key 鉴权）。

### 5.4 切换逻辑

```ts
if (config.type === 'google') {
  return config.apiKey ? callGoogleWithKey(config, req) : callGoogle(req);
}
if (config.type === 'microsoft') {
  return config.apiKey ? callMicrosoftWithKey(config, req) : callMicrosoft(req);
}
```

`test()` 不变（委托 translate）。

## 6. 兼容性与风险评估

| 项 | 评估 |
|---|---|
| 向后兼容 | region 可选新增；无 Key 路径完全不变；既有 LLM 配置与 builtin 源不受影响 |
| 与 #14/#16 冲突 | 无（已合并，本任务改 shared/types.ts + traditional-provider.ts，无交集） |
| 与 #19 协作 | region 字段为 #19 提供消费契约；本任务不碰前端 UI |
| 安全 | Key/region 不入日志/错误上报/commit；error 文案仅含 HTTP 状态码与响应体，不含 Key |
| 回滚 | 移除 apiKey 分支与 region 字段即恢复 |

## 7. 测试设计

新建 `shared/translator/__tests__/traditional-provider.test.ts`：

- google 无 Key：走免 Key 公共端点，验证请求 URL 含 `translate_a/single`，返回嵌套数组解析正确。
- google 有 Key：走官方 v2 端点，验证请求 URL 含 `/language/translate/v2?key=`、POST body 含 target，响应 `data.translations[0].translatedText` 解析正确。
- microsoft 无 Key：走 edge auth + translate 两步，验证 Bearer token 流程。
- microsoft 有 Key：验证 headers 含 `Ocp-Apim-Subscription-Key` 与 `Ocp-Apim-Subscription-Region: <region>`、不再请求 auth 端点、响应解析正确。
- microsoft 有 Key 但 region 缺省：验证不发送 Region header。
- 错误归一化：429 → rate-limit、500 → unreachable、fetch TypeError → network（有 Key 与无 Key 各覆盖）。
