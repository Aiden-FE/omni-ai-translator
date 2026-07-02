# MEMORY — Issue #16 翻译源管理配置页 UI 改造

| 项 | 内容 |
|---|---|
| ISSUE_ID | #16 |
| 所属 PRD | #4（source-picker-ui） |
| 迭代版本 | v0.2 |
| 仓库 | Aiden-FE/llm-translator |
| 基础分支 | master |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch（直接从 master 建 PR，无 stacked） |
| 上游依赖 | 无（#10/#14 已合并就绪；PRD #3 后端能力为后续端到端验收依赖，不阻塞本任务） |
| 任务 worktree | /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-16 |

## PRD 摘要

把 v0.1 仅面向 LLM 的配置页（`entrypoints/options/App.vue`）升级为多类源（LLM、传统 API Key、免 Key 兜底）统一管理界面：
1. 分区标题「LLM 提供方」→「翻译源管理」，移除「本插件不内置任何模型接口」旧提示，改为兜底关系说明。
2. 源类型下拉扩展为 4 项：openai-compatible / ollama / google / microsoft，按类型条件渲染字段（LLM 显示 name/baseUrl/model/apiKey；传统源显示 name/baseUrl/apiKey，不显示 model）。
3. apiKey placeholder 明示「留空使用免 Key 兜底；填入则走官方 API」语义。
4. 顶部新增「当前生效源」提示行：切换到新契约 `get-active-sources` / `set-active-source` 读写，区分自配源与兜底源；兜底生效时明示「免 Key 兜底（文本外传到 Google/微软）」+ 隐私提示 + 引导配置自有源。
5. 连通性测试扩展：对 LLM、传统 API Key、免 Key 兜底源均生效，复用 `test-provider` 通道，结果 inline 展示（✅ 译文 / ❌ 错误）。
6. 启用任一自有源后，生效源提示行切换为该自有源，兜底提示消失。

不包含：传统 API Key 源「有 Key 走官方 API」后端实现（PRD #3）、多源拖拽排序、源用量统计、popup 切源。

## 后端契约通道（已就绪，来自 #10/#14）

- `get-active-sources` → `getActiveSources()` 返回 `{ sources: [...BUILTIN_FREE_SOURCES, ...providers], activeSourceId }`；`activeSourceId = settings.activeProviderId ?? 'builtin:microsoft'`。
- `set-active-source` → `setActiveSource(id)` 写入 `settings.activeProviderId`（read-merge，不校验 id 存在性）。
- `test-provider` → `testWithAdapter(config)` = `createProvider(config).test()`，对任意类型源生效。
- `entrypoints/background.ts` 已 wire 全部 6 个消息类型（translate/test-provider/get-settings/get-providers/get-active-sources/set-active-source）。

## 关键代码现状

- `BUILTIN_FREE_SOURCES`（`shared/translator/builtin-sources.ts`）：
  - `builtin:microsoft`（微软翻译免费，type=microsoft，category=traditional，model=''，baseUrl=MICROSOFT_TRANSLATE_ENDPOINT）
  - `builtin:google`（Google 翻译免费，type=google，category=traditional，model=''，baseUrl=GOOGLE_ENDPOINT）
  - `DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft'`（fresh install 默认生效）
- `createTraditionalProvider`（`shared/translator/traditional-provider.ts`）**忽略 config.baseUrl 与 config.apiKey**，直接用内置免 Key 端点常量（callGoogle/callMicrosoft）。即传统源卡片 baseUrl/apiKey 字段当前为 UI 信息展示，「有 Key 走官方 API」属 PRD #3 后端范围（未实现）。
- `createLLMProvider`：openai-compatible 走 `Authorization: Bearer <apiKey>`（apiKey 可空）；ollama 不带 auth；test() = translate({text:'hello',targetLang:'中文'})。
- 现有 `App.vue`：单 shared `testMsg` ref（底部一条消息）；`activate()` 经 `setSettings` 写 activeProviderId；`save()` 同时写 providers + settings。
- 类型：`ProviderType = 'openai-compatible'|'ollama'|'google'|'microsoft'`；`ProviderCategory = 'llm'|'traditional'`；`inferCategory` 按 type 推断。
- 路径别名：`@/*` → `./*`（tsconfig + vitest + wxt 一致）。

## e2e 回归选择器（必须保持不变）

`e2e/translate.spec.ts` 依赖以下选择器，改动 App.vue 时不得破坏：
- `getByRole('button', { name: '+ 添加提供方' })` → 添加按钮文案保持「+ 添加提供方」
- `.provider-card` class → 卡片容器保留
- `input[placeholder="名称"]` → 名称输入框 placeholder 保持「名称」
- `getByTestId('base-url')` → baseUrl 输入框保留 `data-testid="base-url"`
- `input[placeholder="模型名"]` → 模型输入框 placeholder 保持「模型名」（LLM 类型显示）
- `getByRole('button', { name: '启用' })` → 启用按钮文案「启用」/「已启用」
- `getByPlaceholder('留空则使用浏览器首选语言')` → 默认目标语言 placeholder

## 自动决策记录（无人值守默认决策）

1. **添加按钮文案**：保持「+ 添加提供方」不改「+ 添加翻译源」。依据：e2e 依赖该文案，Issue/PRD 未要求改添加按钮文案；最小改动、可回归。回滚：改文案+同步 e2e。
2. **生效源提示行读契约**：用 `get-active-sources` 读取 `{sources, activeSourceId}`，不再直接读 `settings.activeProviderId`。依据：Issue 明确要求切换到新契约。回滚：改回 getSettings。
3. **切换生效源写契约**：`activate(id)` 改用 `set-active-source` 消息，不再 `setSettings({activeProviderId})`。targetLang 保存改为 read-merge `setSettings({...await getSettings(), defaultTargetLang})` 避免覆盖 activeProviderId。依据：Issue 要求新契约读写 + 避免与 set-active-source 竞争。回滚：恢复 save 合并写。
4. **「已启用」按钮可点回兜底**：点击已激活自有源的「已启用」按钮 → 调 `set-active-source('builtin:microsoft')` 回到兜底。依据：避免「启用自有源后无法回到兜底」死路；最小 UI（无新增元素）。回滚：移除 toggle 逻辑。
5. **兜底态横幅内置源测试按钮**：兜底生效时横幅显示「测试连通」按钮，对当前生效的内置源（builtin:microsoft/google）发 `test-provider`，结果 inline 展示。依据：验收要求「免 Key 兜底源」连通性测试生效，而内置源无卡片。回滚：移除横幅测试按钮。
6. **传统源 baseUrl 默认值**：google→`https://translation.googleapis.com`，microsoft→`https://api.cognitive.microsofttranslator.com/translate`（信息展示，后端当前忽略，PRD #3 将启用）。placeholder 标注「默认官方端点，可改」。依据：PRD「baseUrl 默认官方端点，可改」+ 原型值。回滚：改默认值。
7. **传统源 apiKey placeholder**：统一「留空使用免 Key 兜底；填入则走官方 API」。LLM 源保持「API Key（Ollama 可留空）」。依据：Issue 明示。
8. **隐私提示对比度**：兜底态隐私说明文字用 `#4b5563`（gray-600，在 `#f3f4f6` 底上对比度≈6.9:1，满足 WCAG AA 正文），不用原型 `#6b7280`（≈4.16:1，不达 AA 正文）。状态用文字+`data-state` 语义标签，非纯颜色。依据：验收 WCAG AA + 非颜色依赖。
9. **每卡 inline 测试结果**：`testMsg` 由单 ref 改为 `Record<id,string>`，每卡独立展示。横幅测试结果单独 ref。依据：Issue 要求 inline 展示 + 原型每卡一条。回滚：恢复单 ref。
10. **v0.1 向后兼容**：既有 `activeProviderId`（用户 provider id）经 `getActiveSources` 在 providers 列表命中，无数据迁移；既有 LLM 配置卡片可见可编辑。依据：Issue 静默兼容要求。

## 风险

- 传统源「有 Key 走官方 API」后端未实现（PRD #3）：本轮传统源测试实际走免 Key 端点（createTraditionalProvider 忽略 apiKey/baseUrl）。UI 已就绪，验收以 UI 就绪为准。
- e2e 不在本轮必跑（需 playwright install + 浏览器），但须保证 typecheck + build 通过、选择器不破坏。
