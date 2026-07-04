# DESIGN:翻译译文 markdown 可读渲染(Issue #36)

> 关联 PRD Issue #31 · 迭代版本 v0.2 · 任务 Issue #36

## 背景与目标

翻译浮层译文当前用 `textContent` 渲染,LLM 返回的 markdown 符号(`#`/`**`/`-`)以原始文本显示,可读性差。本任务将 done 阶段渲染升级为 markdown→sanitize→innerHTML,使结构化译文可读;并调整 prompt 指示保留源文 markdown 结构。

## 技术选型与理由

### 方案对比

| 方案 | 体积(raw min) | 安全性 | 可测试性 | 复杂度 |
|------|---------------|--------|---------|--------|
| A: marked + DOMPurify | ~85KB(超预算) | 高(均审计) | 高 | 低 |
| B: 轻量自实现解析器 + DOMPurify | ~48KB(达标) | 高(DOMPurify 审计) | 高 | 中 |
| C: 轻量自实现解析器 + 自实现 sanitizer | ~4KB(最小) | 低(自实现 sanitizer 风险) | 中 | 高 |

### 采用方案 B:轻量自实现 markdown 解析器 + DOMPurify

**理由**:
1. **安全不可妥协**:DOMPurify 是 XSS sanitize 审计级标准库,自实现 sanitizer 是已知反模式。LLM 输出不可信,必须用审计级 sanitize。
2. **体积达标**:DOMPurify ~45KB + 解析器 ~3KB ≈ 48KB < 50KB 预算。方案 A 合计 ~85KB 超预算。
3. **解析器低风险**:解析器仅产出 HTML,DOMPurify 作最终安全门;解析器 bug 不影响安全性(最坏情况是渲染不美观,不会导致 XSS)。
4. **可回滚**:移除 dompurify 依赖 + 还原 content.ts/llm-provider.ts 即可回滚。

**解析器覆盖范围**:标题(h1-h6)、无序/有序列表、加粗、斜体、行内代码、代码块(fenced)、引用、链接、段落。

**不覆盖**:嵌套列表、表格、图片(翻译输出通常不含这些,未来版本可扩展)。

## 架构方案

### 渲染流程

```
LLM 译文(不可信)
  ↓
parseMarkdown(md)        ← 轻量解析器,产出 HTML 字符串(文本已 escape)
  ↓
DOMPurify.sanitize(html) ← 审计级 sanitize,清除恶意标签/属性/协议
  ↓
div.innerHTML = sanitized ← 注入浮层(安全)
```

### 模块划分

```
shared/render/
├── markdown.ts              ← renderMarkdown(md): string + parseMarkdown/parseInline/escapeHtml(内部)
└── __tests__/
    └── markdown.test.ts     ← sanitize 单测(恶意 payload + 正常 md 渲染)
```

### content.ts 改动点

**done 阶段**(line 158-165):
- `firstChunkReceived && textContainer && translatedText` 分支:移除流式 span,创建 `div.llm-translator-md-render`,innerHTML = renderMarkdown(translatedText),append 到 panel。
- `!firstChunkReceived` 分支:清空 panel,创建 md div 渲染。
- 流式阶段(line 122-129 flushPending)不变:textContent 渐进显示。

### llm-provider.ts 改动点

**buildPrompt**(line 7-10):追加指示「若源文为 markdown,保留其结构与标记(标题/列表/代码块)」。单一共享函数,三源(openai/anthropic/ollama)统一生效。

## UX 与视觉实现

### 设计 token(来自 design-system.md + 原型)

| Token | 值 | 用途 |
|-------|-----|------|
| 浮层背景 | `#1F2937` | panel bg(沿用) |
| 浮层文字 | `#F9FAFB` | panel text(沿用) |
| 代码块背景 | `#374151` | pre/code bg(稍浅于 panel) |
| 加粗文字 | `#FFFFFF` | strong(比正文更亮,层级强调) |
| 引用文字 | `#D1D5DB` | blockquote(稍暗,层级弱化) |
| 引用边框 | `#6B7280` | blockquote border-left |
| 等宽字体 | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` | code/pre |
| 正文字体 | `system-ui, -apple-system, sans-serif` | panel(沿用) |

### 组件规范(对照原型 v0.2-md-render.html)

| 元素 | 样式 |
|------|------|
| `.llm-translator-md-render h1` | 16px / 600 / margin 0.4em 0 0.2em |
| `.llm-translator-md-render h2` | 15px / 600 / margin 0.4em 0 0.2em |
| `.llm-translator-md-render h3` | 14px / 600 / margin 0.4em 0 0.2em |
| `.llm-translator-md-render h4-h6` | 14px / 600 / margin 0.3em 0 0.1em |
| `.llm-translator-md-render p` | margin 0.3em 0 |
| `.llm-translator-md-render ul/ol` | margin 0.3em 0 / padding-left 1.4em |
| `.llm-translator-md-render li` | margin 0.1em 0 |
| `.llm-translator-md-render strong` | 600 / #fff |
| `.llm-translator-md-render em` | italic |
| `.llm-translator-md-render code` | monospace / 12.5px / bg #374151 / padding 1px 5px / radius 4px |
| `.llm-translator-md-render pre` | bg #374151 / radius 6px / padding 10px 12px / overflow-x auto |
| `.llm-translator-md-render pre code` | bg transparent / padding 0 / 12.5px |
| `.llm-translator-md-render blockquote` | border-left 3px #6b7280 / padding 0.1em 0 0.1em 10px / #d1d5db |
| `.llm-translator-md-render a` | color #93c5fd(浅蓝,暗底可读)/ underline |

### 交互状态

- **流式期间**:span.llm-translator-stream-text textContent 渐进显示 + 光标 ▋(沿用,不变)。
- **done 后**:移除光标,移除流式 span,创建 div.llm-translator-md-render 注入 sanitize 后的 md HTML。纯文本译文渲染为 `<p>`。
- **错误态**:保留现有错误反馈(❌ 主行 + 引导次行),不受 md 渲染影响。
- **切换体验**:流式→done 渲染切换时,若最终 md 与渐进原文一致(纯文本)则视觉跳变最小;若 md 结构化则平滑替换。

### 可访问性

- 渲染后 md 使用语义标签(`<h1>`-`<h6>`/`<ul>`/`<ol>`/`<code>`/`<pre>`/`<blockquote>`),读屏可识别结构。
- 暗底 #1F2937 + 浅字 #F9FAFB 对比度 > 7:1,满足 WCAG AA(正常文本 ≥ 4.5:1)。
- 代码块等宽字体 + 横向滚动(`overflow-x: auto`),长代码不破坏浮层宽度。
- 不依赖纯颜色区分结构:标题用字号+字重,列表用符号/缩进,加粗用字重。
- 浮层 `aria-live="polite"`(已有)在 done 渲染后播报最终译文。

### 视觉原型参照

原型路径:`knowledges/ux/prototypes/v0.2-md-render.html`,展示 raw(textContent)vs rendered(markdown)对比。CSS 值直接参照原型 `.md` 选择器组。

## 数据结构/模型变更

无新增类型。`renderMarkdown(md: string): string` 纯函数,输入 markdown 文本,输出 sanitize 后的 HTML 字符串。

## 接口设计

### renderMarkdown 模块

```typescript
// shared/render/markdown.ts
export function renderMarkdown(md: string): string;
```

- 输入:markdown 文本(可能含恶意 HTML)
- 输出:sanitize 后的安全 HTML 字符串
- 内部:parseMarkdown(md) → DOMPurify.sanitize(html, config)
- DOMPurify 配置:ALLOWED_TAGS 限定为 md 语义标签;ALLOWED_ATTR 限定 href/target/rel;链接强制 target="_blank" + rel="noopener noreferrer"。

### buildPrompt 变更

```typescript
// 追加指示,不影响返回签名
function buildPrompt(text: string, targetLang: string, sourceLang?: string): string;
```

## 兼容性与风险评估

### 兼容性
- 传统源(google/microsoft)译文为纯文本,parseMarkdown 将其渲染为 `<p>段落</p>`,正常显示。
- e2e mock 返回 "你好,世界"(纯文本),渲染为 `<p>你好,世界</p>`,toContainText 断言通过。
- 既有流式渲染逻辑不变,仅 done 阶段替换渲染方式。

### 风险
- **解析器不完整**:复杂 markdown(嵌套列表/表格)可能渲染不理想。缓解:翻译输出通常简单;DOMPurify 保证安全;解析器可迭代。
- **DOMPurify 体积**:~45KB raw,content script 每页加载。缓解:满足 <50KB 预算;DOMPurify 是安全必需品。
- **prompt 指示不保证**:LLM 可能不遵循保留 markdown 结构的指示。缓解:这是尽力而为,多数情况改善。

### 回滚方案
1. 移除 `shared/render/` 模块
2. 还原 `entrypoints/content.ts`(textContainer.textContent = translatedText)
3. 还原 `shared/translator/llm-provider.ts` buildPrompt
4. 还原 `assets/content.css`(移除 md 样式)
5. `pnpm remove dompurify happy-dom`
