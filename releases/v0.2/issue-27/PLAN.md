# PLAN — Issue #27 配置自有源点击无反应

| 项 | 内容 |
|---|---|
| Issue | #27 |
| 文件 | `entrypoints/options/App.vue` |

## 执行清单

- [x] 补 nextTick import：`import { ref, computed, onMounted, nextTick } from 'vue';`
- [x] 新增 `configureOwnSource()` 方法：调 addProvider → nextTick → 聚焦末卡片首个 input
- [x] 模板：将 `<a href="#source-section">` 改为 `<a href="#" @click.prevent="configureOwnSource">`（保留 v-if="isFallback"、class、文案）
- [x] 构建/类型检查通过（pnpm typecheck + pnpm build 均通过）
- [x] 逻辑用例验证：默认配置 isFallback 下点击 → 新建 provider 卡片 + name input 聚焦 + 滚动入视口；横幅仍兜底态
- [x] 提交代码：`fix(#27): 配置自有源点击触发 addProvider 并聚焦名称输入 [AICODING]`
