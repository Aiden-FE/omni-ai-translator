# fix(#27): 配置自有源点击触发 addProvider 并聚焦名称输入

## 变更摘要

默认配置（fresh install，isFallback=true）下，配置页顶部生效源提示行的「配置自有源 →」是纯锚点 `<a href="#source-section">`，源区块默认已在视口内，点击后无可见反应（首屏入口失效，影响新用户上手）。

本次将锚点改为 `@click.prevent="configureOwnSource"`，新增 `configureOwnSource()`：调用 `addProvider()` 新建提供方卡片 → `await nextTick()` 等 DOM 渲染 → 聚焦末卡片名称输入框（`input.focus()` 自动滚动入视口）。

## 影响面

- 改动文件：`entrypoints/options/App.vue`（1 file changed, 12 insertions, 2 deletions）
- 补 `nextTick` import、新增 `configureOwnSource` 方法、改锚点模板（保留 v-if="isFallback"、class、文案）
- addProvider 后 activeSourceId 仍是 builtin（新卡片未激活），isFallback 保持 true，横幅正常展示兜底态
- 聚焦的 name input 有可见 outline（现有 CSS `input:focus { outline: 2px solid #1f2937; }`）
- 无新依赖、无类型变更、无存储契约变更

## 回滚方案

还原锚点：将模板改回 `<a v-if="isFallback" class="effective__action" href="#source-section">配置自有源 →</a>`，删除 `configureOwnSource` 方法与 `nextTick` import。回滚无副作用。

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #4 (source-picker-ui) |
| PRD 文档 | `releases/v0.2/4-source-picker-ui/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| DESIGN | `releases/v0.2/issue-27/DESIGN.md` |
| PLAN | `releases/v0.2/issue-27/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-27/CHANGELOG.md` |
| 验收标准 | 见 `releases/v0.2/issue-27/PRD.md` AC1-AC6：点击有反应、新建并聚焦、滚动入视口、横幅状态不变、聚焦可见、向后兼容 |
| UX 规范 | `knowledges/ux/interaction-patterns.md`（设置页翻译源管理）、`knowledges/ux/accessibility.md`（键盘聚焦、聚焦可见） |
| 视觉原型 | `knowledges/ux/prototypes/v0.2-source-picker.html`（配置页翻译源选择 UI，兜底/自有源两态） |
| 知识沉淀 | context: 无; adr: 无; feature: 无（跳过，改动<20行、临时修复、#30 popup 重构将重做此区域）; runbook: 无 |
| 并发安全等级 | parallel-safe（与 #29 并行，不同文件） |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无 |
| 基线分支 | master |
| 推荐合并顺序 | #27 先于 #28 合并（同文件 App.vue，减少 #28 冲突） |
| Stacked MR | 否 |
| 依赖契约或接口文档 | 无 |

Closes #27
