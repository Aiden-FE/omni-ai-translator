# AGENTS.md — LLM Translator

> 面向 AI Agent 的项目导航与协作规范。

## 项目简介

基于 LLM 的 Chrome 浏览器翻译插件（MV3 + WXT + Vue 3 + TS）。第一版聚焦划词翻译 + LLM 提供方配置。

## 知识库

**查阅知识库请先阅读 [knowledges/index.md](knowledges/index.md)，渐进式读取所需信息。**

关键入口：

- [knowledges/startup-summary.md](knowledges/startup-summary.md) — 立项摘要（定位、范围、非目标、风险）
- [knowledges/context/system/plugin-architecture.md](knowledges/context/system/plugin-architecture.md) — 插件架构
- [knowledges/context/development/coding-standard.md](knowledges/context/development/coding-standard.md) — 编码规范
- [knowledges/product-wiki/](knowledges/product-wiki/index.md) — 产品知识
- [knowledges/ux/](knowledges/ux/index.md) — UX 规范

## 工作区规范

遵循 Prodflow 工作区规范：每个开发任务基于项目 worktree 隔离工作，禁止直接在主仓库开发。迭代文档位于 worktree 内 `releases/<version>/<ISSUE_ID>/`。

- `MEMORY.md` 持续更新关键信息；`PLAN.md` 同步计划；`CHANGELOG.md` 任务完成时编写。
- 详见公共文档 `workspace-rule`。

## 开发约定

- TS 严格模式，禁止 `any`（用 `unknown` + 类型守卫）。
- 脚本间通信走类型化消息通道（`shared/types.ts` 的 `Message`）。
- 配置读写统一走 `shared/storage.ts`，不直接散用 `chrome.storage`。
- LLM 调用统一走 `shared/llm.ts` 适配层，content-script 不直接 `fetch` 第三方接口。
- **API Key 严禁**出现在日志、commit、错误上报中。

## 常用命令

```bash
pnpm dev          # 开发（热重载）
pnpm build        # 构建
pnpm typecheck    # 类型检查
pnpm lint         # ESLint
pnpm e2e          # 构建扩展并跑 e2e（首次需 pnpm e2e:install）
```

## 当前状态

立项阶段完成。下一步：用户确认立项内容 → 进入 Sprint 规划（prodflow-sprint-open）。
