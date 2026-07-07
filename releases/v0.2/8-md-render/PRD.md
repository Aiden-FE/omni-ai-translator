# PRD:翻译译文 markdown 可读渲染(md-render)

> 版本:v0.2 第 8 项 · 优先级 P1 · 关联 Issue #31 · 创建日期 2026-07-03

## 1. 摘要

将翻译浮层的译文渲染从纯文本(textContent)升级为 markdown 可读渲染,使标题/列表/加粗/代码块等结构化译文以可读格式呈现;并调整 prompt 指示保留源文 markdown 结构。涉及流式感知渲染策略与 XSS 安全过滤。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求与验收 |
| 前端 | 待分配 | 浮层 markdown 渲染 + sanitize(content.ts) |
| 后端 | 待分配 | buildPrompt 调整(三源统一) |

## 3. 背景

翻译浮层(`entrypoints/content.ts`)全部用 `textContent` 渲染原始文本:
- `showPanel`(content.ts:52):`panel.textContent = content`
- `flushPending`(content.ts:125):`textContainer.textContent = translatedText`
- `done`(content.ts:160):`textContainer.textContent = msg.result.translatedText`

LLM 返回的 markdown(标题/列表/加粗/代码块)以原始符号 `#`/`**`/`-` 显示,可读性差;`buildPrompt`(`shared/translator/llm-provider.ts:7`)只说 "Output ONLY the translation, without explanation or quotes",未指示保留格式,翻译可能丢失源文结构。当源文为 markdown(文档/README/API 文档/代码注释)时,译文结构丢失严重影响可读性。

## 4. 目标

**目标**:译文按 markdown 可读渲染;prompt 保留源文结构;流式期间渐进显示、完成后渲染最终 md;XSS 安全。

**为什么重要**:技术内容翻译的核心价值是保留结构;原始符号堆砌使译文不可读,削弱翻译工具对技术用户的价值。

**关键结果(SMART OKR)**:
- O:译文可读性与结构保真度提升
  - KR1:浮层 `done` 后渲染最终 markdown(标题/列表/加粗/代码块可读)
  - KR2:流式期间显示渐进原文,完成后切渲染 md,无明显闪烁
  - KR3:LLM 输出经 sanitize,无 XSS 注入风险(单元测试覆盖恶意 payload)
  - KR4:传统源(无 markdown)兼容,纯文本正常显示

## 5. 细分市场

- **技术用户翻译文档/README/API 文档/代码注释**(markdown 源):任务是「保留结构地理解译文」,需要标题/列表/代码块可读。当前符号乱使其受挫。
- **普通用户翻译普通文本**(无 markdown):译文为纯文本,渲染为正常段落,不受影响。

约束:浮层为暗色背景(#1F2937)、最大宽度 360px;LLM 输出不可信(需 sanitize);传统源译文无 markdown。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| 翻译技术文档/README | markdown 丢结构,符号堆砌 | 保留标题/列表/代码块,可读 |
| 理解代码注释/commit | 代码块变平文 | 代码块等宽渲染,结构清晰 |
| 翻译普通文本 | 已可用 | 不受影响(纯文本段落) |

比竞品(多数翻译扩展纯文本显示)更优:对技术内容保留 markdown 结构,贴合开发者场景。

## 7. 解决方案

### 7.1 UX / 原型(高层)

浮层渲染分两阶段:
- **流式期间**:保持现有 `textContent` 渐进显示 + 光标(不中途渲染半截 md,避免抖动)。
- **`done` 后**:将最终译文经 `markdown 解析 → sanitize → innerHTML` 渲染为可读 HTML;纯文本则渲染为正常段落。

视觉原型见 [prototypes/v0.2-md-render.html](../../../knowledges/ux/prototypes/v0.2-md-render.html)(展示 raw vs rendered 对比,Tweaks 切换)。

### 7.2 核心功能

1. **markdown 渲染**:`done` 阶段将 `msg.result.translatedText` 经 markdown 解析 + sanitize 后设为浮层 `innerHTML`;流式阶段保持 `textContent` 渐进。
2. **prompt 保留格式**:`buildPrompt` 增加指示「若源文为 markdown,保留其结构与标记(标题/列表/代码块)」。
3. **XSS 安全**:引入 DOMPurify(或等价)对 markdown→HTML 做 sanitize;禁止原始 innerHTML 注入。依赖选型:marked + DOMPurify,或轻量自实现(评估体积)。
4. **传统源兼容**:纯文本译文(无 markdown 语法)渲染为正常段落,不引入多余结构。
5. **浮层 md 样式**:浮层内 md 元素(标题/列表/代码块/引用)适配暗色背景(#1F2937)与最大宽度 360px,遵循设计系统;代码块等宽字体。

### 7.3 技术

- 渲染点:`entrypoints/content.ts` 的 `done` 处理(将 `textContainer.textContent = translatedText` 替换为 `renderMarkdown(translatedText)`)。
- 依赖:`marked`(或 markdown-it)+ `DOMPurify`;优先轻量,评估体积(目标增量 < 50KB)。
- prompt:`shared/translator/llm-provider.ts` 的 `buildPrompt` 调整(openai-compatible/anthropic/ollama 三源统一)。
- 安全:sanitize 单元测试覆盖恶意 payload(`<script>`、`onerror`、`javascript:` 链接、`iframe`、`<object>` 等)。

### 7.4 假设

- 假设大多数译文为短文本,markdown 解析性能可接受(单次 `done` 渲染)。
- 假设 marked+DOMPurify 体积可接受(< 50KB);若过大用轻量方案。
- 假设流式期间显示原文、`done` 后渲染 md 的切换体验可接受(无闪烁)。
- 假设 LLM 遵循 prompt 指示保留 markdown 结构(不保证 100%,但多数情况改善)。

## 8. 发布

**时间范围**:约 0.5-1 周(前端渲染 + sanitize + prompt 调整)。

**第一版(v0.2-8)包含**:
- `done` 后 markdown 渲染 + sanitize
- `buildPrompt` 指示保留 markdown 格式
- 浮层 md 样式(暗底适配)
- sanitize 单元测试

**未来版本**:流式期间增量 markdown 渲染(部分 md 容错)、代码块复制按钮。

**验收标准**:
- [ ] `done` 后译文按 md 可读渲染(标题/列表/加粗/代码块)
- [ ] 流式期间渐进显示原文,无明显闪烁
- [ ] LLM 输出经 sanitize,恶意 payload(script/onerror/javascript:/iframe)被清除(单测)
- [ ] 传统源纯文本正常显示
- [ ] 浮层 md 样式适配暗色背景,可访问性 AA
- [ ] 既有划词翻译 e2e 回归通过(不退化)

## UX 设计

### UX 依据
- Issue: #31
- 版本: v0.2
- 知识来源: `entrypoints/content.ts`、`knowledges/ux/design-system.md`、`accessibility.md`、`knowledges/feature/translator/streaming.md`
- 设计假设: 浮层暗底 #1F2937 + 浅字 #F9FAFB;最大宽 360px;译文多为短文本。

### 视觉设计
> 原型由 `web-design-engineer` 产出,见 [prototypes/v0.2-md-render.html](../../../knowledges/ux/prototypes/v0.2-md-render.html)。
> 复用浮层暗色背景设计系统;md 元素(标题/列表/代码块/引用)在暗底上适配,代码块用稍浅底(#374151)区分。

### 交互逻辑(差异)
- **流式期间**:`textContainer.textContent` 渐进显示原文 + 光标(保留现有 RAF 体验,不中途渲染半截 md)。
- **`done` 后**:移除光标,将最终译文 `markdown → sanitize → innerHTML`;纯文本渲染为正常段落。
- **错误态**:保留现有错误反馈(`❌` 主行 + 引导次行),不受 md 渲染影响。
- **切换**:流式→done 渲染切换时,若最终 md 与渐进原文一致则无视觉跳变;若 md 结构化则平滑替换。

### 业务约束
- 仅 LLM 源译文可能含 markdown;传统源(google/microsoft)译文为纯文本,渲染为段落。
- sanitize 必须清除:`<script>`、`on*` 事件属性、`javascript:` 链接、`<iframe>`、`<object>`、`<embed>` 等。
- 浮层最大宽 360px,长 md(如大代码块)需可滚动或截断提示。

### 设备适配(差异)
- 浮层宽度自适应选区与内容(沿用设计系统);md 元素在 360px 内换行,代码块横向滚动。

### 可访问性(差异)
- 渲染后 md 使用语义标签(`<h1>`-`<h6>`/`<ul>`/`<ol>`/`<code>`/`<pre>`),读屏可识别结构。
- 代码块等宽字体,暗底浅字对比度满足 AA。
- 不依赖纯颜色区分结构(标题用字号+字重,列表用符号/缩进)。
- 浮层 `aria-live="polite"`(已有)在 done 渲染后播报最终译文。

### 验收补充
- [ ] md 元素语义化(h/ul/ol/code/pre),读屏可识别结构
- [ ] 代码块等宽、横向可滚动
- [ ] 恶意 payload sanitize 单测通过
