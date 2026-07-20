# Manifest 权限用途说明 (Permission Justification)

> 关联 Issue: #64 | PRD Issue: #52 | 版本: v0.3 | 创建日期 2026-07-10
> 事实来源: wxt.config.ts, knowledges/product-wiki/privacy/PRIVACY-POLICY.md

## 概述

本文档为 LLM Translator Chrome MV3 扩展 manifest 中声明的每个权限和 host_permission 提供用途说明，供 Chrome Web Store 审核参考。

移除 contextMenus 权限后，manifest 声明的权限如下:

## permissions

### storage

- **用途**: 存储用户配置到 `chrome.storage.local`，包括 LLM API Key / BaseURL、传统翻译源 API Key / 端点、目标语言、Prompt 偏好、当前生效翻译源等设置。
- **数据说明**: 所有配置仅存于本地浏览器存储，不上传到任何服务器。API Key 不出现在日志、错误上报或代码提交中。
- **依据**: PRIVACY-POLICY.md 第 2 节

## content_scripts matches

### `<all_urls>`

- **用途**: 划词翻译功能需要在使用者浏览的任意网页上工作。content script 注入页面后监听 `mouseup` 事件，在用户划词选中文本时显示翻译触发按钮，点击后展示翻译结果浮层。
- **数据说明**: content script 仅在用户主动选中文本后读取选区内容，不主动收集页面信息，不上报 URL 或页面内容。
- **依据**: PRIVACY-POLICY.md 第 2 节

## host_permissions

### `http://localhost/*`

- **用途**: 连接用户配置的本地大模型(如 Ollama，默认端口 11434)。用户选择本地模型时，待翻译文本仅在本机流转，不外传到互联网。
- **依据**: PRIVACY-POLICY.md 第 3 节

### `http://127.0.0.1/*`

- **用途**: 本地模型的备用回环地址。部分本地模型服务可能使用 127.0.0.1 而非 localhost，保留此 host permission 确保兼容性。文本仅在本机流转。
- **依据**: PRIVACY-POLICY.md 第 3 节

### `https://translate.googleapis.com/*`

- **用途**: 调用 Google 翻译免 Key 公共端点。这是用户可选的免费翻译源之一，用户在配置页选择 Google 免费源时使用。非官方端点，稳定性与隐私处理以 Google 政策为准。
- **依据**: PRIVACY-POLICY.md 第 3 节、第 5 节

### `https://edge.microsoft.com/*`

- **用途**: 调用微软翻译免 Key 公共端点。这是全新安装默认选中的翻译源，保证开箱即用。非官方端点，稳定性与隐私处理以微软政策为准。
- **依据**: PRIVACY-POLICY.md 第 3 节、第 5 节

### `https://api.cognitive.microsofttranslator.com/*`

- **用途**: 调用微软 Azure Translator 官方 API。用户在配置页填入自有微软翻译 API Key 时使用此端点。
- **依据**: PRIVACY-POLICY.md 第 3 节、第 5 节

### `https://*/*`

- **用途**: 用户自配云端 LLM 端点(OpenAI 兼容接口 / 原生 Anthropic Messages API 端点，如 Claude 官方)。Chrome MV3 Service Worker 发起跨域 fetch 需要此 host permission 绕过 CORS 限制。用户填入的 BaseURL 可能是任意 https 域名。
- **数据说明**: 文本发送给用户配置的 LLM 服务商，按该服务商隐私政策处理。
- **依据**: PRIVACY-POLICY.md 第 3 节、第 5 节

## 已移除权限

### activeTab (已移除)

- **状态**: 已从 wxt.config.ts 移除(v0.3.1)
- **原因**: Chrome Web Store 审核拒信(参考 ID: Purple Potassium)指出 activeTab 请求但未使用。content script 通过 `window.getSelection()` 读取选中文本,在页面上下文内执行,不需要 activeTab 权限;全项目无 `chrome.tabs` / `chrome.action` 调用。移除后不影响划词翻译功能。

### contextMenus (已移除)

- **状态**: 已从 wxt.config.ts 移除
- **原因**: 代码中未使用 `chrome.contextMenus` API，声明了但未使用的权限会被 Chrome Web Store 审核质疑。移除后不影响任何功能。
