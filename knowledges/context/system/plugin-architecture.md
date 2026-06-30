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
  → background 读取当前启用的 LLM 提供方配置
  → fetch(LLM endpoint, { apiKey, prompt })
  → 返回译文
  → content-script 浮层展示
```

### 关键约束

- **MV3 Service Worker 生命周期**：SW 空闲会被回收，不可依赖内存状态；配置与缓存走 `chrome.storage.local`。
- **跨域请求**：调用第三方 LLM 接口需在 manifest `host_permissions` 声明；本地模型（如 Ollama）走 `http://localhost:<port>`。
- **Key 安全**：API Key 仅存 `chrome.storage.local`，不写入日志、不上传。

## 模块预留

按可演进组织，便于后续抽离共享逻辑：

- **LLM 适配层**：抹平不同提供方（OpenAI 兼容、Ollama 等）的请求差异。
- **翻译核心**：Prompt 构造、语言检测、译文清洗（与具体 UI 解耦）。
