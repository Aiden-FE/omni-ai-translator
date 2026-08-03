---
id: context:system:permissions-privacy
type: context
status: draft
owner: project
updated: 2026-08-03
confidence: 0.85
sources:
  - wxt.config.ts
  - shared/storage.ts
  - shared/translator/builtin-sources.ts
  - knowledges/context/development/extension-permissions-and-privacy.md
  - docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md
related:
  - context:system:plugin-architecture
  - context:development:coding-standard
  - product:overview
  - feature:fullpage:command-channel
  - runbook:e2e:fullpage-trigger-assertions
---

# 扩展权限基线与隐私数据流（初始化草稿）

> 以 `wxt.config.ts` manifest 声明为准（v0.3.1 基线；v0.4.0 重新引入 `contextMenus`）。

## 权限基线

- `permissions: ['storage', 'contextMenus']` — 三浏览器一致（写入共用 `baseManifest.permissions`，WXT 自动处理 Firefox MV2 归并）。
  - `storage` — 存储用户配置与 API Key（`chrome.storage.local`）。
  - `contextMenus` — **v0.4.0 重新引入**（v0.3 #64 曾因未使用移除）。用于全文翻译右键菜单入口：background 在 `runtime.onInstalled` 内创建菜单（父项「全文翻译」+ 两个模式子项，`contexts: ['page']`），`contextMenus.onClicked` 触发后经 `browser.tabs.sendMessage` 下发 `BackgroundCommand` 给目标页 content script。契约详见 `feature:fullpage:command-channel`。
- `activeTab` - 已移除（v0.3.1）。划词靠 content script 在页面上下文内 `window.getSelection()` 读取选中文本，不需要 activeTab。注意：v0.4.0 起 background 存在 `browser.tabs.sendMessage` 调用（下发全文翻译命令），但该 API 仅需目标 tab id，不依赖 activeTab 或 `tabs` 权限。
- **`tabs` 权限未声明的影响**：`chrome.tabs.query({})` 虽可在无 `tabs` 权限时调用，但返回的 `Tab.url` / `Tab.title` 被 Chrome 剥离（`undefined`）。e2e 测试中因此无法按 URL 精确匹配目标页签，改用全页签广播方案（详见 `runbook:e2e:fullpage-trigger-assertions`）。

## host_permissions

| 端点 | 用途 |
|------|------|
| `http://localhost/*`、`http://127.0.0.1/*` | 本地 LLM 端点（如 Ollama） |
| `https://translate.googleapis.com/*` | Google 免费翻译源 |
| `https://edge.microsoft.com/*` | Edge 内置翻译 auth 端点 |
| `https://api.cognitive.microsofttranslator.com/*` | 微软翻译 API |
| `https://*/*` | 用户自配云端 LLM 端点（SW 跨域 fetch 绕过 CORS） |

- MV3 `host_permissions` 独立声明；MV2（Firefox）WXT 自动合并入 `permissions`。
- 选 `https://*/*` 而非 `<all_urls>` 以平衡 Chrome Web Store 审核（仅 HTTPS）；仍属宽泛权限，审核需说明「用户自配云端 LLM 端点跨域 fetch」。

## 隐私数据流（最小化原则）

- **默认翻译源**：`builtin:microsoft` 免费翻译源，免 Key，开箱即用。
- **待翻译文本**：按需仅发送当前生效翻译源，不广播、不缓存。
- **API Key 与设置**：仅存 `chrome.storage.local`，不上传服务器、不出现在日志。
- **无分析/追踪**：不集成任何分析 SDK，不收集使用数据。
- **无 Cookie**：不设置/读取 Cookie。
- **无译文历史持久化**：译文仅显示在 UI，不持久化。
- **本地模型选项**：用户选择本地 LLM（如 Ollama）时，待翻译文本不外传。

## 待办（合规同步）

- `releases/v0.3/4-listing-compliance/PERMISSIONS-JUSTIFICATION.md` 的 `contextMenus` 条目仍标记「已移除」（v0.3 #64 合规材料），与 v0.4.0 基线不一致；需后续任务补充 contextMenus 用途说明（Chrome Web Store 审核质询预案）。该文件不在本知识库写入边界内，此处仅登记。
- **审查确认（REVIEW.md B1）**：v0.4.0 审查确认 `contextMenus` 权限代码实现正确（background `onInstalled` 创建菜单 + `onClicked` 下发 `BackgroundCommand`），Chrome MV3 + Firefox MV2 manifest 均含 `contextMenus` + 双 content script。B1 仅涉及合规文档同步，非代码缺陷，阻塞发版。

## 来源证据

- `wxt.config.ts`：`baseManifest.permissions`（`storage` + `contextMenus`，含 v0.4.0 重新引入注释）与 `host_permissions` 数组。
- `entrypoints/background.ts`：`contextMenus.onClicked` 顶层同步注册 + `onInstalled` 内三项菜单创建 + `tabs.sendMessage` 下发。
- `shared/storage.ts`：Key 仅存 `browser.storage.local`。
- `shared/translator/builtin-sources.ts`：内置免 Key 源端点常量与默认生效源 `builtin:microsoft`。
