# Prodflow 工作流 — LLM Translator

> 本项目遵循 Prodflow 工作区规范与迭代流程。

## 工作区规范

项目代码位于 `<BASE>/ai-projects/llm-translator`，`<BASE>` 来自环境变量 `PRODFLOW_AI_WORKSPACE_PATH`（默认 `$HOME/dev/prodflow`）。

每个开发任务基于项目 worktree 隔离工作，禁止直接在主仓库开发。迭代文档位于 worktree 内 `releases/<version>/<ISSUE_ID>/`。

详见公共文档 `workspace-rule`。

## 迭代流程

立项（本阶段）→ Sprint 规划（prodflow-sprint-open）→ PRD（prodflow-prd）→ 任务拆分（prodflow-subtask-gen）→ 开发执行（prodflow-worker）→ 审查（prodflow-review）→ 发版（prodflow-release-deploy）→ 迭代收尾（prodflow-sprint-close）。

## 知识库维护

- 关键信息写入 `MEMORY.md`，计划同步 `PLAN.md`，完成时写 `CHANGELOG.md`。
- 项目级知识沉淀于 `knowledges/`，渐进式披露。
