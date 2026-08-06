---
id: iteration:v0.4.0
type: iteration
status: active
owner: project
updated: 2026-08-05
confidence: 0.9
sources:
  - docs/iterations/v0.4.0/CHANGELOG.md
related:
  - context:system:plugin-architecture
  - context:system:permissions-privacy
  - feature:fullpage:command-channel
  - feature:fullpage:segmenter-pool
  - feature:fullpage:orchestrator
  - feature:fullpage:e2e-mock-contract
  - runbook:e2e:fullpage-trigger-assertions
---

# Iteration v0.4.0 — 全文翻译

> 迭代 ID: `fa0c40ce-65b7-49f7-9c88-1e0212b225a5`
> 日期: 2026-08-03 → 2026-08-05
> 主题: 全文翻译（right-click → 页面级 replace / bilingual 翻译 + 工具栏 + 视口优先调度 + e2e 覆盖）

## 迭代入口

- [CHANGELOG.md](CHANGELOG.md) — 聚合 12 个任务的迭代级变更记录

## 任务资产

| # | 任务 ID | 标题 | 文档 |
|---|---|---|---|
| 1 | `9c31d198-a148-4649-b76c-d0eea81b274f` | 搭建上下文菜单入口与全文翻译消息通道 | [DESIGN](tasks/9c31d198-a148-4649-b76c-d0eea81b274f/DESIGN.md) · [PLAN](tasks/9c31d198-a148-4649-b76c-d0eea81b274f/PLAN.md) · [CHANGELOG](tasks/9c31d198-a148-4649-b76c-d0eea81b274f/CHANGELOG.md) |
| 2 | `490531ee-e42e-4af7-a4b3-e75e3712c1a4` | 实现页面分段收集器与带缓存的并发翻译池 | [DESIGN](tasks/490531ee-e42e-4af7-a4b3-e75e3712c1a4/DESIGN.md) · [PLAN](tasks/490531ee-e42e-4af7-a4b3-e75e3712c1a4/PLAN.md) · [CHANGELOG](tasks/490531ee-e42e-4af7-a4b3-e75e3712c1a4/CHANGELOG.md) |
| 3 | `3ecb43bc-3eff-4323-96f2-eea84cb6dc48` | 实现替换/双语双模式渲染器与 Shadow DOM 译文块隔离 | [CHANGELOG](tasks/3ecb43bc-3eff-4323-96f2-eea84cb6dc48/CHANGELOG.md) |
| 4 | `b922fb74-49bb-4875-ab0a-8d3e170ea516` | 实现悬浮翻译工具栏与收起迷你把手 | [CHANGELOG](tasks/b922fb74-49bb-4875-ab0a-8d3e170ea516/CHANGELOG.md) |
| 5 | `17614208-4e99-455b-8dfb-5abbd6f7aede` | 实现全文翻译编排器、content script 入口与增量翻译 | [DESIGN](tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/DESIGN.md) · [PLAN](tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/PLAN.md) · [CHANGELOG](tasks/17614208-4e99-455b-8dfb-5abbd6f7aede/CHANGELOG.md) |
| 6 | `9d51a89a-b934-4765-a570-7dd583d37717` | 编写全文翻译 e2e 用例并扩展 mock server | [DESIGN](tasks/9d51a89a-b934-4765-a570-7dd583d37717/DESIGN.md) · [PLAN](tasks/9d51a89a-b934-4765-a570-7dd583d37717/PLAN.md) · [CHANGELOG](tasks/9d51a89a-b934-4765-a570-7dd583d37717/CHANGELOG.md) |
| 7 | `c81b8f88-6cab-4720-90bb-b75378472d8d` | 审查全文翻译功能实现 | [REVIEW](tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md) · [CHANGELOG](tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/CHANGELOG.md) |
| 8 | `000a65d5-4d87-42ca-84e0-8034c913ad04` | 移除段尾 loading 文案与 aria-label | [CHANGELOG](tasks/000a65d5-4d87-42ca-84e0-8034c913ad04/CHANGELOG.md) |
| 9 | `b44e13a3-8043-41ed-9b27-06c9ee383404` | 实现视口判定与 IntersectionObserver 调度工具 | [CHANGELOG](tasks/b44e13a3-8043-41ed-9b27-06c9ee383404/CHANGELOG.md) |
| 10 | `83a350c8-48b5-4875-b7a2-8f97e90f13af` | 编排器按视口分组调度与清理 IO | [DESIGN](tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/DESIGN.md) · [PLAN](tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/PLAN.md) · [CHANGELOG](tasks/83a350c8-48b5-4875-b7a2-8f97e90f13af/CHANGELOG.md) |
| 11 | `3bd60c32-becd-4b3c-8ae4-64026be74b1a` | 同步更新单测：loading 文案移除 + 视口优先调度 | [CHANGELOG](tasks/3bd60c32-becd-4b3c-8ae4-64026be74b1a/CHANGELOG.md) |
| 12 | `a3ea2058-c5bb-45be-a488-09aadf1ac4ec` | 扩展 e2e 验证视口优先调度与恢复清理 | [DESIGN](tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/DESIGN.md) · [PLAN](tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/PLAN.md) · [CHANGELOG](tasks/a3ea2058-c5bb-45be-a488-09aadf1ac4ec/CHANGELOG.md) |

## 关联长期知识

| 知识 ID | 类型 | 任务来源 |
|---|---|---|
| `context:system:plugin-architecture` | context | #1 |
| `context:system:permissions-privacy` | context | #1 / #6 / #7 |
| `feature:fullpage:command-channel` | feature | #1 |
| `feature:fullpage:segmenter-pool` | feature | #2 / #3 / #7 / #9 / #10 |
| `feature:fullpage:orchestrator` | feature | #5 / #7 / #10 |
| `feature:fullpage:e2e-mock-contract` | feature | #6 |
| `runbook:e2e:fullpage-trigger-assertions` | runbook | #6 / #7 / #12 |

## 验证基线

- 单元测试（vitest）：309 → 381 全绿
- e2e（playwright）：7 → 15 → 20 全绿（划词 7 + 全文 8 + 视口 2）
- typecheck（vue-tsc）/ lint（eslint）/ 构建（wxt build chrome-mv3 + firefox-mv2）全绿

## 状态

✅ 迭代完成（2026-08-05）：12 个任务全部 succeeded；发版前待办见 [CHANGELOG §6 关键风险与遗留](CHANGELOG.md#6-关键风险与遗留)。
