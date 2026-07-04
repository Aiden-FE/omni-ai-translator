# CHANGELOG:翻译译文 markdown 可读渲染(Issue #36)

> 关联 PRD Issue #31 · 迭代版本 v0.2 · 任务 Issue #36

## 新增功能

- **译文 markdown 可读渲染**(#36):翻译浮层 done 阶段将译文从纯文本(textContent)升级为 markdown 渲染(解析→sanitize→innerHTML),支持标题/列表/加粗/斜体/行内代码/代码块/引用/链接的可读展示。
- **prompt 保留 markdown 结构**(#36):`buildPrompt` 追加指示「若源文为 markdown,保留其结构与标记」,三源(openai-compatible/anthropic/ollama)统一生效。
- **浮层 md 样式**(#36):暗底 #1F2937 适配,代码块稍浅底 #374151 + 等宽字体 + 横向滚动,对照视觉原型 v0.2-md-render.html 实现。
- **XSS 安全 sanitize**(#36):引入 DOMPurify 对 markdown→HTML 做 sanitize,清除 script/onerror/javascript:/iframe/object/embed 等恶意 payload;链接强制 target="_blank" + rel="noopener noreferrer"。

## Bug 修复

无。

## API 变更

- `shared/translator/llm-provider.ts` 的 `buildPrompt` 追加 markdown 保留指示,不影响返回签名。
- 新增 `shared/render/markdown.ts` 导出 `renderMarkdown(md: string): string`。

## 破坏性变更

无。流式阶段保持 textContent 渐进显示不变;传统源纯文本译文渲染为段落;既有 e2e 回归全部通过。

## 部署注意事项

- 新增 production 依赖 `dompurify`(3.4.11),devDependency `jsdom`(测试环境)。
- content.js 体积增量 30.42KB,content.css 增量 1.30KB,合计 31.72KB < 50KB 预算。
- DOMPurify 在构建时(SSR)为工厂函数,运行时(content script)懒初始化为实例,无需特殊配置。
