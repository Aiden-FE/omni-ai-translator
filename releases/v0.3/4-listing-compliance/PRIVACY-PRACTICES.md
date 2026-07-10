# Chrome Web Store 隐私实践表填报答案

> 关联 Issue: #64 | PRD Issue: #52 | 版本: v0.3 | 创建日期 2026-07-10
> 事实来源: knowledges/product-wiki/privacy/PRIVACY-POLICY.md

## 填报说明

本文档提供 Chrome Web Store Developer Dashboard > Privacy Practices 表单的填报答案。所有答案基于 PRIVACY-POLICY.md 如实填报，与插件实际行为一致。

## 数据收集声明

### 个人通讯 (Personal communications)

- **是否收集**: 是
- **用途**: 完成翻译功能 -- 用户划词选中的待翻译文本按需发送给当前生效的翻译源(翻译服务)完成翻译
- **共享方**:
  - 微软翻译(默认): 全新安装默认选中微软翻译免 Key 公共端点，文本发送给微软
  - Google 翻译: 用户可选 Google 翻译免 Key 公共端点，文本发送给 Google
  - 用户配置的 LLM 提供方: 用户填入的云端 OpenAI 兼容接口 / 原生 Anthropic Messages API 端点(如 Claude 官方)，文本发送给该 LLM 服务商
  - 用户配置的传统翻译源: 用户填入 Google/微软官方 API Key 时，文本发送给对应官方翻译 API
  - 本地模型(Ollama): 文本仅在本机流转，不外传
- **说明**: 待翻译文本仅按需透传给当前生效翻译源，翻译完成后不在本地留存(无译文历史持久化)。插件不会将文本发送给插件作者或任何无关第三方。

### 身份信息 (Personally identifiable information)

- **是否收集**: 否
- **说明**: 插件不收集任何个人身份信息。(PRIVACY-POLICY.md 第 1 节)

### 认证信息 (Authentication information)

- **是否收集**: 否
- **说明**: API Key(LLM 与传统翻译源)仅存于浏览器本地存储(chrome.storage.local)，不上传、不收集。(PRIVACY-POLICY.md 第 2 节)

### 位置信息 (Location)

- **是否收集**: 否
- **说明**: 插件不涉及位置信息。

### 浏览历史 (Web history)

- **是否收集**: 否
- **说明**: 插件不使用 Cookie 追踪用户行为，不收集浏览历史。(PRIVACY-POLICY.md 第 1 节)

### 用户活动 (User activity)

- **是否收集**: 否
- **说明**: 插件不内置任何分析或追踪 SDK，不收集用户活动数据。(PRIVACY-POLICY.md 第 1 节)

### 网站内容 (Website content)

- **是否收集**: 否
- **说明**: content script 仅读取用户主动划词选中的文本用于翻译，不收集网页内容。(PRIVACY-POLICY.md 第 2 节)

## 关键事实摘要

| 事实项 | 说明 |
|---|---|
| 默认翻译源 | 微软翻译免 Key 公共端点(全新安装显式默认值) |
| 文本外传 | 未配置时默认外传给微软;用户可选 Google/自有源/本地模型 |
| API Key 存储 | 仅 chrome.storage.local，不上传 |
| 追踪/分析 | 无 |
| Cookie | 不使用 |
| 译文历史 | 不持久化 |
| 本地模型选项 | 配置 Ollama 可使文本不外传 |
