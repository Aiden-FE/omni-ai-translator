---
id: product:overview
type: product
status: draft
owner: project
updated: 2026-07-30
confidence: 0.8
sources:
  - knowledges/startup-summary.md
  - knowledges/product-wiki/index.md
  - wxt.config.ts
  - package.json
related:
  - context:business:product-name
  - context:system:permissions-privacy
  - ux:interaction-patterns
---

# 产品概览（初始化草稿）

> 来源：立项摘要 `knowledges/startup-summary.md` 与 product-wiki；范围随版本演进，以代码实际能力为准（v0.3.1）。

## 定位

**Omni AI Translator** —— 基于 LLM 的 Chrome 浏览器翻译插件（MV3 + WXT + Vue 3 + TS），允许用户配置云端 / 本地大模型接口，并内置免 Key 免费翻译源（Google / 微软），提供高质量划词翻译。

## 目标用户

- **普通阅读用户**：开箱即用，默认内置免费源即可使用。
- **技术用户 / 开发者**：自带 API Key，可接入本地模型（Ollama）与多种云端协议，注重隐私可控与 Prompt 自定义。

## 核心业务链（划词翻译闭环）

```
用户阅读外文页面 → 划词选中文本 → 选区附近出现浮动触发按钮（"译"）
  → 用户点击触发按钮 → 调用当前生效翻译源（内置免费 / 用户自配 LLM）
  → 浮层展示译文（支持流式渐进渲染）
```

- **交互模型**：划词后不自动翻译，显示触发按钮由用户点击触发。
- **目标语言**：默认浏览器首选语言（`navigator.language`），可在设置中覆盖。

## 范围演进（摘要）

- v0.1：划词翻译 + LLM 提供方配置（不内置模型接口）。
- v0.2：翻译源配置闭环，引入内置免 Key 免费源、流式响应、markdown 渲染。
- v0.3：商店上架（免费分发）、跨浏览器（Chrome / Firefox / Edge）、产品命名统一。

## 非目标（第一版）

全文翻译、小窗输入翻译、付费分发、用户账号体系与云端同步（部分随版本重规划，详见 legacy roadmap）。

## 来源证据

- `knowledges/startup-summary.md`：定位、核心业务链、成功标准、非目标、风险。
- `wxt.config.ts` / `package.json`：产品名与跨浏览器能力佐证。
