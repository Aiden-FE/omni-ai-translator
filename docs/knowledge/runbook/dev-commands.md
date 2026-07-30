---
id: runbook:dev-commands
type: runbook
status: draft
owner: project
updated: 2026-07-30
confidence: 0.9
sources:
  - package.json
  - AGENTS.md
related:
  - context:system:tech-stack
---

# 开发与构建命令（初始化草稿）

> 以 `package.json` 的 `scripts` 为准（v0.3.1）。

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发（WXT 热重载，默认 Chrome） |
| `pnpm dev:firefox` / `pnpm dev:edge` | 指定浏览器开发 |
| `pnpm build` | 构建（Chrome MV3） |
| `pnpm build:firefox` / `pnpm build:edge` | 跨浏览器构建 |
| `pnpm zip` / `zip:firefox` / `zip:edge` | 打包上架 zip |
| `pnpm typecheck` | `vue-tsc --noEmit` 类型检查 |
| `pnpm test` | `vitest run` 单元测试 |
| `pnpm lint` | ESLint（`.ts,.vue`） |
| `pnpm e2e` | `wxt build && playwright test`（首次需 `pnpm e2e:install`） |
| `pnpm e2e:install` | `playwright install chromium` |

> `postinstall` 自动执行 `wxt prepare`。

## 排错提示

- Vitest 固定 2.x；升级 Vite 到 6+ 前不要升 Vitest 4.x。
- e2e 失败先确认已 `pnpm e2e:install` 安装 chromium。

## 来源证据

- `package.json`：`scripts` 字段。
- `AGENTS.md`：「常用命令」章节。
