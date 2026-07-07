## 变更摘要

将翻译浮层译文渲染从纯文本(textContent)升级为 markdown 可读渲染,使标题/列表/加粗/代码块等结构化译文以可读格式呈现;并调整 prompt 指示保留源文 markdown 结构。

### 主要改动

- **新增 `shared/render/markdown.ts`**:轻量 markdown 解析器(标题/列表/加粗/斜体/代码/代码块/引用/链接)+ DOMPurify sanitize,导出 `renderMarkdown(md: string): string`
- **修改 `entrypoints/content.ts`**:done 阶段将 `textContainer.textContent = translatedText` 替换为 markdown 渲染(创建 `div.llm-translator-md-render`,innerHTML = sanitize 后的 HTML);流式阶段保持 textContent 渐进显示不变
- **修改 `assets/content.css`**:新增 `.llm-translator-md-render` 及子元素样式(暗底 #1F2937 适配,代码块 #374151 + 等宽 + 横向滚动,对照原型)
- **修改 `shared/translator/llm-provider.ts`**:`buildPrompt` 追加「若源文为 markdown,保留其结构与标记」指示,三源统一
- **新增 `shared/render/__tests__/markdown.test.ts`**:28 个单测覆盖恶意 payload sanitize + 正常 md 渲染 + 边界场景

### 影响面

- 仅影响翻译浮层 done 阶段渲染;流式阶段、错误态、加载态不变
- 传统源(google/microsoft)纯文本译文渲染为 `<p>` 段落,不受影响
- e2e mock 返回纯文本,`toContainText` 断言兼容
- 新增 production 依赖 `dompurify`(3.4.11),devDependency `jsdom`(测试环境)
- content.js 体积 17.31KB → 47.73KB(增量 30.42KB),content.css 1.04KB → 2.34KB(增量 1.30KB),合计增量 31.72KB < 50KB 预算

### 回滚方案

1. 移除 `shared/render/` 模块
2. 还原 `entrypoints/content.ts`(textContainer.textContent = translatedText)
3. 还原 `shared/translator/llm-provider.ts` buildPrompt
4. 还原 `assets/content.css`(移除 md 样式)
5. `pnpm remove dompurify jsdom`

### 测试结果

- vitest 单测:131 tests passed(含 28 个新 markdown 测试)
- ESLint:通过
- typecheck(vue-tsc):通过
- wxt build:通过,体积增量 31.72KB < 50KB
- playwright e2e:6 tests passed(既有划词翻译回归不退化)

Closes #36

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #31 [v0.2-8] 翻译译文 markdown 可读渲染 — https://github.com/Aiden-FE/llm-translator/issues/31 |
| PRD 文档 | `releases/v0.2/8-md-render/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| DESIGN | `releases/v0.2/issue-36/DESIGN.md` |
| PLAN | `releases/v0.2/issue-36/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-36/CHANGELOG.md` |
| 验收标准 | 见 PRD §7.2 核心功能 / §8 验收标准:done 后 md 可读渲染;流式渐进无闪烁;sanitize 清除恶意 payload(单测);传统源纯文本正常;暗底样式 AA;e2e 回归不退化;md 语义化;代码块等宽横向滚动 |
| UX 规范 | `knowledges/ux/design-system.md`、`knowledges/ux/accessibility.md` |
| 视觉原型 | `knowledges/ux/prototypes/v0.2-md-render.html` |
| 知识沉淀 | context: DOMPurify 在 WXT/SSR 构建中的懒初始化模式; adr: markdown 渲染依赖选型(轻量自实现解析器 + DOMPurify); feature: 译文 markdown 可读渲染功能 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无 |
| 基线分支 | master |
| 推荐合并顺序 | 无(与 #35 并行,文件不重叠) |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 无 |
