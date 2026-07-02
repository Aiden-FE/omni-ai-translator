# 技术栈 — LLM Translator

> 技术选型与理由。

## 技术栈

| 维度 | 选型 | 理由 |
|------|------|------|
| 扩展规范 | Manifest V3 | MV2 已被 Chrome 废弃，MV3 为现行强制标准 |
| 框架 | WXT | 提供热重载、跨浏览器构建、TS 友好、约定式目录，降低 MV3 脚手架成本 |
| 前端框架 | Vue 3 | 组件化开发 options / popup / 浮层；符合默认前端栈 |
| 语言 | TypeScript | 类型安全，降低多脚本环境通信出错率 |
| 包管理 | pnpm | Monorepo 友好，磁盘高效 |
| 构建 | WXT 内置（基于 Vite） | 原生 HMR 与打包 |

## 外部依赖（核心）

- `vue` — UI 框架
- `wxt` — 扩展开发框架
- LLM 接口调用 — 原生 `fetch`，不引入特定 SDK（保持提供方无关）
- `vitest` ^2.x — 单元测试框架（与 Vite/WXT 生态匹配；必须用 2.x，4.x 要求 Vite 6+，与项目 Vite 5.3.4 不兼容）
- `playwright` — e2e 测试

## 测试分层

| 类型 | 框架 | 范围 |
|------|------|------|
| 单元测试 | Vitest（`shared/**/*.test.ts`） | 适配层错误路径、provider 注册路由 |
| e2e 测试 | Playwright | 划词翻译全链路 |

## 选型决策

详见 [startup-summary.md](../../startup-summary.md) 第 7 节「技术形态决策」。
