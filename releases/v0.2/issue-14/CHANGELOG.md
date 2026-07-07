# CHANGELOG — Issue #14 免 Key 翻译源 google/microsoft provider 实现与生效源切换契约

| 项 | 内容 |
|---|---|
| ISSUE_ID | #14 |
| 所属 PRD | #2 |
| 迭代版本 | v0.2 |
| 关联 Issue | #14、#2 |

## 新增功能

- **google/microsoft 免 Key 免费 provider 实现**：在 unified-adapter #10 的 `TranslationProvider` 接口上实现真实的 Google 翻译、微软翻译 provider，替换原占位（unreachable）。
  - Google：调用 `translate.googleapis.com/translate_a/single` 免 Key 公共端点，解析嵌套数组响应。
  - Microsoft：经 `edge.microsoft.com/translate/auth` 取 token，调用 `api.cognitive.microsofttranslator.com/translate` 翻译端点。
  - 端点为内置常量，不可由用户编辑。
- **内置免费源注册**：新增 `shared/translator/builtin-sources.ts`，定义 `builtin:microsoft` / `builtin:google` 两个内置免费源，注册到适配层并出现在可用源列表（`getActiveSources` 合并返回）。
- **默认生效源逻辑**：全新安装、用户未做选择时默认选中 `builtin:microsoft`（显式默认值，保证开箱即用）。`translateWithAdapter` 在 `activeProviderId === null` 时解析为默认 microsoft。**无隐式自动回退**。
- **生效源切换契约**：background 暴露 `get-active-sources` / `set-active-source` 两个消息接口供下游 #4 配置页消费。
  - `getActiveSources` 返回 `{ sources: [...builtin, ...stored], activeSourceId }`。
  - `setActiveSource(id)` 写入 `settings.activeProviderId`，id 可为内置源或用户源。
- **host_permissions 声明**：`wxt.config.ts` 新增 `translate.googleapis.com` / `edge.microsoft.com` / `api.cognitive.microsofttranslator.com` 三个域名，确保 background 可跨域请求。
- **语言名→代码映射**：traditional-provider 内置 `LANG_NAME_TO_CODE`，将人类可读语言名（如「简体中文」）映射为端点所需语言代码（zh-CN/en/ja 等）。

## API 变更（API Changes）

- `shared/types.ts` `Message` 联合类型新增两个分支：`get-active-sources`、`set-active-source`（payload `{ id: string }`）。
- `shared/types.ts` 新增 `ActiveSourcesResult` 接口（`{ sources: ProviderConfig[]; activeSourceId: string }`）。
- `shared/translator/index.ts` 新增导出 `getActiveSources()` / `setActiveSource(id)`。
- `shared/translator/builtin-sources.ts` 新增导出 `DEFAULT_ACTIVE_SOURCE_ID` / `BUILTIN_FREE_SOURCES` / `getBuiltinSourceById` / `isBuiltinSourceId` 及端点常量。

## 行为变更

- `translateWithAdapter`：`activeProviderId === null` 不再返回 `no-config`，而是解析为默认 `builtin:microsoft` 路由翻译（fresh install 开箱即用）。仅当 `activeProviderId` 指向既不在 stored providers 也不在内置源的非空 id 时才返回 `no-config`。
- `traditional-provider.ts`：`createTraditionalProvider` 的 `translate`/`test` 从返回 `unreachable` 占位改为调用真实端点。

## Bug 修复

无。

## 破坏性变更

无破坏性变更。已配置 LLM 源的用户 `activeProviderId` 不变，行为不退化。

## 隐私声明更新

- `knowledges/product-wiki/privacy/PRIVACY-POLICY.md` 将「兜底翻译源」措辞修订为「用户可选的免费翻译源」。
- 明示全新安装默认选中微软翻译（显式默认值，非隐式回退），文本默认外传给微软。
- 第三方服务表、用户权利、变更记录同步更新。

## 部署注意事项

- 免费源端点为非官方公共端点，可能限流/封禁/地域不可达（Google 翻译在中国大陆不可达），失败时返回 `unreachable`/`rate-limit` 错误提示，由用户人工切换，不自动回退。
- 端点确切可达性建议在目标用户环境实测验证。
- 下游 #4（source-picker-ui）实现时注意 `setActiveSource` 不校验 id 存在性（由调用方保证），以及内置源 `baseUrl` 字段仅作展示、不可编辑。

## 测试

- 单元测试 5 文件 71 用例全部通过（新增 builtin-sources.test.ts 9 用例；更新 registry.test.ts / adapter.test.ts 适配真实 provider 行为）。
- typecheck（vue-tsc）、lint（eslint）、build（wxt）均无错误。
