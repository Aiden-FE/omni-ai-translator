---
id: context:business:product-name
type: context
status: draft
owner: project
updated: 2026-07-30
confidence: 0.9
sources:
  - wxt.config.ts
  - package.json
  - knowledges/context/business/product-name.md
related:
  - product:overview
---

# 产品名称（初始化草稿）

正式产品名为 **Omni AI Translator**。

## 命名理由

- `Omni` 呼应差异化定位：模型无关 / 任意源（Google、微软、本地 Ollama、OpenAI 兼容、Anthropic 等多种翻译源）。
- `AI Translator` 关键词全命中 SEO，便于商店搜索发现。
- 语义简洁，易记易传播。

## 统一范围

产品名需在以下位置统一使用：manifest `name` 字段、popup 标题与 `aria-label`、options 页标题、README。仓库名 `Aiden-FE/llm-translator` 保持不变；内部知识库与历史 PRD 不做批量替换。

## 外部前置（用户操作）

- 商标检索：确认 `Omni AI Translator` 未被注册商标。
- Chrome Web Store 重名检索：确认商店内无同名扩展。

## 来源证据

- `wxt.config.ts`：`baseManifest.name = 'Omni AI Translator'`。
- `package.json`：包名仍为 `llm-translator`（仓库名不变）。
