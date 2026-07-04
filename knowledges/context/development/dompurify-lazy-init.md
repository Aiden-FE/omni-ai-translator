# DOMPurify 在 WXT/SSR 构建中的懒初始化

DOMPurify 3.x 在没有 `window` 的环境（WXT/Vite 构建期、SSR、Node 测试环境）中默认导出是一个工厂函数 `root => createDOMPurify(root)`，没有 `sanitize` / `addHook` 方法；直接在模块顶层调用 `DOMPurify.sanitize` 或 `DOMPurify.addHook` 会在构建时报 `addHook is not a function`。使用时必须在运行时（`window` 已可用）调用 `DOMPurify(window)` 创建绑定到当前 window 的完整实例，再注册 hook 与 sanitize。

## 关系

- 一个 **DOMPurify 工厂函数**（无 window 时的默认导出）在运行时经 `DOMPurify(window)` 产生一个 **DOMPurify 实例**。
- 一个 **DOMPurify 实例** 恰好绑定一个 **window**，提供 `sanitize` / `addHook` 等方法。
- **模块级单例**：实例懒初始化一次后缓存（`let purifyInstance = null`），避免每次渲染重建。

## 示例对话

> **开发者**: "为什么 `DOMPurify.addHook('afterSanitizeAttributes', ...)` 在 WXT build 时报 `is not a function`?"
> **领域专家**: "DOMPurify 3.x 在无 `window` 时默认导出是工厂函数，没有 `addHook`。构建期模块求值时 `window` 不存在，所以要在首次调用 `renderMarkdown` 时（此时 content script 已在真实 window 运行）用 `DOMPurify(window)` 创建实例再注册 hook。"

## 相关文件

- `shared/render/markdown.ts` — `getPurify()` 懒初始化 + `afterSanitizeAttributes` hook
- `knowledges/adr/003-markdown-render-sanitize.md` — 引入 DOMPurify 的依赖选型决策

## 踩坑

- **happy-dom 与 DOMPurify 不兼容**：sanitize 单测若用 happy-dom 环境，DOMPurify 会移除 `ALLOWED_TAGS` 中首个标签（如 `<p>` / `<h1>` / `<ul>`），仅保留后续标签。改用 jsdom（devDependency + 文件级 `// @vitest-environment jsdom`）解决；仅影响测试，不影响真实浏览器（content script 使用真实 DOM）。
- **JSDoc 注释中的 `*/` 序列**：注释里出现 `(-/*/+)` 这类含 `*/` 的文本会提前关闭块注释，esbuild 报 `Unexpected ")"`；改用不含 `*/` 的中文描述避免。
