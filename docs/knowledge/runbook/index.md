---
id: runbook:index
type: runbook
status: active
owner: project
updated: 2026-08-03
confidence: 0.9
sources: []
related:
  - runbook:dev-commands
  - runbook:e2e:fullpage-trigger-assertions
---

# Runbook Knowledge

runbook 知识索引：运维与故障处理。

## 文件清单

| ID | 文件 | 说明 |
|----|------|------|
| `runbook:dev-commands` | [dev-commands.md](dev-commands.md) | 开发、构建、测试命令与排错提示 |
| `runbook:e2e:fullpage-trigger-assertions` | [e2e-fullpage-trigger-assertions.md](e2e-fullpage-trigger-assertions.md) | 扩展 e2e 触发与渐进渲染断言 — 无 tabs 权限时 SW 全页签广播下发 BackgroundCommand（Promise.allSettled + 0 送达抛错）、「首段已译&&末段未译」相对时序断言抗 CI 抖动、waitForSettled 计数等待点 |
