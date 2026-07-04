# PLAN:翻译译文 markdown 可读渲染(Issue #36)

> 关联 PRD Issue #31 · 迭代版本 v0.2 · 任务 Issue #36

## 任务清单

### P0:后端 prompt 调整

- [x] 1.1 修改 `shared/translator/llm-provider.ts` 的 `buildPrompt`,追加指示「若源文为 markdown,保留其结构与标记(标题/列表/代码块)」(优先级 P0,复杂度低,无依赖)

### P0:前端 markdown 渲染模块

- [x] 2.1 创建 `shared/render/markdown.ts`:实现 escapeHtml / parseInline / parseMarkdown / renderMarkdown(轻量解析器 + DOMPurify sanitize)(优先级 P0,复杂度中,依赖 dompurify 已安装)
- [x] 2.2 配置 DOMPurify:ALLOWED_TAGS 限定 md 语义标签;链接强制 target="_blank" + rel="noopener noreferrer";ALLOWED_ATTR 限定 href/target/rel(优先级 P0,复杂度低,依赖 2.1)

### P0:前端浮层渲染集成

- [x] 3.1 修改 `entrypoints/content.ts` done 阶段:将 `textContainer.textContent = translatedText` 替换为 renderMarkdown → 创建 div.llm-translator-md-render → innerHTML(优先级 P0,复杂度中,依赖 2.1)
- [x] 3.2 处理 `!firstChunkReceived` 边缘分支:同样用 renderMarkdown 渲染(优先级 P0,复杂度低,依赖 3.1)
- [x] 3.3 确保流式阶段(flushPending textContent)与错误态不受影响(优先级 P0,复杂度低,依赖 3.1)

### P0:浮层 md 样式

- [x] 4.1 在 `assets/content.css` 新增 `.llm-translator-md-render` 及子元素样式(h1-h6/p/ul/ol/li/strong/em/code/pre/blockquote/a),对照原型暗底适配(优先级 P0,复杂度低,无依赖)

### P0:sanitize 单元测试

- [x] 5.1 创建 `shared/render/__tests__/markdown.test.ts`:覆盖恶意 payload(<script>/onerror/javascript:链接/<iframe>/<object>/<embed>)(优先级 P0,复杂度中,依赖 2.1)
- [x] 5.2 测试正常 markdown 渲染(标题/列表/加粗/代码块/引用/链接)(优先级 P0,复杂度低,依赖 2.1)
- [x] 5.3 测试纯文本渲染为段落、空字符串处理(优先级 P1,复杂度低,依赖 2.1)

### P1:验证与回归

- [x] 6.1 运行 vitest 单测全部通过(131 tests passed)(优先级 P0,复杂度低,依赖 5.x)
- [x] 6.2 运行 ESLint 通过(优先级 P0,复杂度低,依赖全部代码)
- [x] 6.3 运行 typecheck(vue-tsc)通过(优先级 P0,复杂度低,依赖全部代码)
- [x] 6.4 运行 wxt build 通过并测量 content.js 体积增量 < 50KB(实际增量 30.42KB+1.30KB=31.72KB)(优先级 P0,复杂度低,依赖全部代码)
- [x] 6.5 运行 playwright e2e 回归不退化(6 tests passed)(优先级 P0,复杂度中,依赖全部代码)
- [x] 6.6 对照视觉原型自检视觉还原度(色彩/间距/组件/状态)(优先级 P0,复杂度低,依赖 4.1)

### P1:文档

- [x] 7.1 更新 MEMORY.md(开发踩坑/关键信息)(优先级 P1,复杂度低)
- [x] 7.2 编写 CHANGELOG.md(优先级 P0,复杂度低,依赖全部完成)
