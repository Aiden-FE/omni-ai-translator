# LLM Translator

基于 LLM 的 Chrome 浏览器翻译插件，支持配置云端或本地大模型接口，通过 LLM 实现高质量翻译。

> 状态：立项阶段（v0.1 规划中）。第一版聚焦**划词翻译** + **LLM 提供方配置**。

## 功能规划

- ✅ 划词翻译（v0.1 第一版）：划词后出现浮动触发按钮，点击翻译
- ⏳ 全文翻译（v0.3）
- ⏳ 小窗输入翻译（v0.2）
- ✅ LLM 提供方配置：云端 OpenAI 兼容接口 + 本地 Ollama（v0.1，不内置任何模型）

详见 [knowledges/product-wiki/roadmap/](knowledges/product-wiki/roadmap/index.md)。

## 技术栈

Chrome 扩展 Manifest V3 + WXT + Vue 3 + TypeScript。

详见 [knowledges/context/system/tech-stack.md](knowledges/context/system/tech-stack.md)。

## 开发

```bash
pnpm install      # 安装依赖（或 npm/yarn）
pnpm dev          # 启动开发（Chrome，热重载）
pnpm build        # 构建生产包
pnpm typecheck    # 类型检查
pnpm lint         # ESLint
pnpm e2e          # 构建扩展并跑 Playwright e2e（首次需 pnpm e2e:install 装 Chromium）
```

### 在 Chrome 中加载

1. `pnpm dev` 或 `pnpm build` 后，产物在 `.output/chrome-mv3/`。
2. 打开 `chrome://extensions`，开启「开发者模式」。
3. 「加载已解压扩展」选择 `.output/chrome-mv3/` 目录。

### 配置 LLM 提供方

本插件**不内置任何模型接口**，需自行配置。点击扩展图标 → 打开设置 → 添加提供方：

- **云端**：类型选 `OpenAI 兼容`，填 BaseURL（如 `https://api.openai.com`）、API Key、模型名。
- **本地**：类型选 `Ollama`，填 BaseURL（如 `http://localhost:11434`），无需 Key，填模型名。

目标语言默认使用浏览器首选语言，可在设置中覆盖。API Key 仅存本地，详见 [隐私政策](knowledges/product-wiki/privacy/PRIVACY-POLICY.md)。

## 项目结构

```
entrypoints/
  background.ts        # Service Worker：翻译请求与 LLM 调用
  content.ts           # 内容脚本：划词与浮层
  popup/               # 工具栏弹窗
  options/             # 设置页（LLM 提供方配置）
shared/
  types.ts             # 共享类型
  storage.ts           # chrome.storage 封装
  llm.ts               # LLM 适配层
e2e/                   # Playwright e2e（mock LLM + 划词全链路）
knowledges/            # 项目知识库
wxt.config.ts          # WXT / manifest 配置
playwright.config.ts   # e2e 配置
```

## 测试

e2e 覆盖划词翻译全链路：加载扩展 → 配置 mock LLM 接口 → 划词 → 点击触发按钮 → 断言浮层译文。

```bash
pnpm e2e:install   # 首次：安装 Playwright Chromium
pnpm e2e           # 构建扩展并运行 e2e
```

CI（GitHub Actions）在 push/PR 到 master 时自动跑 typecheck、lint 与 e2e。

## 知识库

项目知识沉淀于 [knowledges/](knowledges/index.md)，先读索引再按需查阅。立项摘要见 [knowledges/startup-summary.md](knowledges/startup-summary.md)。
