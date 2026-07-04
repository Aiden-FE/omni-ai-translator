# 译文 markdown 渲染采用轻量自实现解析器 + DOMPurify

v0.2 功能事项 8 将 LLM 译文（不可信）渲染为 markdown HTML。决策采用「轻量自实现块级/行内解析器（约 3KB）+ DOMPurify sanitize（约 45KB）」，合计约 48KB 满足 <50KB 体积预算；而非 marked + DOMPurify（合计约 85KB 超预算），也非自实现 sanitizer（安全不可妥协，自实现 sanitizer 是已知反模式）。安全模型上，`parseMarkdown` 产出 HTML（代码块/行内代码 escape，普通文本不 escape），DOMPurify 作为最终安全门清除恶意标签/属性/协议，解析器 bug 不影响安全性。

**状态**: accepted

**考虑过的选项**:

| 方案 | 描述 | 结论 |
|------|------|------|
| A. marked + DOMPurify | 标准库 marked 解析 + DOMPurify sanitize | 否决 — marked 约 40KB + DOMPurify 约 45KB ≈ 85KB，超出 50KB 预算；content script 每页加载，体积敏感 |
| B. 轻量自实现解析器 + DOMPurify | 自实现解析器（约 3KB，覆盖翻译输出常见 md）+ DOMPurify sanitize | 采用 — 合计约 48KB 满足预算；DOMPurify 审计级 sanitize 保证安全 |
| C. 自实现解析器 + 自实现 sanitizer | 全自实现，无第三方依赖 | 否决 — 自实现 sanitizer 是已知反模式，XSS 防护不可妥协 |

**后果**:

- 自实现解析器仅覆盖翻译输出常见 md（标题 h1-h6、无序/有序列表、代码块、行内代码、加粗、斜体、链接、引用、段落），不处理嵌套列表/表格等复杂结构；翻译输出通常简单，可接受。
- DOMPurify 是最终安全门：`ALLOWED_TAGS` 限定为 markdown 语义标签，`ALLOWED_ATTR` 限定 `href/target/rel`，`afterSanitizeAttributes` hook 强制链接 `target=_blank` + `rel=noopener noreferrer`。
- 新增运行时依赖 `dompurify`（production）与 `jsdom`（dev，sanitize 单测环境）；DOMPurify 在 WXT/SSR 构建中需懒初始化（见 `knowledges/context/development/dompurify-lazy-init.md`）。
- sanitize 单测须覆盖 `<script>` / `onerror` / `javascript:` 链接 / `<iframe>` / `<object>` / `<embed>` / `data:` URL 等恶意 payload。
- 回滚方式：移除 `dompurify` 依赖，还原 `content.ts` / `llm-provider.ts`，删除 `shared/render/`。
