---
id: context:development:coding-standard
type: context
status: draft
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - AGENTS.md
  - shared/types.ts
  - shared/storage.ts
  - shared/translator/index.ts
  - knowledges/context/development/coding-standard.md
related:
  - context:system:plugin-architecture
  - context:system:permissions-privacy
  - context:development:storage-migration
---

# 编码规范（初始化草稿）

> 来源：AGENTS.md 开发约定 + 既有 `knowledges/` 编码规范，已与代码核对。

## 通用

- TypeScript 严格模式，禁止 `any`（确需时用 `unknown` + 类型守卫）。
- 命名：变量/函数 camelCase，类型/接口 PascalCase，常量 UPPER_SNAKE_CASE。
- 注释密度匹配上下文；公共 API 与复杂逻辑必须注释「为什么」。

## 扩展特定

- **脚本间通信**统一走类型化消息通道：`shared/types.ts` 的 `Message` 联合类型，`browser.runtime.sendMessage` / `onMessage` 均按类型校验。
- **配置读写**统一封装 `shared/storage.ts`，不直接散用 `chrome.storage` / `browser.storage`。
- **LLM / 翻译调用**统一走适配层 `shared/translator/`，content-script 不直接 `fetch` 第三方接口（受 CORS 与 SW 生命周期约束，应由 background 发起）。
- **API Key 严禁**出现在日志、commit、错误上报中；仅存 `chrome.storage.local`。

## 提交

- 遵循 Prodflow commit 规范。
- 不提交真实密钥、令牌、隐私数据。

## 来源证据

- `shared/types.ts`：`Message` 联合类型定义。
- `shared/storage.ts`：`getProviders` / `setProviders` / `getSettings` / `setSettings` 统一封装。
- `AGENTS.md`：「开发约定」章节。
