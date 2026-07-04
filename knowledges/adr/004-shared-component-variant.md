# popup 与 options 共享源配置组件采用 variant prop 变体控制

v0.2 功能事项 7 将 `entrypoints/options/App.vue`（约 18KB）的翻译源配置逻辑抽取为共享组件 `shared/ui/SourceConfigPanel.vue`，popup 与 options 共用。popup（400×600、卡片折叠、配置自有源为全宽按钮、底部「打开全部设置」）与 options（全功能页、配置自有源为横幅内锚点）的布局差异通过组件 `variant: 'popup' | 'options'` prop 切换；popup 专属 footer（添加提供方 + 打开全部设置）不放进组件内部，而是留在 `popup/App.vue`（scrollable body 之外），组件通过 `defineExpose` 暴露 `addProvider` / `focusFirst` 供父组件调用，避免 footer 随 body 滚动。

**状态**: accepted

**考虑过的选项**:

| 方案 | 描述 | 结论 |
|------|------|------|
| A. variant prop 变体 | 单组件 + `variant` prop，内部按变体切布局细节 | 采用 — 最小改动、可测试、可回滚，状态/方法/模板单份维护 |
| B. slot 插槽 | 组件提供插槽，父组件填充差异部分 | 否决 — 增加父组件复杂度，差异点分散难维护 |
| C. 拆分两独立组件 | popup / options 各一份组件 | 否决 — 退回双份维护，违背抽取初衷 |

**后果**:

- variant 增多时组件内部条件分支会增长；当前仅 2 个变体，差异点有限，可控。
- 共享组件放置在 `shared/ui/`（与 `shared/storage.ts`、`shared/translator/` 同级），而非新建 `components/` 目录，沿用项目既有 `shared/` 约定。
- 回滚方式：拆分为两个独立组件或还原 `options/App.vue` 旧实现。
