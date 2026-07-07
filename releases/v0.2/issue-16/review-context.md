## 变更摘要

把 v0.1 仅面向 LLM 的配置页（`entrypoints/options/App.vue`）升级为多类源（LLM、传统 API Key、免 Key 兜底）统一管理界面：

- 分区标题「LLM 提供方」→「翻译源管理」，移除旧「本插件不内置任何模型接口」提示，改为兜底关系说明。
- 源类型下拉扩展为 4 项（openai-compatible / ollama / google / microsoft），按类型条件渲染字段（LLM 显示 model，传统源不显示 model）。
- 顶部新增「当前生效源」提示行，经新契约 `get-active-sources` / `set-active-source` 读写：兜底态明示「免 Key 兜底（文本外传到 Google/微软）」+ 隐私提示 + 引导 + 测试连通；启用自有源后切换为该源名称。
- 连通性测试扩展：对 LLM、传统 API Key、免 Key 兜底源均生效，复用 `test-provider` 通道，结果 inline 展示（✅ 译文 / ❌ 错误，每卡独立）。
- apiKey placeholder 明示「留空使用免 Key 兜底；填入则走官方 API」。
- 可访问性：生效源提示行用文字 + `data-state` 语义标签（非纯颜色）；隐私提示 `#4b5563` 满足 WCAG AA；支持 `prefers-reduced-motion`。
- v0.1 既有 LLM 配置可见可编辑（回归）；e2e 选择器保持不变。

## 影响面

- 单文件改造 `entrypoints/options/App.vue`（前端 UI）。
- 复用已合并后端契约 #10/#14（`get-active-sources`/`set-active-source`/`test-provider`），不改后端。
- 更新 UX 交互模式知识 `knowledges/ux/interaction-patterns.md`（设置页 v0.2 增量）。

## 回滚方案

单文件 `git revert` `entrypoints/options/App.vue` 即可回退 UI；知识库与迭代文档回退同次 commit。

## 验证

- `pnpm typecheck`（vue-tsc）通过。
- `pnpm build`（wxt build）通过（139.75 kB）。
- `pnpm test`（vitest）71 passed。
- `pnpm lint`（eslint）通过。
- e2e 选择器未破坏（`+ 添加提供方`/`.provider-card`/`名称`/`base-url` testid/`模型名`/`启用`/`留空则使用浏览器首选语言`）。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #4 https://github.com/Aiden-FE/llm-translator/issues/4 |
| PRD 文档 | `releases/v0.2/4-source-picker-ui/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 (https://github.com/Aiden-FE/llm-translator/milestone/1) |
| DESIGN | `releases/v0.2/issue-16/DESIGN.md` |
| PLAN | `releases/v0.2/issue-16/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-16/CHANGELOG.md` |
| 验收标准 | 源类型下拉含 4 项按类型条件渲染字段；顶部生效源提示行可见（兜底明示外传去向+引导，启用自有源后切换名称）；连通性测试对 LLM/传统 API Key/免 Key 兜底源均生效 inline 展示；旧「不内置」提示已移除替换为兜底关系说明；v0.1 既有 LLM 配置可见可编辑（回归）；兜底态隐私提示对比度满足 WCAG AA，提示行用文字+语义标签表达状态 |
| 知识沉淀 | context: 无; adr: 无; feature: 无（后端契约已在 unified-adapter.md）; ux: 更新 `knowledges/ux/interaction-patterns.md` 设置页 v0.2 增量（生效源提示行两态、4 类源选择器、每卡 inline 测试） |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch（直接从 master 建 PR，无 stacked） |
| 上游 Issue/MR | 无（#10/#14 已合并就绪；PRD #3 后端能力为后续端到端验收依赖，不阻塞本任务） |
| 基线分支 | master |
| 推荐合并顺序 | 无（单任务） |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 后端契约通道（#14）：`get-active-sources` / `set-active-source` / `test-provider`（testWithAdapter）；存量兼容：v0.1 既有 `activeProviderId` 经 `getActiveSources` 自动解析命中，不做数据迁移；源类型下拉四项：openai-compatible / ollama / google / microsoft |

🤖 Generated with [Claude Code](https://claude.com/claude-code)
