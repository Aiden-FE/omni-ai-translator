# Agent skills（Agent 技能配置）

本文件告诉各个 Agent 技能，本仓库的工单系统、标签词汇和领域文档放在哪里。

## Issue tracker（工单系统）

工单存放在 GitHub Issues（仓库 `Aiden-FE/omni-ai-translator`），通过 `gh` CLI 访问。详见 `docs/agents/issue-tracker.md`。

## Triage labels（分流标签）

采用默认的五角色标签词汇：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。详见 `docs/agents/triage-labels.md`。

## Domain docs（领域文档）

单上下文布局：仓库根目录一份 `CONTEXT.md`，外加 `docs/adr/`。详见 `docs/agents/domain.md`。
