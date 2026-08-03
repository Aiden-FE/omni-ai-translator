# DESIGN: 实现页面分段收集器与带缓存的并发翻译池

> 版本: v0.4.0 | 任务: 490531ee-e42e-4af7-a4b3-e75e3712c1a4

## 1. 目标与范围

为全文翻译落地页面侧「分段收集 + 并发翻译」基建（本任务为 t2，产出库模块，供 t3 渲染器与 t5 编排器消费；本任务不做 DOM 渲染与命令消费）：

1. `shared/fullpage/types.ts`：全文翻译领域类型（分段状态、SegmentRecord、池选项/结果）。
2. `shared/fullpage/segmenter.ts`：`collectSegments(root)` 从 DOM 递归提取可翻译文本段。
3. `shared/fullpage/translate-pool.ts`：`runPool` / `retrySegments` 并发受限翻译池 + 会话级缓存。

**非目标**：DOM 译文渲染（t3）、全文翻译命令消费与编排（t5）、翻译适配层变更。

## 2. 数据契约

### 2.1 SegmentRecord

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 唯一标识 = DOM 路径 + 文本哈希（见 2.3） |
| el | HTMLElement | 所属元素 |
| textNodes | Text[] | 直接子文本节点引用（t3 替换模式：译文写入首节点、其余置空，保留 a/strong 等行内子元素结构） |
| originalText | string | 直接子文本节点拼接（trim 后） |
| translatedText? | string | 译文（成功后写入） |
| status | SegmentStatus | `pending` / `translating` / `done` / `failed` |
| errorType? | string | 仅 `failed` 时存在 |
| blockHost? | HTMLElement | 供 t3 渲染器挂载双语译文块 |

### 2.2 缓存与翻译通道

- 缓存 key = `` `${targetLang}\u0000${originalText}` ``（NUL 分隔，避免文本内任意分隔符碰撞）。
- 缓存为会话级 `Map<string,string>`，由 t5 orchestrator 持有（模块级，恢复原文后不清，供再次触发复用）。
- 翻译复用 `Message` 的 `{ type: 'translate', payload: { text, targetLang } }` 通道（逐段非流式，渐进粒度=段），响应按 `TranslateResult` 契约：判 `result.error`（background 返回体字段，非 reject）。

### 2.3 段 ID 唯一性

`id = buildDomPath(el):hashText(text)`，DOM 路径逐层带「同标签兄弟序号」（如 `html[0]/body[0]/p[1]`），保证不同元素路径唯一；文本哈希为确定性 32 位 -> base36。初稿实现用 `tagName:preview:childCount`，会对重复文本元素（如多个 `<li>item</li>`）碰撞并误去重，已修正为 DOM 路径方案并移除去重逻辑。

## 3. 关键设计决策

### 3.1 段定义与嵌套允许

「段」= 直接子文本节点拼接（trim 后）非空且含字母（`/\p{L}/u`）的块级/行内元素。嵌套允许：父段只含自身直接文本（不含子元素内文本），且**无论父元素是否成段，都继续向下递归**。

因此遍历对「文本质量不达标」（无字母 / 空 / 非块行内）的元素**不 early-return**，仅跳过该段创建，继续递归子元素。初稿对这类元素 early-return，导致 `<div>123<span>real text</span></div>` 丢失 span 段，违反「嵌套允许」，已修正。

### 3.2 剪枝规则（整棵子树不递归）

- 扩展注入子树：自身或祖先带 `data-llm-translator` 属性。
- 跳过标签：SCRIPT / STYLE / NOSCRIPT / TEMPLATE / TEXTAREA / INPUT / SELECT / CANVAS / IFRAME / SVG。
- 不可见：`getClientRects().length === 0` 且 `getComputedStyle().display === 'none'`（启发式，见 3.4）。

以上三类在遍历中 early-return，整棵子树不再递归。其余元素（含 Document / DocumentFragment 根）均向下递归。

### 3.3 并发池与中止

- 并发上限默认 3：维护进行中 promise 数组，达上限时 `Promise.race` 等一个完成再派发下一段。
- 中止支持：`signal: AbortSignal`（aborted 即停）或 `isActive()`（返回 false 即停），在派发新段前检查，用于「页面恢复原文 / 脚本销毁」场景。
- 缓存命中直接置 `done` + 回调，不发请求。
- `retrySegments` 重置失败段状态后复用 `runPool`，不清缓存（已失败 key 可在重试时命中或成功）。

### 3.4 jsdom 可见性兼容

jsdom 无布局，`getClientRects` 恒空。若仅以此判定不可见，单测会把所有元素误判隐藏。故采用「`getClientRects` 空 -> 再校验 `getComputedStyle().display === 'none'`」双重判定；并提供 `skipVisibilityCheck` 选项供单测在需要时完全跳过可见性检查。

## 4. 改动文件

| 文件 | 改动 |
|---|---|
| `shared/fullpage/types.ts` | 新增：SegmentStatus / SegmentRecord / SegmenterOptions / TranslatePoolOptions / TranslatePoolResult |
| `shared/fullpage/segmenter.ts` | 新增：`collectSegments`（DOM 路径 ID、Document/Fragment 根、嵌套递归、剪枝、可见性） |
| `shared/fullpage/translate-pool.ts` | 新增：`runPool` / `retrySegments`（并发≤3、缓存、中止、TranslateResult 契约） |
| `shared/fullpage/segmenter.test.ts` | 新增：31 例（含嵌套/隐藏/脚本/重复文本/Document·Fragment 根/无字母父递归） |
| `shared/fullpage/translate-pool.test.ts` | 新增：11 例（并发≤3、缓存命中、失败收集、中止、重试） |

## 5. 接口依赖

- 消费：`shared/types.ts`（TranslateResult、Message translate 通道）、WXT 全局 `browser.runtime.sendMessage`。
- 产出给 t3：`SegmentRecord.el` / `textNodes` / `blockHost`（渲染挂载）、`data-llm-translator` 排除约定。
- 产出给 t5：`collectSegments` / `runPool` / `retrySegments`、会话级缓存 Map 持有、`isActive` / `signal` 中止回调。

## 6. 风险

| 风险 | 缓解 |
|---|---|
| sendMessage 返回 `{ error }` 非 reject | 按 TranslateResult 契约判 `result.error`，try/catch 仅兜底连接异常 |
| 并发池不可中止致恢复原文后仍写 DOM | `signal` / `isActive` 在派发新段前检查 |
| jsdom `getClientRects` 恒空误判全隐藏 | 双重判定 + `skipVisibilityCheck` 选项 |
| DOM 路径构建 O(n·d) 性能 | v1 可接受；超大页面后续可优化为路径前缀缓存 |
