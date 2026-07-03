# DESIGN — Issue #27 配置自有源点击无反应

| 项 | 内容 |
|---|---|
| Issue | #27 |
| 文件 | `entrypoints/options/App.vue` |
| 关联 PRD | #4 (source-picker-ui) |

## 1. 背景

默认配置下顶部生效源提示行的「配置自有源 →」是纯锚点 `<a href="#source-section">`。源区块默认已在视口内，锚点跳转无可见位移，用户感知「点击无反应」。

## 2. 方案

将锚点改为触发 `configureOwnSource()`：调用现有 `addProvider()` 新建提供方卡片 → `await nextTick()` 等 DOM 渲染 → 聚焦最后一个 `.provider-card` 的首个 input（名称输入）。`input.focus()` 会自动将元素滚动入视口。

### 2.1 改动点

1. **import 补 nextTick**：`import { ref, computed, onMounted, nextTick } from 'vue';`
2. **新增 configureOwnSource()**：
   ```js
   async function configureOwnSource() {
     await addProvider();
     await nextTick();
     const cards = document.querySelectorAll('.provider-card');
     const last = cards[cards.length - 1];
     last?.querySelector('input')?.focus();
   }
   ```
3. **模板**：`<a v-if="isFallback" class="effective__action" href="#" @click.prevent="configureOwnSource">配置自有源 →</a>`（保留 v-if、class、显示文案）。

### 2.2 行为正确性

- `addProvider()` 在 `providers.value` 末尾 push 新卡片后 `await saveProviders()`，新卡片出现在源区块末尾。
- addProvider 后 activeSourceId 仍是 builtin（新卡片未激活），isFallback 保持 true，横幅正常展示兜底态（满足 AC4）。
- `nextTick` 确保 Vue 完成 DOM 更新后再查询 `.provider-card`，取末卡片（即新建卡片）的 name input 聚焦。
- `input.focus()` 浏览器原生行为：自动滚动元素入视口（满足 AC3）。

## 3. 最小改动

仅改 `entrypoints/options/App.vue` 一个文件：补 1 个 import、新增 1 个方法、改 1 行模板。无新依赖、无类型变更、无存储契约变更。

## 4. 回滚方案

还原锚点：将模板改回 `<a v-if="isFallback" class="effective__action" href="#source-section">配置自有源 →</a>`，删除 configureOwnSource 方法与 nextTick import。回滚无副作用。

## 5. 与 #30（事项7 popup-settings）关系

PRD #30 已把 #27 列为验收标准 KR2，计划把配置 UI 从 options 页迁移到 popup 并重做此入口。本次按独立快修在 options 页修复，接受事项7 后续可能重做此区域（可能返工）。本次最小改动不阻塞 #30 重构。

## UX 与视觉实现

### 交互规范（来源 knowledges/ux）

- `knowledges/ux/interaction-patterns.md`：设置页翻译源管理——兜底态横幅含「配置自有源 →」引导；本次将其由「锚点引导」升级为「功能化入口」（点击即新建卡片+聚焦），与 #30 popup 原型「功能化配置自有源」方向一致。
- `knowledges/ux/accessibility.md`：设置页所有可操作元素可通过 Tab 聚焦与操作；不依赖纯图标传达信息，关键状态有文字说明。本次点击后聚焦 name input，符合键盘可达与聚焦可见要求。

### 点击反馈与聚焦可见性

- 点击「配置自有源 →」：`@click.prevent` 阻止默认锚点跳转，触发 configureOwnSource。
- 聚焦可见：现有 CSS `input:focus, select:focus { outline: 2px solid #1f2937; outline-offset: 1px; border-color: #1f2937; }` 已提供清晰 focus-visible 样式，满足 WCAG AA 聚焦可见性（满足 AC5）。
- 悬停反馈：现有 `.effective__action:hover { text-decoration: underline; }` 保留，锚点悬停有下划线反馈。
- 滚动入视口：`input.focus()` 原生滚动行为，无需额外动画；尊重 `@media (prefers-reduced-motion: reduce)`（现有 CSS 已全局禁用 transition）。

### 视觉原型

- 参照 `knowledges/ux/prototypes/v0.2-source-picker.html`（配置页翻译源选择 UI，兜底/自有源两态）。
- 本次不改视觉，沿用现有 `.effective__action` 与 `.provider-card` 样式。

### 可访问性

- 保留 `<a>` 语义标签（带 href="#"），键盘可 Tab 聚焦、Enter 触发。
- 聚焦目标（name input）有可见 outline，屏幕阅读器可识别输入用途（placeholder="名称"）。
