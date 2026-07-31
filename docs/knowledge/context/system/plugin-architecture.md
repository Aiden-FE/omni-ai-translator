---
id: context:system:plugin-architecture
type: context
status: draft
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - entrypoints/background.ts
  - entrypoints/content.ts
  - entrypoints/options
  - entrypoints/popup
  - shared/translator/index.ts
  - shared/types.ts
  - wxt.config.ts
  - knowledges/context/system/plugin-architecture.md
related:
  - context:system:tech-stack
  - context:system:permissions-privacy
  - feature:translator:unified-adapter
  - feature:fullpage:command-channel
  - adr:001-unified-translator-adapter-layer
---

# 插件架构（初始化草稿）

> 本草稿由 knowledge_initialization 扫描代码与既有 `knowledges/` 生成，以当前代码（v0.3.1）为准。

Chrome 浏览器扩展，Manifest V3，使用 WXT 框架组织多脚本环境。跨浏览器构建（Chrome MV3 / Firefox MV2 / Edge MV3），WXT 按目标浏览器自动处理 `manifest_version`、`host_permissions → permissions(MV2)`、`action → browser_action(MV2)` 与 background 脚本格式转换。

## 脚本环境

| 环境 | 入口 | 角色 |
|------|------|------|
| background (Service Worker) | `entrypoints/background.ts` | 接收翻译请求、经适配层统一入口调用翻译、管理配置；v0.4.0 起兼作全文翻译右键菜单入口（`contextMenus.onClicked` 后经 `tabs.sendMessage` 下发命令给 content script）；SW 被回收时状态走 `chrome.storage` 持久化 |
| content-script | `entrypoints/content.ts` | 监听选区、注入翻译浮层 UI、与 background 通信 |
| popup | `entrypoints/popup/` | 工具栏弹窗，配置主入口（生效源横幅、源卡片、连通性测试、目标语言） |
| options | `entrypoints/options/` | 全功能配置页：翻译源管理、目标语言、Prompt 自定义 |

## 数据流（划词翻译，非流式）

```
content-script 捕获选区
  → browser.runtime.sendMessage({ type:'translate', payload: TranslateRequest })
  → background → translateWithAdapter(req)            # shared/translator/index.ts
  → 读 settings.activeProviderId + providers + 内置免费源 (chrome.storage.local)
  → activeProviderId === null → 解析为默认 builtin:microsoft（显式默认，非隐式回退）
  → 先查用户已配置源，未命中再查内置免 Key 免费源；均未命中 → errorType:'no-config'
  → registry.createProvider(config) → provider.translate(req)
  → TranslateResult → content-script 浮层展示
```

background 内**不含源类型 if-else 分支**，所有源类型路由由适配层 `shared/translator/` 处理（见 `feature:translator:unified-adapter`）。

## 数据流（流式翻译）

content 经 `browser.runtime.connect({ name:'translate-stream' })` 建 Port 长连接；background `onConnect` 监听并调 `translateWithAdapterStream(req, onChunk)`，逐 chunk 经 `port.postMessage({ type:'chunk' })` 推送，结束发 `done`/`error` 后 `disconnect()`。消息契约见 `shared/types.ts` 的 `StreamPortMessage`。详见 `adr:002-llm-streaming-port-and-readablestream`。

## 数据流（全文翻译命令通道，v0.4.0）

右键菜单「全文翻译」（`contexts: ['page']`）→ background `contextMenus.onClicked` 按菜单 id（`fullpage-replace` / `fullpage-bilingual`）映射 `DisplayMode` → 经 `browser.tabs.sendMessage` 下发 `BackgroundCommand = { type:'fullpage-translate', mode }` 给目标 tab 的 content script（content 侧 `runtime.onMessage` 消费待 t5 落地）。`BackgroundCommand` 与 content → background 的 `Message` 联合方向分离。契约详见 `feature:fullpage:command-channel`。

## 关键约束

- **MV3 Service Worker 生命周期**：SW 空闲会被回收，不可依赖内存状态；配置与缓存走 `chrome.storage.local`。
- **跨域请求**：声明域内 background SW 的 `fetch` 具备跨域特权（绕过 CORS）。用户自配云端 LLM 端点为运行时动态输入，无法枚举，故 `host_permissions` 含通配 `https://*/*`。详见 `context:system:permissions-privacy`。
- **Key 安全**：API Key 仅存 `chrome.storage.local`，不写入日志、不上传。
- **统一适配层**：所有翻译源实现 `TranslationProvider` 接口，上层经 `shared/translator/index.ts` 统一入口调用，不感知具体源类型。

## 来源证据

- `entrypoints/background.ts`：`onMessage` 六类消息分支 + `onConnect` 流式 port；无源类型分支。
- `shared/translator/index.ts`：`translateWithAdapter` / `translateWithAdapterStream` / `testWithAdapter` / `getActiveSources` / `setActiveSource`。
- `shared/types.ts`：`Message` 联合与 `StreamPortMessage` 契约。
- `wxt.config.ts`：跨浏览器 manifest 差异化。
