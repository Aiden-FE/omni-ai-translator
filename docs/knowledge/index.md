---
id: context:root
type: context
status: active
owner: project
updated: 2026-07-30
confidence: 0.9
sources: []
related:
  - context:index
  - adr:index
  - feature:index
  - runbook:index
  - product:index
  - ux:index
---

# Project Knowledge

项目知识库根索引。六类知识：context、adr、feature、runbook、product、ux。

> 检索协议：先索引后正文——先读本索引与分类索引，再按预算下钻正文。每份正文含可解析 frontmatter（稳定 ID、类型、状态、owner、更新日期、置信度、来源、关联）。

## 分类索引

| 类别 | 索引 | 用途 |
|------|------|------|
| context | [context/index.md](context/index.md) | 项目全局认知：架构、技术栈、权限隐私、开发规范、产品名 |
| adr | [adr/index.md](adr/index.md) | 架构决策记录 |
| feature | [feature/index.md](feature/index.md) | 功能模块说明 |
| runbook | [runbook/index.md](runbook/index.md) | 运维与故障处理 |
| product | [product/index.md](product/index.md) | 产品概览、策略、路线图 |
| ux | [ux/index.md](ux/index.md) | UX 规范、交互模式 |

## 已初始化知识清单

| ID | 类型 | 文件 |
|----|------|------|
| `context:system:plugin-architecture` | context | context/system/plugin-architecture.md |
| `context:system:tech-stack` | context | context/system/tech-stack.md |
| `context:system:permissions-privacy` | context | context/system/permissions-privacy.md |
| `context:development:coding-standard` | context | context/development/coding-standard.md |
| `context:development:storage-migration` | context | context/development/storage-migration.md |
| `context:business:product-name` | context | context/business/product-name.md |
| `adr:001-unified-translator-adapter-layer` | adr | adr/001-unified-translator-adapter-layer.md |
| `adr:002-llm-streaming-port-and-readablestream` | adr | adr/002-llm-streaming-port-and-readablestream.md |
| `adr:005-response-style-as-llm-protocol-discriminator` | adr | adr/005-response-style-as-llm-protocol-discriminator.md |
| `feature:translator:unified-adapter` | feature | feature/translator-unified-adapter.md |
| `feature:fullpage:command-channel` | feature | feature/fullpage-command-channel.md |
| `feature:fullpage:segmenter-pool` | feature | feature/fullpage-segmenter-pool.md |
| `feature:fullpage:orchestrator` | feature | feature/fullpage-orchestrator.md |
| `runbook:dev-commands` | runbook | runbook/dev-commands.md |
| `product:overview` | product | product/overview.md |
| `ux:interaction-patterns` | ux | ux/interaction-patterns.md |

> 初始化说明：本草稿集由 knowledge_initialization 基于当前代码（v0.3.1）、`AGENTS.md` 与既有 `knowledges/` 生成，正文均以代码为事实源并附来源证据。legacy `knowledges/` 中其余 ADR（003/004/006/007/008）、runbook（e2e-and-build / config-migration / extension-store-publishing）、product-wiki 子页与 ux 设计系统/可访问性待后续按需迁移。
