# CHANGELOG — Issue #27

## Bug 修复

**fix(#27): 配置自有源点击触发 addProvider 并聚焦名称输入**

- **问题**：默认配置（fresh install，isFallback=true）下，配置页顶部生效源提示行的「配置自有源 →」是纯锚点 `<a href="#source-section">`，源区块默认已在视口内，点击后无可见反应（首屏入口失效，影响新用户上手）。
- **修复**：将锚点改为 `@click.prevent="configureOwnSource"`，新增 `configureOwnSource()` 方法——调用 `addProvider()` 新建提供方卡片，`await nextTick()` 等 DOM 渲染后聚焦末卡片名称输入框（`input.focus()` 自动滚动入视口）。
- **改动文件**：`entrypoints/options/App.vue`（补 nextTick import、新增 configureOwnSource、改锚点模板）。
- **行为**：addProvider 后 activeSourceId 仍是 builtin（新卡片未激活），isFallback 保持 true，横幅正常展示兜底态；聚焦的 name input 有可见 outline（现有 CSS）。
- **验证**：`pnpm typecheck`（vue-tsc --noEmit）无错误；`pnpm build`（wxt build）成功。

## 与 #30（事项7 popup-settings）协调说明

PRD #30 已把 #27 列为验收标准 KR2，计划把配置 UI 从 options 页迁移到 popup 并重做此入口。本次按独立快修在 options 页修复（锚点→触发 addProvider+聚焦），接受事项7 后续可能重做此区域（可能返工）。本次最小改动不阻塞 #30 重构，且与 #30「功能化配置自有源」方向一致。
