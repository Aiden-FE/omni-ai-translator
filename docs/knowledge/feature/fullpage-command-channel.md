---
id: feature:fullpage:command-channel
type: feature
status: draft
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - shared/types.ts
  - entrypoints/background.ts
  - wxt.config.ts
  - docs/iterations/v0.4.0/tasks/9c31d198-a148-4649-b76c-d0eea81b274f/DESIGN.md
related:
  - context:system:permissions-privacy
  - context:system:plugin-architecture
  - feature:translator:unified-adapter
  - feature:fullpage:segmenter-pool
---

# 全文翻译入口与命令通道（v0.4.0）

> 以 `entrypoints/background.ts` 与 `shared/types.ts` 当前代码为准。本模块只覆盖「入口 + 命令通道」基建；页面侧命令消费与逐段翻译渲染由后续任务（t5）承接。

## 功能目标

为全文翻译功能落地右键菜单入口与 background → content 命令通道：

1. 右键菜单：父项「全文翻译」+ 子项「翻译此页（替换）」/「翻译此页（双语对照）」，`contexts: ['page']`。
2. 命令通道：`BackgroundCommand = { type: 'fullpage-translate'; mode: DisplayMode }` 经 `browser.tabs.sendMessage` 下发给目标页 content script。

## 菜单 id 契约

| 菜单项 | id | mode 映射 |
|---|---|---|
| 全文翻译（父项，无点击行为） | `fullpage` | — |
| 翻译此页（替换） | `fullpage-replace` | `replace` |
| 翻译此页（双语对照） | `fullpage-bilingual` | `bilingual` |

`DisplayMode = 'replace' | 'bilingual'`（replace=译文替换原文，bilingual=双语对照）。onClicked 中以 `Record<string, DisplayMode>` 做 id → mode 映射；`info.menuItemId` 类型为 `string | number`，先 `typeof === 'string'` 收窄（TS 严格模式，不用 `any`）。后续任务以此 id 命名为准。

## 消息通道类型分离

- `Message` 联合（`shared/types.ts`）= **content → background** 方向，background 以 `runtime.onMessage` 消费（translate / test-provider / get-settings 等）。
- `BackgroundCommand` 联合 = **background → content** 方向，经 `browser.tabs.sendMessage(tabId, command)` 下发，content 侧以 `browser.runtime.onMessage` 消费（t5 落地后闭环）。
- 两个联合**显式分离，勿混用**；`BackgroundCommand` 采用联合形式为后续新增 background → content 命令预留扩展位。
- 逐段翻译仍复用 `Message` 的 `{ type: 'translate', payload }` 通道与翻译适配层，本通道不改动适配层。

## 下发与守卫

- `tab?.id` 空值守卫：`tab` 或 `tab.id` 缺失（如 devtools 上下文）时直接返回。
- `tabs.sendMessage` 返回 Promise；目标页 content script 未注入时（受限页面等）会 reject「Receiving end does not exist」，以 `.catch(() => {})` 消化，避免 SW 未处理 rejection 噪声。

## MV3 Service Worker 约束

- `browser.contextMenus.onClicked` 监听器在 `defineBackground` 主函数**顶层同步注册**：SW 被菜单点击事件唤醒时，只有顶层同步注册能保证监听器在事件分发前已绑定；放进异步回调会丢事件。
- `browser.contextMenus.create` 全部置于 `browser.runtime.onInstalled` 内：仅安装/更新时执行一次，SW 重启不重复创建，避免 `duplicate id` 运行时报错。

## 权限依赖

`contextMenus` 权限于 v0.4.0 重新引入（v0.3 #64 曾移除），写入三浏览器共用 `baseManifest.permissions`，WXT 自动处理 Firefox MV2 归并。详见 `context:system:permissions-privacy`。

## 来源证据

- `shared/types.ts`：`DisplayMode`、`BackgroundCommand` 定义及方向分离注释。
- `entrypoints/background.ts`：顶层同步 `onClicked`（modeMap 映射 + tabId 守卫 + `tabs.sendMessage` + `.catch`）、`onInstalled` 内三项菜单创建（`fullpage` / `fullpage-replace` / `fullpage-bilingual` + 中文标题 + `contexts: ['page']`）。
- `wxt.config.ts`：`permissions: ['storage', 'contextMenus']` 及重新引入注释。
- `docs/iterations/v0.4.0/tasks/9c31d198-a148-4649-b76c-d0eea81b274f/DESIGN.md`：§2.1–2.5 设计决策（权限、SW 生命周期、类型分离、菜单 id、发送守卫）。
