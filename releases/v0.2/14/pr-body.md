## 变更摘要

实现 Issue #14 免 Key 翻译源 google/microsoft provider 与生效源切换契约。在 unified-adapter #10 已落地的 `TranslationProvider` 接口之上，实现 google、microsoft 两个免 Key 免费 provider，注册到适配层作为用户可选源；实现默认选中 microsoft 的生效源逻辑与切换契约；声明 host_permissions；归类免费源失败错误；更新隐私声明。

**核心语义**：本任务实现的是「用户可选的免费翻译源」，不是「兜底源」；无隐式自动回退；全新安装默认选中 microsoft（显式默认值）；端点内置为常量不可编辑。

### 主要改动

- 新增 `shared/translator/builtin-sources.ts`：定义 `builtin:microsoft`/`builtin:google` 内置免费源与端点常量、`DEFAULT_ACTIVE_SOURCE_ID`、`getBuiltinSourceById`。
- 重写 `shared/translator/traditional-provider.ts`：实现 `callGoogle`（GET google 公共端点，解析嵌套数组响应）、`callMicrosoft`（auth token + POST 翻译端点）；失败经 `classifyError` 归类。
- 修改 `shared/translator/index.ts`：`translateWithAdapter` 支持 `activeProviderId === null` 解析默认 `builtin:microsoft`（显式默认值，非隐式回退）；新增 `getActiveSources`/`setActiveSource` 供 #4 消费。
- 修改 `entrypoints/background.ts`：新增 `get-active-sources`/`set-active-source` 消息分支。
- 修改 `wxt.config.ts`：声明 google/microsoft host_permissions。
- 修改 `shared/types.ts`：Message 新增两个分支、新增 `ActiveSourcesResult` 接口。
- 更新隐私声明：将「兜底」措辞修订为「用户可选的免费翻译源」，明示默认 microsoft 外传行为。

### 影响面

- 全新安装默认选中 microsoft，划词翻译开箱即用（无需配置）。已配置 LLM 源的用户行为不退化。
- 为下游 #4（source-picker-ui）暴露 `getActiveSources`/`setActiveSource` 消息契约。
- 免费源端点为非官方公共端点，可能限流/封禁/地域不可达，失败返回错误提示由用户人工切换，不自动回退。

### 回滚方案

删除 `builtin-sources.ts`，恢复 `traditional-provider.ts` 占位、`index.ts` 路由、`background.ts` 分支、`types.ts` Message、`wxt.config.ts` host_permissions、隐私声明。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #2 https://github.com/Aiden-FE/llm-translator/issues/2 |
| PRD 文档 | `knowledges/product-wiki/releases/v0.2/2-builtin-fallback/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 (https://github.com/Aiden-FE/llm-translator/milestone/1) |
| DESIGN | `releases/v0.2/14/DESIGN.md` |
| PLAN | `releases/v0.2/14/PLAN.md` |
| CHANGELOG | `releases/v0.2/14/CHANGELOG.md` |
| 验收标准 | 见 PRD §Solution / sprint-index 验收标准章节 |
| 知识沉淀 | context: 无; adr: 无; feature: 更新 knowledges/feature/translator/unified-adapter.md(传统 provider 占位→免 Key 实现,新增生效源切换契约); runbook: 无 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无（#10 unified-adapter 已合并） |
| 基线分支 | master |
| 推荐合并顺序 | 单任务，无顺序问题 |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 复用 #10 的 TranslationProvider 接口与注册表；新增 background getActiveSources/setActiveSource 消息契约供 #4 消费 |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
