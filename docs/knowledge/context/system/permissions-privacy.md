---
id: context:system:permissions-privacy
type: context
status: draft
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - wxt.config.ts
  - shared/storage.ts
  - shared/translator/builtin-sources.ts
  - knowledges/context/development/extension-permissions-and-privacy.md
related:
  - context:system:plugin-architecture
  - context:development:coding-standard
  - product:overview
---

# 扩展权限基线与隐私数据流（初始化草稿）

> 以 `wxt.config.ts` manifest 声明为准（v0.3.1）。

## 权限基线

- `permissions: ['storage']` — 三浏览器一致，存储用户配置与 API Key（`chrome.storage.local`）。
- `activeTab` — 已移除（v0.3.1）。划词靠 content script 在页面上下文内 `window.getSelection()` 读取选中文本，不需要 activeTab；全项目无 `chrome.tabs` / `chrome.action` 调用。
- `contextMenus` — 已移除，经确认未使用。

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

## 来源证据

- `wxt.config.ts`：`baseManifest.permissions` 与 `host_permissions` 数组。
- `shared/storage.ts`：Key 仅存 `browser.storage.local`。
- `shared/translator/builtin-sources.ts`：内置免 Key 源端点常量与默认生效源 `builtin:microsoft`。
