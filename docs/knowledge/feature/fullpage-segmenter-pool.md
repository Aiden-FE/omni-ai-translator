---
id: feature:fullpage:segmenter-pool
type: feature
status: active
owner: project
updated: 2026-08-03
confidence: 0.9
sources:
  - shared/fullpage/types.ts
  - shared/fullpage/segmenter.ts
  - shared/fullpage/translate-pool.ts
  - shared/fullpage/renderer.ts
  - assets/fullpage-block.css
  - docs/iterations/v0.4.0/tasks/c81b8f88-6cab-4720-90bb-b75378472d8d/REVIEW.md
related:
  - feature:fullpage:command-channel
  - feature:translator:unified-adapter
  - context:system:plugin-architecture
---

# 全文翻译分段收集器、并发翻译池与双模式渲染器（v0.4.0）

> 以 `shared/fullpage/` 当前代码为准。本模块覆盖全文翻译页面侧基建：t2 分段收集 + 并发翻译池、t3 双模式渲染器。产出库模块供 t5 编排器消费。

## 功能目标

为全文翻译提供页面侧「分段收集 + 并发翻译 + 双模式渲染」基建：

### t2：分段收集器与并发翻译池

1. `collectSegments(root)`：从 DOM 递归遍历提取可翻译文本段（`SegmentRecord`）。
2. `runPool(segments, opts)`：并发受限（默认≤3）翻译池，带会话级缓存与中止支持。
3. `retrySegments(failed, opts)`：重试失败分段，复用 `runPool` 逻辑。

### t3：双模式渲染器

4. `applyReplace(seg)`：替换模式——译文写入 `textNodes[0].data`，其余置空，保留行内子元素结构。
5. `applyBilingual(seg)`：双语模式——创建带 Shadow DOM 的译文块宿主，插入段后/块级祖先后。
6. `markLoading(seg)` / `clearLoadingMark(seg)`：段尾追加/移除幂等加载标记宿主。
7. `markFailed(seg)` / `clearFailedMark(seg)`：段尾追加/移除失败徽标宿主。
8. `switchMode(records, from, to)`：同步切换显示模式（零 API 调用）。
9. `restoreAll(records)`：还原所有文本节点原始 data、移除注入 DOM、重置状态。

渲染器为纯 DOM 操作，不持有翻译状态；状态全部来自 `SegmentRecord`。

## 数据契约

### SegmentRecord

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一标识 = DOM 路径 + 文本哈希（`buildDomPath(el):hashText(text)`） |
| `el` | HTMLElement | 所属元素 |
| `textNodes` | Text[] | 直接子文本节点引用；替换模式将译文写入首节点、其余置空，保留行内子元素结构 |
| `originalText` | string | 直接子文本节点拼接（trim 后） |
| `translatedText?` | string | 译文（翻译成功后写入） |
| `status` | `SegmentStatus` | `pending` / `translating` / `done` / `failed` |
| `errorType?` | string | 仅 `failed` 时存在 |
| `blockHost?` | HTMLElement | 双语模式译文块宿主元素（`applyBilingual` 挂载，`switchMode`/`restoreAll` 移除） |
| `originalTextNodesData?` | string[] | 渲染前各文本节点原始 `data` 快照（含原始空白分布；首次渲染时由渲染器 `captureOriginal` 写入，供逐字节恢复） |
| `loadingMarkHost?` | HTMLElement | 加载标记宿主（`markLoading` 挂载，完成、失败或恢复时移除） |
| `failedMarkHost?` | HTMLElement | 失败标记徽标宿主元素（`markFailed` 挂载，`clearFailedMark`/`restoreAll` 移除） |

### 缓存 key 格式

`` `${targetLang}\u0000${originalText}` ``（NUL 分隔符 `CACHE_SEP = '\u0000'`，避免文本内任意分隔符碰撞）。缓存为会话级 `Map<string, string>`，由 t5 orchestrator 持有（模块级，恢复原文后不清，供再次触发复用）。

## 分段收集器（collectSegments）

### 段定义与嵌套允许

「段」= 自身直接子文本节点拼接（trim 后）非空且含字母（`/\p{L}/u`）的块级/行内元素。

嵌套允许：父段只含自身直接文本（不含子元素内文本），且**无论父元素是否成段，都继续向下递归**。因此遍历对「文本质量不达标」（无字母 / 空 / 非块行内）的元素**不 early-return**，仅跳过该段创建，继续递归子元素。

### 段 ID 唯一性

`id = buildDomPath(el):hashText(text)`：DOM 路径逐层带「同标签兄弟序号」（如 `html[0]/body[0]/p[1]`），保证不同元素路径唯一；文本哈希为确定性 32 位 -> base36。初稿用 `tagName:preview:childCount` 会对重复文本元素（如多个 `<li>item</li>`）碰撞并误去重，已修正为 DOM 路径方案并移除去重逻辑。

> **审查备注（REVIEW.md S6）**：`CODE` 同时存在于 `BLOCK_TAGS` 和 `INLINE_TAGS` 中。`isBlockElement` 先于 `isInlineElement` 检查（`||` 短路），CODE 实际被当作块级处理，功能正确但语义冗余。建议从 `INLINE_TAGS` 中移除 `CODE` 或添加注释说明 `PRE > CODE` 场景下 CODE 作为块级的意图。

### 剪枝规则（整棵子树不递归）

| 剪枝条件 | 实现 | 说明 |
|---|---|---|
| 扩展注入子树 | `shouldSkipElement` / `hasTranslatorAncestor` | 自身或祖先带 `data-llm-translator` 属性 -> 整棵子树不递归 |
| 跳过标签 | `SKIP_TAGS` | SCRIPT / STYLE / NOSCRIPT / TEMPLATE / TEXTAREA / INPUT / SELECT / CANVAS / IFRAME / SVG |
| 不可见 | `isHiddenByDisplay` | `getClientRects().length === 0` 且 `getComputedStyle().display === 'none'`（启发式双重判定） |

### data-llm-translator 排除约定

扩展自身注入的 DOM 子树（如加载标记、译文浮层、双语对照块、失败徽标）以 `data-llm-translator` 属性标记，分段收集时整棵子树排除，防止扩展产物被误收集为翻译段。t3 渲染器所有注入宿主（`blockHost`、`loadingMarkHost`、`failedMarkHost`）均携带该属性。

### jsdom 可见性兼容

jsdom 无布局，`getClientRects` 恒空。采用「`getClientRects` 空 -> 再校验 `getComputedStyle().display === 'none'`」双重判定，避免单测误判全隐藏；另提供 `skipVisibilityCheck` 选项供单测完全跳过可见性检查。

## 并发翻译池（runPool / retrySegments）

### 并发与中止

- 并发上限默认 3：维护进行中 promise 数组，达上限时 `Promise.race` 等一个完成再派发下一段。
- 中止支持：`signal: AbortSignal`（aborted 即停）或 `isActive()`（返回 false 即停），在派发新段前检查，用于「页面恢复原文 / 脚本销毁」场景。
- 缓存命中直接置 `done` + `onSettled` 回调，不发请求。

### 翻译通道复用

逐段翻译复用 `Message` 的 `{ type: 'translate', payload: { text, targetLang } }` 通道（非流式），经 `browser.runtime.sendMessage` 下发。响应按 `TranslateResult` 契约：判 `result.error`（background 返回体字段，非 reject）；`try/catch` 仅兜底 `sendMessage` reject（连接异常），归为 `errorType: 'network'`。

### retrySegments

重置失败段状态（`status -> pending`、清 `errorType` / `translatedText`）后复用 `runPool`，**不清缓存**（已失败 key 可在重试时命中或成功）。

## 双模式渲染器（renderer）

### 设计原则

- **纯 DOM 操作，不持有翻译状态**：所有状态来自 `SegmentRecord`，渲染器只读写 record 字段与 DOM。
- **永不整体覆盖 `seg.el.textContent`**：只改 `textNodes[i].data`，避免摧毁 `<a>`/`<strong>` 等行内子元素结构。
- **译文以 `textContent` 纯文本写入**（非 `innerHTML`）：全文场景译文回填页面，避免 LLM 输出被当 HTML 解析的风险（XSS 防御）。
- **所有注入宿主带 `data-llm-translator`**：t2 分段排除、t5 观察器过滤、恢复清理均依赖此属性。

### 替换模式（applyReplace）

把 `seg.translatedText` 写入 `seg.textNodes[0].data`，其余 `textNodes` 置 `''`。首次调用时 `captureOriginal` 快照各文本节点原始 `data`（含原始空白分布）。无 `translatedText` 时写入空字符串。

### 双语模式（applyBilingual）

1. 移除已有 `blockHost`（重复调用场景，先移旧再挂新）。
2. `captureOriginal` + `restoreTextNodes`：若此前为替换模式，先还原文本节点恢复原文显示。
3. 创建宿主 `div.llm-translator-block-host`（带 `data-llm-translator`），`attachShadow({ mode: 'open' })`，注入 `<style>`（blockCss）+ 译文容器 `div.llm-translator-block-content`（`textContent` 纯文本）。
4. 插入位置：块级段插到 `seg.el` 之后；行内段插到其最近块级祖先（`seg.el.closest(BLOCK_SELECTOR)`）之后。同祖先多段依次堆叠——`insertBlockAfter` 跳过已有连续 `llm-translator-block-host` 宿主，将新块插到最后一个连续块之后，保持堆叠顺序。

> `BLOCK_SELECTOR` 为块级元素 CSS 选择器字符串（与 segmenter 的 `BLOCK_TAGS` 一致），用于 `closest()` 定位行内段的块级祖先。

### 失败标记（markFailed / clearFailedMark）

在段尾追加带 shadow 的小徽标宿主 `div.llm-translator-failed-host`（⚠ + 虚线底边）。双语模式插到 `blockHost` 之后，替换模式插到 `seg.el` 之后。`markFailed` 先清除旧徽标再挂新的；`clearFailedMark` 移除并置 `undefined`，无徽标时不报错。

### 加载标记（markLoading / clearLoadingMark）

`markLoading` 在段尾创建 `div.llm-translator-loading-host[data-llm-translator]`，使用 open Shadow DOM、spinner、`role='status'` 和 `aria-label='正在翻译此段'`。已有且仍连接到 DOM 的宿主会被复用，因而重复调用不会产生多个标记。双语模式下标记插到当前 `blockHost` 之后，其余情况插到段元素之后；不会替换原文或改变段状态。

`clearLoadingMark` 幂等移除宿主并清空 `loadingMarkHost`。`applyReplace`、`applyBilingual`、`markFailed` 与 `restoreAll` 都会先调用它，确保 `done` / `failed` / restore 为终态时没有遗留加载反馈。编排器负责在初始、重试和动态分段进入并发池之前调用 `markLoading`；本模块只管理单段 DOM，不持有任务进度或请求状态。

### 模式切换（switchMode）

同步切换（零 API 调用，返回 `void`），两阶段批量操作全部 records：

| 方向 | 阶段 1 | 阶段 2 |
|---|---|---|
| `replace -> bilingual` | 还原所有文本节点（撤销替换） | 批量挂译文块（仅有 `translatedText` 的段） |
| `bilingual -> replace` | 移除全部 `blockHost` | 写入译文（仅有 `translatedText` 的段） |

`from === to` 时直接返回，不做任何操作。无 `translatedText` 的段（如 `failed`）在切换时不挂译文块/不写译文。

### 全量恢复（restoreAll）

逐字节还原 `textNodes` 原始 `data`（从 `originalTextNodesData` 快照）、移除全部 `blockHost`、`loadingMarkHost` 与 `failedMarkHost`、重置 `status -> pending` / 清 `errorType`。**保留 `translatedText` 缓存值**供再次触发复用。对从未渲染过的段安全（`originalTextNodesData` 为 `undefined` 时跳过还原）。

### 逐字节文本节点恢复

`originalText` 是 trimmed 拼接，丢失了各节点原始空白分布，无法用于逐字节还原。`captureOriginal` 在首次渲染时将 `seg.textNodes.map(tn => tn.data)` 存入 `seg.originalTextNodesData`，`restoreTextNodes` 据此逐节点还原 `data`，确保含原始空白的精确恢复（如 `"text1 "` 与 `" text2"` 各自还原，而非 trim 后拼接）。

### Shadow DOM 隔离与自足样式（核心可复用模式）

**可复用模式**：content script 注入 DOM 走 Shadow DOM + 自足样式（显式重置继承属性规避宿主 CSS 穿透）。

- 译文块与失败徽标均走 `attachShadow({ mode: 'open' })`，宿主页面 CSS 无法穿透 shadow 边界。
- shadow 根内 `<style>` 注入 `assets/fullpage-block.css`（经 `?inline` 导入为字符串），样式自足不依赖继承值。
- **显式重置继承属性**：规避宿主页面继承属性（`color` / `font-family` / `font-size` / `line-height` / `font-weight` 等）穿透 shadow 边界的坑--`.llm-translator-block-content` / `.llm-translator-failed-badge` 上显式声明全部关键继承属性。**审查发现 2 处缺口（REVIEW.md S1/S2，低影响）**：工具栏按钮 `.llm-translator-toolbar-btn` 未设 `font-weight`（全局粗体页面会继承 700）；toolbar 与 block 的 `:host` 未重置 `letter-spacing` / `text-transform` / `white-space`（极端样式页面影响排版美观但不影响可读性）。建议后续在 `:host` 上补 `font-weight: 400; letter-spacing: normal; text-transform: none; white-space: normal;`。
- 译文块视觉：暖底（`hsl(40 60% 96%)`）+ 左侧 teal 竖条（`hsl(174 84% 27%)`）+ 圆角区分；`:host` 默认 `display: block; margin: 6px 0`。
- 失败徽标：`:host(.llm-translator-failed-host)` 设为 `display: inline-block`，行内 `⚠` + 虚线底边，不占整行。
- 后续 content script 注入 DOM 隔离场景可复用此模式。

## 接口依赖

- **消费**：`shared/types.ts`（`TranslateResult`、`DisplayMode`）、`Message` translate 通道、WXT 全局 `browser.runtime.sendMessage`。
- **t2 内部**：`segmenter.ts` 产出 `SegmentRecord` 供 `translate-pool.ts` 翻译、`renderer.ts` 渲染。
- **产出给 t5（编排器）**：
  - t2 接口：`collectSegments` / `runPool` / `retrySegments`、会话级缓存 Map 持有模式、`isActive` / `signal` 中止回调。
  - t3 接口：`applyReplace` / `applyBilingual` / `markLoading` / `clearLoadingMark` / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll`。
  - 数据契约：`SegmentRecord.originalTextNodesData` / `blockHost` / `loadingMarkHost` / `failedMarkHost` 字段（渲染器写入，编排器管理生命周期）。
- **样式资源**：`assets/fullpage-block.css` 经 `?inline` 导入注入 shadow root；`vitest.config.ts` 需 `css: true` 才能在测试中拿到实际 CSS 内容（默认 `css:false` 会 stub 为空串）。

## 来源证据

- `shared/fullpage/types.ts`：`SegmentStatus` / `SegmentRecord`（含 `originalTextNodesData` / `blockHost` / `loadingMarkHost` / `failedMarkHost`）/ `TranslationProgress` / `SegmenterOptions` / `TranslatePoolOptions` / `TranslatePoolResult` 定义。
- `shared/fullpage/segmenter.ts`：`collectSegments`（DOM 路径 ID、Document/Fragment 根、嵌套递归、剪枝、可见性兼容）、`SKIP_TAGS` / `BLOCK_TAGS` / `INLINE_TAGS` 常量。
- `shared/fullpage/translate-pool.ts`：`runPool`（并发≤3、缓存、中止、`TranslateResult` 契约）、`retrySegments`、`CACHE_SEP` 常量。
- `shared/fullpage/renderer.ts`：`applyReplace` / `applyBilingual` / `markLoading` / `clearLoadingMark` / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll` 导出函数；`captureOriginal` / `restoreTextNodes` / `findInsertionRef` / `insertBlockAfter` / `createShadowHost` 内部函数；`BLOCK_SELECTOR` 常量。
- `assets/fullpage-block.css`：`:host` / `:host(.llm-translator-failed-host)` / `.llm-translator-block-content` / `.llm-translator-failed-badge` 自足样式（显式重置继承属性）。
- `shared/fullpage/renderer.test.ts`：499 行单测（jsdom），覆盖替换/双语/失败标记/模式切换/恢复/Shadow DOM 隔离。
