# MEMORY — Issue #14 免 Key 翻译源 google/microsoft provider 实现与生效源切换契约

| 项 | 内容 |
|---|---|
| ISSUE_ID | #14 |
| 所属 PRD | #2 [v0.2-2] 免 Key 免费翻译源 builtin-fallback |
| 迭代版本 | v0.2 |
| 任务类型 | 后端研发任务（AI 处理） |
| 基础分支 | master |
| MR 基线策略 | base-branch（直接基于 master 创建 MR，无上游阻塞） |
| 并发安全等级 | parallel-safe |
| 上游依赖 | unified-adapter #10 已合并（TranslationProvider 接口与注册表已落地） |
| 下游消费方 | #4 source-picker-ui（属另一 PRD #4，本任务仅为其暴露 background 消息契约） |
| worktree | /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-14 |
| 文档目录 | releases/v0.2/14/ |

## PRD 摘要（#2 builtin-fallback，2026-07-02 语义修订版）

内置 Google + 微软翻译的免 Key 公共端点作为 provider，作为**用户可选的免费翻译源**，使用户即使没有 LLM API Key 也能开箱即用、直接划词翻译。本 PRD 依赖功能事项 1（unified-adapter #10）的 `TranslationProvider` 接口与注册表。

### 关键语义决策（与 PRD 原文「兜底源」偏差，以 #14 Issue 描述为准）

> 此语义已在 #2 PRD 顶部「2026-07-02 语义修订」区块同步修订，本任务遵循修订版。

- 本任务实现的是「用户可选的免费翻译源」，**不是「兜底源」**。
- **无隐式自动回退机制**：源失败时不自动切到其它源，仅返回明确错误提示，由用户人工切换。
- 全新安装、用户未做选择时，**默认选中 microsoft**（显式默认值，保证开箱即用），用户可随时切到 google / LLM。
- 端点内置为常量，**不可编辑**（免费源只能选择/切换或被自有源替换为生效项）。

## 验收要点（来自 #14）

1. google、microsoft 两个 provider 注册到适配层，出现在可用源列表。
2. 全新状态默认选中 microsoft，划词翻译返回译文。
3. 用户可通过 `setActiveSource` 切换生效源（切到 google / LLM）。
4. 免费源失败返回「源不可达/限流」可读提示。
5. host_permissions 已声明，background 可跨域请求。
6. 隐私声明已更新默认外传行为。

## 技术约束与代码现状

### 现有适配层（#10 已落地，复用）

- `shared/translator/types.ts` — `TranslationProvider` 接口：`{ id, type: 'llm'|'traditional', translate(req), test(req?) }`。
- `shared/translator/registry.ts` — `createProvider(config)` 按 category 路由：llm→`createLLMProvider`，traditional→`createTraditionalProvider`。`inferCategory(type)` 推断 google/microsoft→traditional。
- `shared/translator/index.ts` — `translateWithAdapter(req)`：读 `settings.activeProviderId` + `providers`，`providers.find(p => p.id === activeProviderId)`，无匹配返回 `no-config`。`testWithAdapter(config)` 直接创建 provider 调 test。
- `shared/translator/traditional-provider.ts` — **当前占位**：translate/test 返回 `unreachable`，本任务需替换为真实实现。
- `shared/translator/error.ts` — `classifyError(err, status?)`：429→rate-limit，>=400→unreachable，无 status→network。`errorTypeMessage` / `errorFeedback` 返回可读提示。
- `shared/translator/llm-provider.ts` — LLM provider 范式参考（fetch + classifyError + try/catch）。
- `shared/storage.ts` — `getProviders`/`setProviders`/`getSettings`/`setSettings`，`DEFAULT_SETTINGS.activeProviderId = null`。PROVIDERS_KEY='llm_translator:providers'，SETTINGS_KEY='llm_translator:settings'。
- `shared/types.ts` — `ProviderConfig{id,name,type,category?,baseUrl,apiKey?,model}`、`Settings{activeProviderId: string|null, defaultTargetLang}`、`Message` 联合类型（translate/test-provider/get-settings/get-providers）。
- `entrypoints/background.ts` — onMessage switch：translate/test-provider/get-settings/get-providers。**需新增 getActiveSources/setActiveSource 分支**。
- `wxt.config.ts` — `host_permissions: ['http://localhost/*','http://127.0.0.1/*']`，**需新增 google/microsoft 域名**。
- `knowledges/product-wiki/privacy/PRIVACY-POLICY.md` — 已提及「内置免 Key 兜底翻译源」但用「兜底」措辞，**需按修订语义更新为「用户可选的免费翻译源」+默认 microsoft**。

### 测试现状（需同步更新）

- `__tests__/adapter.test.ts` — 含「对传统 provider 配置测试 → unreachable 错误」，实现后需改为 mock fetch 测试真实翻译。
- `__tests__/registry.test.ts` — 含「传统 provider translate/test 返回 unreachable」，实现后需更新为 mock fetch。
- 测试约定：`vi.mock('@/shared/storage')` mock storage，`vi.stubGlobal('fetch', ...)` mock fetch。

## 依赖链元数据

- 并发安全等级：parallel-safe
- MR 基线策略：base-branch
- 上游 Issue/MR：无（#10 已合并）
- 推荐合并顺序：单任务，无顺序问题
- 依赖契约：复用 #10 的 TranslationProvider 接口与注册表；为本任务新增 background `getActiveSources`/`setActiveSource` 消息接口契约供 #4 消费

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| 免费源在可选列表的注册方式 | 定义 `BUILTIN_FREE_SOURCES` 常量（id `builtin:microsoft`/`builtin:google`），由 `getActiveSources` 合并 builtin + 存储的 providers 返回；不写入 storage | 端点内置不可编辑，无需持久化；fresh install 即可见；避免 install 时迁移写入 | 用户无法删除内置源（符合 PRD：免费源始终可选） | 删除 builtin-sources 模块，恢复 traditional-provider 占位 |
| 默认生效源实现 | `activeProviderId === null` 时解析为 `builtin:microsoft`（显式默认），不修改 DEFAULT_SETTINGS 写值 | PRD「显式默认值」语义；null→microsoft 是文档化的默认解析，非隐式回退；避免 install 时写 storage | null 不再返回 no-config，而是 microsoft（预期行为变更） | translateWithAdapter 恢复 null→no-config |
| translateWithAdapter 路由 | 先在 stored providers 查找，未命中再查 builtin free sources | builtin 源不在 storage，需单独查找路径 | 无 | 恢复仅查 stored providers |
| 免费源端点 URL | Google 用 `translate.googleapis.com/translate_a/single` 网页端点；Microsoft 用 Edge 翻译端点 `edge.microsoft.com/translate`（具体由实现时验证可达性确定） | PRD 授权研发实现时确定并验证可达性；均为非官方公共端点 | 端点可能限流/封禁/地域不可达（Google 大陆不可达）— 由错误归类与人工切换应对 | 端点为常量，可改常量值 |
| setActiveSource 实现 | 写 `settings.activeProviderId = id`（id 可为 builtin id 或 user provider id） | 复用现有 setSettings；与现有 activate 逻辑一致 | 无 | 恢复 settings 写入 |
| PRD 同步 | 本任务范围内可执行：更新 PRIVACY-POLICY.md 措辞；PRD.md 已在 sprint-open 阶段修订，本任务引用修订版 | #14 Issue 要求建议用 prodflow-prd revise 同步，PRD 顶部已含修订区块，隐私声明措辞需同步 | 无 | 恢复隐私声明旧措辞 |

## 实现关键信息（Step4 产出）

### 端点实现细节

- **Google**：`GET https://translate.googleapis.com/translate_a/single?client=gtx&sl=<src>&tl=<target>&dt=t&q=<text>`，响应嵌套数组 `data[0][i][0]` 为译文段，拼接得完整译文。sl 缺省 `auto`。
- **Microsoft**：两步——`GET https://edge.microsoft.com/translate/auth` 取 JWT token（text），再 `POST https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=<target>` 带 `Authorization: Bearer <token>`、body `[{"Text": text}]`，响应 `data[0].translations[0].text`。
- 两端点均为内置常量（`builtin-sources.ts`），不读 config.baseUrl。
- **语言名→代码映射**：上层 targetLang 为人类可读名（如「简体中文」「English」），`traditional-provider.ts` 内置 `LANG_NAME_TO_CODE` 映射为端点所需代码（zh-CN/zh-TW/en/ja/ko/fr/de/es），未命中回退 en。

### 改动文件清单

- 新增：`shared/translator/builtin-sources.ts`、`shared/translator/__tests__/builtin-sources.test.ts`
- 重写：`shared/translator/traditional-provider.ts`（占位→真实实现）
- 修改：`shared/types.ts`（Message+ActiveSourcesResult）、`shared/translator/index.ts`（默认解析+getActiveSources/setActiveSource）、`entrypoints/background.ts`（消息分支）、`wxt.config.ts`（host_permissions）、`knowledges/product-wiki/privacy/PRIVACY-POLICY.md`（措辞修订）
- 测试更新：`__tests__/registry.test.ts`、`__tests__/adapter.test.ts`

### 验证结果

- `pnpm test`：5 文件 71 测试全部通过（error 30 + registry 15 + adapter 10 + llm-provider 7 + builtin-sources 9）
- `pnpm typecheck`（vue-tsc）：无错误
- `pnpm lint`（eslint）：无错误
- `pnpm build`（wxt）：构建通过，manifest.json 含 google/microsoft host_permissions

### 注意事项（供下游 #4 消费）

- `getActiveSources` 返回 `{ sources: [...builtin, ...stored], activeSourceId }`，activeSourceId 为 null 时解析为 `builtin:microsoft`。
- `setActiveSource(id)` 写 settings.activeProviderId，id 可为 `builtin:microsoft`/`builtin:google` 或用户源 id。
- 内置源不可删除/编辑（始终在 sources 列表首位）。
- 免费源失败不自动回退，前端按 errorType 渲染错误提示。
