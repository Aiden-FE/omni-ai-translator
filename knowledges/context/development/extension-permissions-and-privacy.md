# 扩展权限与隐私数据流

扩展权限基线为 `storage` 与 `activeTab`（`contextMenus` 已确认未使用并移除）。`host_permissions` 覆盖翻译 API 端点与用户自配云端 LLM 端点。隐私数据流设计遵循最小化原则：待翻译文本按需仅发送当前生效翻译源，API Key 与设置仅存 `chrome.storage.local`，无分析/追踪/Cookie/译文历史持久化。

## 权限基线

- `permissions: ['storage', 'activeTab']` - 三浏览器一致。
  - `storage` - 存储用户配置与 API Key（`chrome.storage.local`）。
  - `activeTab` - 划词翻译时获取当前页面选中文本。
- `contextMenus` - 已移除，经确认未使用。减少商店审核权限质询。

## host_permissions

- `localhost` / `127.0.0.1` - 本地 LLM 端点（如本地 Ollama）。
- `translate.googleapis.com` - Google 免费翻译源。
- `edge.microsoft.com` - Edge 浏览器内置翻译源。
- `api.cognitive.microsofttranslator.com` - 微软翻译 API。
- `https://*/*` - 用户自配云端 LLM 端点（SW 跨域 fetch 绕过 CORS）。
  - MV3 `host_permissions` 独立声明；MV2（Firefox）WXT 自动合并入 `permissions`。

## 隐私数据流

- **默认翻译源**：微软免费翻译源，免 Key，开箱即用。
- **待翻译文本**：按需仅发送当前生效翻译源，不广播、不缓存。
- **API Key 与设置**：仅存 `chrome.storage.local`，不上传服务器、不出现在日志。
- **无分析/追踪**：不集成任何分析 SDK，不收集使用数据。
- **无 Cookie**：不设置/读取 Cookie。
- **无译文历史持久化**：译文仅显示在 UI，不持久化存储。
- **本地模型选项**：用户选择本地 LLM（如 Ollama）时，待翻译文本不外传。

## 合规材料归档

商店上架合规材料归档于 `releases/v0.3/4-listing-compliance/`：

- `PRIVACY-PRACTICES` - 隐私实践声明。
- `PERMISSIONS-JUSTIFICATION` - 权限使用理由。
- `DATA-DISCLOSURE` - 数据披露声明。
- `COMPLIANCE-CHECKLIST` - 合规检查清单。

## 相关文件

- `wxt.config.ts` - manifest 权限声明。
- `releases/v0.3/issue-64/` - 隐私合规任务迭代文档。
- `knowledges/adr/008-wxt-cross-browser-manifest-differentiation.md` - 跨浏览器 manifest 差异化策略。
