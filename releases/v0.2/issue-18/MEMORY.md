# MEMORY — #18 传统翻译源 有 Key 走官方 API 调用

| 项 | 内容 |
|---|---|
| 任务 Issue | #18（https://github.com/Aiden-FE/llm-translator/issues/18） |
| PRD Issue | #3（https://github.com/Aiden-FE/llm-translator/issues/3） |
| 迭代版本 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环（milestone/1，截止 2026-07-22） |
| 基础分支 | master |
| 任务 worktree | /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-18 |
| 任务分支 | issue-18 |
| 标签 | AI、后端 |
| 执行模式 | 无人值守（按 prodflow-worker 默认决策策略自动推进并留痕） |

## PRD 摘要（功能事项 3 traditional-apikey-config）

配置页支持用户为传统翻译源（Google/微软）填入自有 API Key 与端点，启用后覆盖免 Key 兜底，走官方 API（额度与稳定性有保障）。复用功能事项 1 的 TranslationProvider 接口与功能事项 2 的 google/microsoft provider 实现，区别在于：免 Key 兜底用内置公共端点，本任务让用户填自有官方 API Key + 端点走官方 API。

关键约束：
- 用户 Key 仅存 chrome.storage.local，不上传、不入日志、不入错误上报、不入 commit。
- 有 Key 与无 Key 走不同端点，provider 按 apiKey 是否存在切换调用方式。
- region 字段为可选新增，向后兼容，缺省不影响既有配置读取。

## 依赖链元数据（来自协调器上下文 + Issue #18）

- 并发安全等级：parallel-safe（改 shared/types.ts + traditional-provider.ts，与已合并 #14/#16 无代码冲突；region 可选新增）
- MR 基线策略：base-branch（无上游依赖，可直接从 master 创建 MR）
- 上游 Issue/MR：无
- 下游依赖：#19 前端任务依赖本任务（消费 ProviderConfig.region 字段与官方 Key 调用行为）
- 推荐合并顺序：本任务 #18 先于 #19 合并
- 是否 stacked MR：否
- 当前允许 base 分支：master
- 依赖契约/接口文档：PRD 文档 releases/v0.2/3-traditional-apikey-config/PRD.md

## 现状代码关键信息

### shared/types.ts — ProviderConfig（line 13-23）
当前字段：id、name、type、category?、baseUrl、apiKey?、model。本任务新增可选 `region?: string`（供 microsoft Azure 携带 Ocp-Apim-Subscription-Region；google 不使用）。

### shared/translator/traditional-provider.ts — createTraditionalProvider（line 142）
- 当前实现：始终用 builtin-sources.ts 常量端点（GOOGLE_ENDPOINT / MICROSOFT_AUTH_ENDPOINT / MICROSOFT_TRANSLATE_ENDPOINT），忽略 config.baseUrl。
- callGoogle（line 45）：GET translate_a/single?client=gtx 免 Key 公共端点，解析嵌套数组。
- callMicrosoft（line 81）：先 GET edge auth 取 JWT token，再 POST 认知服务端点带 Bearer token。
- test()（line 165）：委托 translate，默认请求 {text:'hello', targetLang:'中文'}。
- 错误经 classifyError（error.ts）归一化为 network/rate-limit/unreachable。

### 端点常量（builtin-sources.ts）
- GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'（免 Key，GET）
- MICROSOFT_AUTH_ENDPOINT = 'https://edge.microsoft.com/translate/auth'
- MICROSOFT_TRANSLATE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate'

### options.vue 用户创建传统源的 baseUrl 默认值
- google: 'https://translation.googleapis.com'（host，不含路径）
- microsoft: 'https://api.cognitive.microsofttranslator.com/translate'（含 /translate 路径）
- 注释明示：「后端当前忽略，PRD #3 启用『有 Key 走官方 API』时生效」——本任务即令其生效。

### 代码库 baseUrl 约定
LLM provider 将 baseUrl 视为完整端点路径（不追加 path）。microsoft 默认 baseUrl 已含 /translate 路径，可直接用；google 默认 baseUrl 仅 host，官方 v2 需追加 /language/translate/v2。

### 测试模式
- vitest，vi.stubGlobal('fetch', vi.fn().mockImplementation / mockResolvedValue)
- 现有测试：llm-provider.test.ts、adapter.test.ts、registry.test.ts、builtin-sources.test.ts、error.test.ts
- 无 traditional-provider 专属测试文件，本任务需新建 shared/translator/__tests__/traditional-provider.test.ts

## 官方 API 端点（设计依据）

- Google Translation API v2（简单 Key）：POST `https://translation.googleapis.com/language/translate/v2?key=<API_KEY>`，body `{q, source?, target, format}`，响应 `{data:{translations:[{translatedText}]}}`。也可用 `X-goog-api-key` header。
- Microsoft Azure Translator（资源 Key）：POST `<endpoint>/translate?api-version=3.0&to=<target>`，headers `Ocp-Apim-Subscription-Key: <key>` + `Ocp-Apim-Subscription-Region: <region>`，body `[{Text}]`，响应 `[{translations:[{text,to}]}]`。

## 自动决策记录（无人值守留痕）

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| region 字段位置 | ProviderConfig 新增可选 `region?: string` | Issue #18 + 协调器 DESIGN 决议方案 A | 低，可选字段向后兼容 | 删除字段 |
| google 官方端点构造 | baseUrl 去尾斜杠后追加 `/language/translate/v2`（若已含该路径则不重复追加），用 `?key=` 传 Key | 默认 baseUrl 为 host，需追加 v2 标准路径；guard 防重复追加 | 用户自定义 baseUrl 已含 v2 路径时仍正确 | 恢复免 Key 分支 |
| microsoft 官方端点构造 | baseUrl 直接用（已含 /translate），追加 `?api-version=3.0&to=`，headers 带 Ocp-Apim-Subscription-Key + Ocp-Apim-Subscription-Region: config.region | 默认 baseUrl 已含 /translate 路径，与现有免 Key 端点结构一致 | region 缺省时不发送 Region header（部分全局资源可省略） | 恢复免 Key 分支 |
| 有/无 Key 切换点 | `config.apiKey` 非空 → 官方 Key 端点；空 → 现有免 Key 公共端点（不变） | Issue #18 明确「按 apiKey 是否存在切换」 | 无 | 移除分支 |
| Key/region 安全 | 仅存本地，不入日志/错误/commit | PRD + Issue 硬性要求 | 无 | — |
| 测试覆盖 | 新建 traditional-provider.test.ts，覆盖有 Key/无 Key 两条路径（microsoft 有 Key 含 region header 校验） | Issue #18 验收要点 | 无 | — |

## 知识检索

已直接读取相关项目知识：knowledges/feature/translator/unified-adapter.md（统一适配层）、knowledges/context/development/coding-standard.md、PRD 文档。项目知识库已初始化。
