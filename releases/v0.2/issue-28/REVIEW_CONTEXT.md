# fix(#28): LLM 源下拉分组为 LLM 接口配置/传统翻译并去除云端本地后缀

## 变更摘要

配置页源类型下拉（`entrypoints/options/App.vue`）由 4 个平铺 option 改为 `<optgroup>` 分组：
- 「LLM 接口配置」组：OpenAI 兼容（openai-compatible）、Ollama（ollama）
- 「传统翻译」组：Google 翻译（google）、微软翻译（microsoft）

去除误导性的「（云端）」「（本地）」部署后缀，使 LLM 类源归入统一类目。option 的 value 全部保持不变，`onTypeChange` 逻辑零改动。

## 影响面

- 仅 `entrypoints/options/App.vue` template 内 select 结构（约 291-307 行），1 file changed, 16 insertions(+), 12 deletions(-)。
- 不涉及 script 逻辑、类型定义、存储、消息通道。
- 类型检查（vue-tsc --noEmit）通过。

## 回滚方案

还原为平铺 option 即可（4 个 option 去掉 optgroup 包裹，文案还原为带后缀版本）。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #4（source-picker-ui）、#6（llm-anthropic-style） |
| PRD 文档 | `knowledges/product-wiki/releases/v0.2/4-source-picker-ui/PRD.md`、`knowledges/product-wiki/releases/v0.2/5-llm-anthropic-style/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| DESIGN | `releases/v0.2/issue-28/DESIGN.md` |
| PLAN | `releases/v0.2/issue-28/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-28/CHANGELOG.md` |
| 验收标准 | 见 `releases/v0.2/issue-28/PRD.md` §3 验收标准 |
| UX 规范 | `knowledges/ux/design-system.md`、`knowledges/ux/accessibility.md`、`knowledges/ux/interaction-patterns.md` |
| 视觉原型 | `knowledges/ux/prototypes/v0.2-source-picker.html`（PRD #4 配置页原型） |
| 知识沉淀 | 跳过（改动<20 行，纯 UI 修复，PRD #30 将重做配置 UI 分类） |
| 并发安全等级 | ordered |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无（与 #27 非代码依赖，改区不重叠：#27 改 anchor/约 257 行与新增 method/约 120 行，本任务改 select/291-307 行） |
| 基线分支 | master |
| 推荐合并顺序 | #27（PR #33）先于 #28 合并 |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 无 |

Closes #28
