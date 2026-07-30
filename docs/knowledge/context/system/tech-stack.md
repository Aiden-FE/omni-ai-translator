---
id: context:system:tech-stack
type: context
status: draft
owner: project
updated: 2026-07-30
confidence: 0.9
sources:
  - package.json
  - wxt.config.ts
  - tsconfig.json
  - knowledges/context/system/tech-stack.md
related:
  - context:system:plugin-architecture
  - runbook:dev-commands
---

# 技术栈（初始化草稿）

> 以 `package.json` / `wxt.config.ts` 实际声明为准（v0.3.1）。

## 技术栈

| 维度 | 选型 | 理由 |
|------|------|------|
| 扩展规范 | Manifest V3（Firefox 由 WXT 转 MV2） | MV2 已被 Chrome 废弃，MV3 为现行强制标准 |
| 框架 | WXT ^0.19 | 热重载、跨浏览器构建、TS 友好、约定式目录 |
| 前端框架 | Vue 3 ^3.4 | 组件化开发 options / popup / 浮层 |
| 语言 | TypeScript ^5.4（严格模式） | 类型安全，降低多脚本通信出错率 |
| 样式 | Tailwind CSS ^4.3（`@tailwindcss/vite`）+ shadcn-vue | token-first 主题，组件化 UI |
| 包管理 | pnpm（workspace） | Monorepo 友好，磁盘高效 |
| 构建 | WXT 内置（基于 Vite） | 原生 HMR 与打包 |
| 净化 | dompurify ^3.4 | 译文 markdown 渲染净化 |

## 测试分层

| 类型 | 框架 | 范围 |
|------|------|------|
| 单元测试 | Vitest ^2.0（`shared/**/*.test.ts`） | 适配层错误路径、provider 注册路由 |
| e2e | Playwright ^1.61 | 划词翻译全链路 |

> Vitest 必须用 2.x：4.x 要求 Vite 6+，与项目 Vite 5.x 不兼容（来源：legacy tech-stack）。

## 外部依赖策略

- LLM 接口调用使用原生 `fetch`，不引入特定 SDK（保持提供方无关）。
- `shared/llm.ts` 为兼容层（`@deprecated`），新代码用 `shared/translator` 统一入口。

## 来源证据

- `package.json`：`scripts` 与 `dependencies` / `devDependencies` 版本。
- `wxt.config.ts`：`vite.plugins = [tailwindcss(), vue()]`。
