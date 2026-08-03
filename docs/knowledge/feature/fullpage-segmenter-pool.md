---
id: feature:fullpage:segmenter-pool
type: feature
status: active
owner: project
updated: 2026-07-30
confidence: 0.9
sources:
  - shared/fullpage/types.ts
  - shared/fullpage/segmenter.ts
  - shared/fullpage/translate-pool.ts
related:
  - feature:fullpage:command-channel
  - feature:translator:unified-adapter
  - context:system:plugin-architecture
---

# 全文翻译分段收集器与并发翻译池（v0.4.0）

> 以 `shared/fullpage/` 当前代码为准。本模块为全文翻译页面侧基建（t2），产出库模块供 t3 渲染器与 t5 编排器消费；本模块不做 DOM 渲染与命令消费。

## 功能目标

为全文翻译提供页面侧「分段收集 + 并发翻译」基建：

1. `collectSegments(root)`：从 DOM 递归遍历提取可翻译文本段（`SegmentRecord`）。
2. `runPool(segments, opts)`：并发受限（默认≤3）翻译池，带会话级缓存与中止支持。
3. `retrySegments(failed, opts)`：重试失败分段，复用 `runPool` 逻辑。

## 数据契约

### SegmentRecord

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一标识 = DOM 路径 + 文本哈希（`buildDomPath(el):hashText(text)`） |
| `el` | HTMLElement | 所属元素 |
| `textNodes` | Text[] | 直接子文本节点引用；t3 替换模式将译文写入首节点、其余置空，保留行内子元素结构 |
| `originalText` | string | 直接子文本节点拼接（trim 后） |
| `translatedText?` | string | 译文（翻译成功后写入） |
| `status` | `SegmentStatus` | `pending` / `translating` / `done` / `failed` |
| `errorType?` | string | 仅 `failed` 时存在 |
| `blockHost?` | HTMLElement | 供 t3 渲染器挂载双语译文块的 host 元素 |

### 缓存 key 格式

`` `${targetLang}\u0000${originalText}` ``（NUL 分隔符 `CACHE_SEP = '\u0000'`，避免文本内任意分隔符碰撞）。缓存为会话级 `Map<string, string>`，由 t5 orchestrator 持有（模块级，恢复原文后不清，供再次触发复用）。

## 分段收集器（collectSegments）

### 段定义与嵌套允许

「段」= 自身直接子文本节点拼接（trim 后）非空且含字母（`/\p{L}/u`）的块级/行内元素。

嵌套允许：父段只含自身直接文本（不含子元素内文本），且**无论父元素是否成段，都继续向下递归**。因此遍历对「文本质量不达标」（无字母 / 空 / 非块行内）的元素**不 early-return**，仅跳过该段创建，继续递归子元素。

### 段 ID 唯一性

`id = buildDomPath(el):hashText(text)`：DOM 路径逐层带「同标签兄弟序号」（如 `html[0]/body[0]/p[1]`），保证不同元素路径唯一；文本哈希为确定性 32 位 → base36。初稿用 `tagName:preview:childCount` 会对重复文本元素（如多个 `<li>item</li>`）碰撞并误去重，已修正为 DOM 路径方案并移除去重逻辑。

### 剪枝规则（整棵子树不递归）

| 剪枝条件 | 实现 | 说明 |
|---|---|---|
| 扩展注入子树 | `shouldSkipElement` / `hasTranslatorAncestor` | 自身或祖先带 `data-llm-translator` 属性 → 整棵子树不递归 |
| 跳过标签 | `SKIP_TAGS` | SCRIPT / STYLE / NOSCRIPT / TEMPLATE / TEXTAREA / INPUT / SELECT / CANVAS / IFRAME / SVG |
| 不可见 | `isHiddenByDisplay` | `getClientRects().length === 0` 且 `getComputedStyle().display === 'none'`（启发式双重判定） |

### data-llm-translator 排除约定

扩展自身注入的 DOM 子树（如译文浮层、双语对照块）以 `data-llm-translator` 属性标记，分段收集时整棵子树排除，防止扩展产物被误收集为翻译段。t3 渲染器挂载译文时必须携带该属性。

### jsdom 可见性兼容

jsdom 无布局，`getClientRects` 恒空。采用「`getClientRects` 空 → 再校验 `getComputedStyle().display === 'none'`」双重判定，避免单测误判全隐藏；另提供 `skipVisibilityCheck` 选项供单测完全跳过可见性检查。

## 并发翻译池（runPool / retrySegments）

### 并发与中止

- 并发上限默认 3：维护进行中 promise 数组，达上限时 `Promise.race` 等一个完成再派发下一段。
- 中止支持：`signal: AbortSignal`（aborted 即停）或 `isActive()`（返回 false 即停），在派发新段前检查，用于「页面恢复原文 / 脚本销毁」场景。
- 缓存命中直接置 `done` + `onSettled` 回调，不发请求。

### 翻译通道复用

逐段翻译复用 `Message` 的 `{ type: 'translate', payload: { text, targetLang } }` 通道（非流式），经 `browser.runtime.sendMessage` 下发。响应按 `TranslateResult` 契约：判 `result.error`（background 返回体字段，非 reject）；`try/catch` 仅兜底 `sendMessage` reject（连接异常），归为 `errorType: 'network'`。

### retrySegments

重置失败段状态（`status → pending`、清 `errorType` / `translatedText`）后复用 `runPool`，**不清缓存**（已失败 key 可在重试时命中或成功）。

## 接口依赖

- **消费**：`shared/types.ts`（`TranslateResult`）、`Message` translate 通道、WXT 全局 `browser.runtime.sendMessage`。
- **产出给 t3（渲染器）**：`SegmentRecord.el` / `textNodes` / `blockHost`（渲染挂载）、`data-llm-translator` 排除约定。
- **产出给 t5（编排器）**：`collectSegments` / `runPool` / `retrySegments`、会话级缓存 Map 持有模式、`isActive` / `signal` 中止回调。

## 来源证据

- `shared/fullpage/types.ts`：`SegmentStatus` / `SegmentRecord` / `SegmenterOptions` / `TranslatePoolOptions` / `TranslatePoolResult` 定义。
- `shared/fullpage/segmenter.ts`：`collectSegments`（DOM 路径 ID、Document/Fragment 根、嵌套递归、剪枝、可见性兼容）、`SKIP_TAGS` / `BLOCK_TAGS` / `INLINE_TAGS` 常量。
- `shared/fullpage/translate-pool.ts`：`runPool`（并发≤3、缓存、中止、`TranslateResult` 契约）、`retrySegments`、`CACHE_SEP` 常量。
