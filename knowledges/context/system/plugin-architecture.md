# 插件架构 — LLM Translator

> Chrome 扩展（Manifest V3）插件架构说明。

## 整体架构

本项目为 Chrome 浏览器扩展，基于 Manifest V3，使用 WXT 框架组织多脚本环境。

### 脚本环境

| 环境 | 角色 | 说明 |
|------|------|------|
| `background` (Service Worker) | 后台逻辑 | 接收翻译请求、调用 LLM 接口、管理配置；SW 被回收时状态需持久化到 `chrome.storage` |
| `content-script` | 页面注入 | 监听选区、注入翻译浮层 UI、与 background 通信 |
| `popup` | 弹窗 | 工具栏点击弹出的快捷面板（第一版轻量，主要入口为划词） |
| `options` | 选项页 | LLM 提供方配置（云端 / 本地）、目标语言、Prompt 自定义 |

### 数据流（划词翻译）

```
content-script 捕获选区
  → chrome.runtime.sendMessage({ type: 'translate', text, targetLang })
  → background 调用适配层统一入口 translateWithAdapter(req)
  → 适配层读取 settings.activeProviderId + providers (chrome.storage.local)
  → 无可用源 → TranslateResult{errorType:'no-config'}
  → 有源 → registry.createProvider(config) → provider.translate(req)
  → 返回译文（或 errorType 错误）
  → content-script 浮层展示
```

background 内不含源类型 if-else 分支，所有源类型路由由适配层（`shared/translator/`）处理。详见 [统一翻译源适配层功能知识](../../feature/translator/unified-adapter.md)。

### 关键约束

- **MV3 Service Worker 生命周期**：SW 空闲会被回收，不可依赖内存状态；配置与缓存走 `chrome.storage.local`。
- **跨域请求**：调用第三方 LLM 接口需在 manifest `host_permissions` 声明；本地模型（如 Ollama）走 `http://localhost:<port>`。
- **Key 安全**：API Key 仅存 `chrome.storage.local`，不写入日志、不上传。
- **统一适配层**：所有翻译源（LLM 类 / 传统类）实现 `TranslationProvider` 接口，上层经 `shared/translator/index.ts` 统一入口调用，不感知具体源类型。

## 模块组织

- **翻译源适配层**（`shared/translator/`）：已实现。定义 `TranslationProvider` 接口、provider 工厂注册表与路由、四类错误归一化。LLM provider（openai-compatible / ollama）已迁移接入，传统 provider（google / microsoft）为占位。详见 [功能知识](../../feature/translator/unified-adapter.md) 与 [ADR-001](../../adr/001-unified-translator-adapter-layer.md)。
- **翻译核心**：Prompt 构造、译文清洗，与具体 UI 解耦（由 LLM provider 内 `buildPrompt` 承载）。
