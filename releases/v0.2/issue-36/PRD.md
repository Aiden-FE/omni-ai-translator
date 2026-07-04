# PRD:翻译译文 markdown 可读渲染(Issue #36)

> 关联 PRD Issue #31 · 迭代版本 v0.2 · 任务 Issue #36

## 需求来源

本任务源自 PRD Issue #31 [v0.2-8] 翻译译文 markdown 可读渲染,完整 PRD 见 `knowledges/product-wiki/releases/v0.2/8-md-render/PRD.md`。本文档为开发任务 #36 的需求确认与澄清补充,不重写原 PRD。

## 需求确认

### 改动范围(全栈)

**前端**:
- `entrypoints/content.ts`:done 阶段将 `textContainer.textContent = translatedText` 替换为 markdown 渲染(解析→sanitize→innerHTML);流式阶段保持 textContent 渐进显示不变。
- `assets/content.css`:新增浮层 md 元素样式(标题/列表/加粗/代码块/引用适配暗底 #1F2937 + 最大宽 360px)。
- 新增 `shared/render/markdown.ts`:轻量 markdown 解析器 + DOMPurify sanitize。
- 新增 `shared/render/__tests__/markdown.test.ts`:sanitize 单元测试。

**后端**:
- `shared/translator/llm-provider.ts`:`buildPrompt`(line 7-10,单一共享函数)追加指示「若源文为 markdown,保留其结构与标记」。

**依赖**:
- 新增 `dompurify`(production dependency)、`happy-dom`(devDependency,测试环境)。

### 不做的内容

- 流式期间增量 markdown 渲染(部分 md 容错)——未来版本。
- 代码块复制按钮——未来版本。
- 不触碰 #35 的文件(popup/options/shared-storage/builtin-sources)。
- 不修改 `knowledges/product-wiki/releases/v0.2/index.md`(协调器统一管理)。

### 验收标准(来自 PRD #31)

- [ ] done 后译文按 md 可读渲染(标题/列表/加粗/代码块)
- [ ] 流式期间渐进显示原文,无明显闪烁
- [ ] LLM 输出经 sanitize,恶意 payload(script/onerror/javascript:/iframe/object/embed)被清除(单测覆盖)
- [ ] 传统源纯文本正常显示
- [ ] 浮层 md 样式适配暗色背景,可访问性 AA
- [ ] 既有划词翻译 e2e 回归通过(不退化)
- [ ] md 元素语义化(h/ul/ol/code/pre),读屏可识别结构
- [ ] 代码块等宽、横向可滚动

## 澄清结果(无人值守自动决策)

1. **依赖选型**:轻量自实现 markdown 解析器 + DOMPurify(详见 DESIGN.md 技术选型)。
2. **流式→done 切换**:done 时将流式 span(textContainer)替换为 div.llm-translator-md-render,innerHTML 设为 sanitize 后的 md HTML;纯文本译文渲染为 `<p>` 段落。
3. **链接处理**:允许 `<a href>`,DOMPurify 清除 javascript: 等危险协议;链接强制 target="_blank" + rel="noopener noreferrer"。
4. **e2e 兼容**:mock 返回纯文本 "你好,世界",渲染为 `<p>你好,世界</p>`,toContainText 断言不受影响。
