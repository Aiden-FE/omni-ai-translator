# CHANGELOG: 实现替换/双语双模式渲染器与 Shadow DOM 译文块隔离

> 版本: v0.4.0 | 任务: 3ecb43bc-3eff-4323-96f2-eea84cb6dc48

## 变更内容

### 新增

- `shared/fullpage/renderer.ts`（208 行）：全文翻译双模式渲染器。纯 DOM 操作，不持有翻译状态；提供 `applyReplace` / `applyBilingual` / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll` 六个导出函数。
- `assets/fullpage-block.css`（44 行）：Shadow DOM 内自足样式。显式重置 `color` / `font-family` / `font-size` / `line-height` 等继承属性规避宿主 CSS 穿透；暖底 + teal 竖条译文块、⚠ 虚线底边失败徽标。
- `shared/fullpage/renderer.test.ts`（499 行）：jsdom 单测，覆盖替换/双语/失败标记/模式切换/恢复/Shadow DOM 隔离全路径。
- `shared/fullpage/types.ts`：`SegmentRecord` 新增 `originalTextNodesData?: string[]`（原始 data 快照，供逐字节恢复）与 `failedMarkHost?: HTMLElement`（失败徽标宿主）字段。

### 修改

- `vitest.config.ts`：启用 `css: true`，使 `renderer.ts` 以 `?inline` 导入的 `fullpage-block.css` 在测试中获取实际 CSS 内容（默认 `css:false` stub 为空串）。

## 设计要点

- **永不整体覆盖 `seg.el.textContent`**：替换模式只改 `textNodes[i].data`，保留 `<a>`/`<strong>` 等行内子元素结构。
- **译文以 `textContent` 纯文本写入**（非 `innerHTML`）：避免 LLM 输出被当 HTML 解析的 XSS 风险。
- **逐字节文本节点恢复**：`originalText` 为 trimmed 拼接，丢失原始空白分布；`captureOriginal` 快照各节点原始 `data`（含空白），`restoreTextNodes` 据此精确还原。
- **Shadow DOM 隔离**：译文块与失败徽标走 `attachShadow({ mode: 'open' })`，shadow 内 `<style>` 自足；显式重置继承属性规避宿主页面 CSS 穿透 shadow 边界。
- **同步模式切换**：`switchMode` 零 API 调用，两阶段批量操作（先还原/移除，再重新渲染）。
- **`data-llm-translator` 排除约定**：所有注入宿主均带该属性，t2 分段收集整棵子树排除。

## 知识沉淀（project_lead · knowledge_deposition）

### 更新的长期知识

| 知识 ID | 类型 | 文件 | 变更摘要 |
|---|---|---|---|
| `feature:fullpage:segmenter-pool` | feature | `docs/knowledge/feature/fullpage-segmenter-pool.md` | 扩展为覆盖 t3 双模式渲染器：新增「双模式渲染器（renderer）」章节（设计原则、applyReplace/applyBilingual/markFailed/switchMode/restoreAll 接口、逐字节文本节点恢复机制、Shadow DOM 隔离与自足样式核心可复用模式）；`SegmentRecord` 契约表补充 `originalTextNodesData` / `failedMarkHost` 字段；`sources` 新增 `renderer.ts` / `fullpage-block.css`；接口依赖更新为产出 t3 接口供 t5 消费 |

### 索引同步

- `docs/knowledge/feature/index.md`（`feature:index`）：`feature:fullpage:segmenter-pool` 描述更新，纳入双模式渲染器与 Shadow DOM 隔离。
- `docs/knowledge/index.md`（`context:root`）：知识清单条目不变（复用既有 ID `feature:fullpage:segmenter-pool`，无新增条目），无需修改。

### 候选映射与复用场景

| 审查候选 | 类型 | 映射知识 ID | 复用场景 |
|---|---|---|---|
| #0 全文翻译双模式渲染器（t3）：Shadow DOM 译文块隔离模式 + 替换/双语双模式渲染 + 逐字节文本节点恢复 + 同步模式切换 | feature | `feature:fullpage:segmenter-pool` | 后续实现 t5 编排器（命令消费 + 渐进渲染 + 动态内容增量翻译）时需消费 renderer 的 `applyReplace`/`applyBilingual`/`switchMode`/`restoreAll` 接口与 `SegmentRecord.originalTextNodesData`/`blockHost`/`failedMarkHost` 字段；后续 content script 注入 DOM 隔离场景可复用 Shadow DOM 自足样式模式（显式重置继承属性规避宿主 CSS 穿透 + `data-llm-translator` 属性标记排除约定） |
