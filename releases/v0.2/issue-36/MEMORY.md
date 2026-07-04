# MEMORY — Issue #36 翻译译文 markdown 可读渲染

> 迭代版本:v0.2 · 关联 PRD Issue #31 · 任务 Issue #36

## PRD 摘要

将翻译浮层译文渲染从纯文本(textContent)升级为 markdown 可读渲染,使标题/列表/加粗/代码块等结构化译文以可读格式呈现;并调整 prompt 指示保留源文 markdown 结构。涉及流式感知渲染策略与 XSS 安全过滤。

### 验收标准(来自 PRD #31)

- done 后译文按 md 可读渲染(标题/列表/加粗/代码块)
- 流式期间渐进显示原文,无明显闪烁
- LLM 输出经 sanitize,恶意 payload(script/onerror/javascript:/iframe)被清除(单测覆盖)
- 传统源纯文本正常显示
- 浮层 md 样式适配暗色背景,可访问性 AA
- 既有划词翻译 e2e 回归通过(不退化)
- md 元素语义化(h/ul/ol/code/pre),读屏可识别结构
- 代码块等宽、横向可滚动

## 关键业务规则

- 仅 LLM 源(openai-compatible/anthropic/ollama)译文可能含 markdown;传统源(google/microsoft)译文为纯文本,渲染为段落。
- 流式期间保持 textContent 渐进显示 + 光标(不中途渲染半截 md,避免抖动);done 后切 markdown 渲染。
- sanitize 必须清除:`<script>`、`on*` 事件属性、`javascript:` 链接、`<iframe>`、`<object>`、`<embed>`。
- 浮层暗底 #1F2937 + 浅字 #F9FAFB;最大宽 360px;代码块稍浅底 #374151 + 等宽 + 横向滚动。

## 技术约束

- 渲染点:`entrypoints/content.ts` 的 done 处理(line 159-160),将 `textContainer.textContent = translatedText` 替换为 `renderMarkdown(translatedText)` → innerHTML。
- 流式阶段(line 125 `textContainer.textContent = translatedText`)保持不变。
- 后端:`shared/translator/llm-provider.ts` 的 `buildPrompt`(line 7-10,单一共享函数)追加 markdown 保留指示;三源(openai/anthropic/ollama)统一。
- 浮层 md 样式写入 `assets/content.css`。
- sanitize 单测放 `shared/render/__tests__/markdown.test.ts`,vitest include 模式 `shared/**/*.test.ts` 覆盖。
- e2e mock 返回纯文本 "你好,世界"(无 md),渲染为 `<p>你好,世界</p>`,`toContainText` 断言不受影响。

## 依赖链元数据

- 并发安全等级:parallel-safe
- MR 基线策略:base-branch(从 master 创建 PR)
- 上游依赖:无
- 关联研发任务:无
- 基线分支:master
- 推荐合并顺序:无(与 #35 并行,#35 改 popup/options/shared-storage/builtin-sources,#36 改 content.ts/content.css/llm-provider.ts/新增 renderMarkdown,文件不重叠)

## 与并行任务 #35 的边界

- #35 改动:`entrypoints/popup/*`、`entrypoints/options/App.vue`、共享组件、`shared/storage.ts`、`shared/translator/builtin-sources`。
- #36 改动:`entrypoints/content.ts`、`assets/content.css`、`shared/translator/llm-provider.ts`、新增 `shared/render/` 模块、package 依赖。
- 不触碰 #35 的文件,降低合并冲突风险。

## 自动决策记录

### 决策1:依赖选型 — 轻量自实现 markdown 解析器 + DOMPurify

- 决策点:markdown 解析 + sanitize 依赖选型(marked+DOMPurify vs 轻量自实现)
- 采用值:轻量自实现 markdown 解析器 + DOMPurify(sanitize)
- 依据:(1) DOMPurify 是 XSS sanitize 审计级标准库,自实现 sanitizer 是已知反模式,安全不可妥协;(2) 自实现解析器 ~3-4KB,覆盖翻译输出常见 md(标题/列表/加粗/代码块/引用/链接),DOMPurify 作最终安全门,解析器 bug 不影响安全;(3) marked(~40KB raw)+ DOMPurify(~45KB raw)合计 ~85KB 超出 50KB 预算;自实现+DOMPurify 合计 ~48KB 满足;(4) content script 每页加载,体积敏感
- 风险:解析器可能不处理复杂 markdown(嵌套列表/表格),翻译输出通常简单,可接受
- 回滚:移除 dompurify 依赖,还原 content.ts/llm-provider.ts

### 决策2:测试环境 — jsdom for sanitize 单测

- 决策点:sanitize 单测需要 DOM 环境(vitest 默认 node 环境)
- 采用值:jsdom(devDependency)+ 文件级 `// @vitest-environment jsdom` 指令,仅影响 sanitize 测试文件
- 依据:jsdom 是 Node.js DOM 实现的行业标准,与 DOMPurify 兼容性最佳;happy-dom 与 DOMPurify 存在兼容性问题(移除首个 ALLOWED_TAGS 中的标签);文件级指令不影响现有 shared 单测
- 风险:无(仅测试用)
- 变更:初始选 happy-dom,测试发现 DOMPurify+happy-dom 兼容性问题后切换为 jsdom

## 开发踩坑记录

### 1. happy-dom 与 DOMPurify 不兼容

- 现象:DOMPurify 在 happy-dom 环境中会移除 ALLOWED_TAGS 中首个标签(如 `<p>`/`<h1>`/`<ul>`),仅保留后续标签
- 根因:happy-dom 的 DOM API 实现与 DOMPurify 内部逻辑不完全兼容
- 解决:切换测试环境为 jsdom,问题消失
- 影响:仅影响测试,不影响实际浏览器(content script 使用真实 DOM)

### 2. DOMPurify 构建时 addHook 失败(SSR)

- 现象:WXT build 报 `DOMPurify.addHook is not a function`
- 根因:DOMPurify 3.x 在无 `window` 时(构建/SSR 环境)默认导出为工厂函数 `root => createDOMPurify(root)`,无 `sanitize`/`addHook` 方法
- 解决:懒初始化 — 首次调用 `renderMarkdown` 时(window 已可用)`DOMPurify(window)` 创建实例,再注册 hook
- 影响:构建和测试均通过

### 3. 注释中的 `*/` 关闭块注释

- 现象:esbuild 报 `Unexpected ")"` 语法错误
- 根因:JSDoc 注释中 `(-/*/+)` 的 `*/` 序列提前关闭了块注释
- 解决:改用中文描述避免 `*/` 序列

### 4. 体积实测

- baseline: content.js 17.31KB + content.css 1.04KB = 18.35KB
- after: content.js 47.73KB + content.css 2.34KB = 50.07KB
- 增量: 30.42KB(js) + 1.30KB(css) = 31.72KB < 50KB 预算 ✓

## 知识检索留痕

- Step2.2 知识检索(prodflow-knowledge-retrieve)因子 agent 无 Skill 工具跳过;改为从 PRD/代码/MEMORY/UX 文档自行收集上下文,非阻塞。

## 待沉淀知识

### 1. feature:译文 markdown 可读渲染

- 功能名:翻译浮层译文 markdown 可读渲染
- 目标:LLM 译文按 markdown 可读渲染(标题/列表/加粗/代码块),流式期间渐进显示、done 后渲染
- 交互与状态流转:流式(textContent 渐进+光标)→ done(移除 span,创建 div.llm-translator-md-render,sanitize 后 innerHTML)→ 错误(保留现有错误反馈)
- 权限:无特殊权限,沿用 content script 既有权限
- 相关文件:`shared/render/markdown.ts`、`entrypoints/content.ts`、`assets/content.css`、`shared/translator/llm-provider.ts`
- 建议沉淀路径:`knowledges/feature/translator/markdown-render.md`

### 2. adr:markdown 渲染依赖选型 — 轻量自实现解析器 + DOMPurify

- 决策标题:译文 markdown 渲染采用轻量自实现解析器 + DOMPurify(非 marked+DOMPurify)
- 背景:需将 LLM 译文(不可信)渲染为 markdown HTML,体积预算 <50KB,安全不可妥协
- 方案与取舍:方案 B(自实现解析器~3KB + DOMPurify~45KB = 48KB)优于方案 A(marked+DOMPurify ~85KB 超预算)和方案 C(自实现 sanitizer 安全风险);DOMPurify 是 XSS sanitize 审计级标准,自实现 sanitizer 是已知反模式
- 相关文件:`shared/render/markdown.ts`
- 建议沉淀路径:`knowledges/adr/003-markdown-render-sanitize.md`

### 3. context:DOMPurify 在 WXT/SSR 构建中的懒初始化

- 概念名:DOMPurify 懒初始化模式
- 定义:DOMPurify 3.x 在无 window 时(构建/SSR)默认导出为工厂函数,需在运行时调用 `DOMPurify(window)` 创建实例
- 影响范围:所有在 WXT/Vite 构建中使用 DOMPurify 的模块
- 相关文件:`shared/render/markdown.ts`(getPurify 函数)
- 建议沉淀路径:`knowledges/context/development/dompurify-lazy-init.md`
