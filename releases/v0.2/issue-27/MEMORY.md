# MEMORY — Issue #27 配置自有源点击无反应

| 项 | 内容 |
|---|---|
| Issue | #27 【AI】【bug】配置页 - 默认配置下「配置自有源」点击无反应 |
| 类型 | BUG；严重程度：一般 |
| 关联 PRD | #4 (source-picker-ui) |
| 迭代版本 | v0.2 |
| 仓库 / 基础分支 | Aiden-FE/llm-translator / master |
| 任务分支 | issue-27 |
| worktree | .worktrees/master-issue-27 |
| 并发安全 | parallel-safe（与 #29 并行，不同文件）；推荐合并顺序 #27 先于 #28（同文件 App.vue，减少冲突） |
| MR 基线 | base-branch（base=master） |
| 上游 Issue/MR | 无 |

## BUG 摘要

默认配置（fresh install，providers 为空，生效源 builtin:microsoft 兜底，isFallback=true）下，配置页顶部生效源提示行的「配置自有源 →」是纯锚点 `<a href="#source-section">`。源区块 `#source-section` 默认已在视口内，点击后无可见反应（首屏入口失效，影响新用户上手）。workaround：手动滚动到「翻译源管理」点「+ 添加提供方」。

## 技术约束

- 文件：`entrypoints/options/App.vue`
- 锚点位置：约 257-261 行 `<a v-if="isFallback" class="effective__action" href="#source-section">配置自有源 →</a>`
- `addProvider()`（约 120-131 行）：在 `providers.value` 末尾 push 新卡片（name='新提供方', type='openai-compatible', baseUrl=默认, apiKey='', model='gpt-4o-mini'）后 `await saveProviders()`。addProvider 后 activeSourceId 仍是 builtin（新卡片未激活），isFallback 保持 true，横幅正常。
- provider 卡片在 `v-for="p in providers"` 内，`class="provider-card"`；卡片内第一个 input 是名称输入 `<input v-model="p.name" placeholder="名称" @change="saveProviders">`。
- script setup 顶部 import（第 5 行）：`import { ref, computed, onMounted } from 'vue';` —— 需补 `nextTick`。
- 修复方案：将锚点改为 `@click.prevent="configureOwnSource"`，新增 `configureOwnSource()`：调 `addProvider()` → `await nextTick()` → 聚焦最后一个 `.provider-card` 的首个 input（focus 会自动滚动入视口）。
- 现有 CSS 已有 `input:focus { outline: 2px solid #1f2937; outline-offset: 1px; border-color: #1f2937; }`，聚焦可见性满足可访问性要求。

## 依赖链元数据

- 依赖 PRD #4（source-picker-ui）已落档；本次为独立 BUG 快修，不改动 PRD。
- addProvider/saveProviders 复用 `@/shared/storage`（getProviders/setProviders）与 `get-active-sources` 消息契约，无新底层依赖。

## 与 #30（事项7 popup-settings）协调决策

PRD #30（事项7 popup-settings，今日刚落档）已把 #27 列为验收标准 KR2，计划把配置 UI 从 options 页迁移到 popup 并重做此入口（「功能化配置自有源」）。

**用户决策（自动留痕）**：本次按独立快修在 options 页修复（锚点→触发 addProvider+聚焦），接受事项7 后续可能重做此区域（可能的返工）。理由：BUG 影响新用户上手需尽快修复；popup 重构尚未动工，等待重构会延长 BUG 存活期；本次最小改动不影响 #30 后续重构。

## 自动决策记录

- **修复方案选择**：采用 Issue 首选方案（点击→自动新建提供方卡片并聚焦名称输入），而非「滚动+高亮+ 添加提供方按钮」。理由：直接新建卡片更贴合「发起自有源配置」的期望，减少用户操作步骤；与 #30 popup 原型「功能化配置自有源」方向一致。
- **聚焦实现**：用 `document.querySelectorAll('.provider-card')` 取末卡片 input.focus()，而非 Vue template ref。理由：最小改动（无需改模板加 ref 绑定），且 addProvider 总在末尾 push，取末卡片可靠。
- **元素形态**：保留 `<a>` 标签 + `@click.prevent`，不改 `<button>`。理由：保持显示形态与现有样式（.effective__action）一致，最小改动。

## 执行记录（Step4）

- 改动文件：`entrypoints/options/App.vue`（1 file changed, 12 insertions, 2 deletions）。
- commit：`b109889 fix(#27): 配置自有源点击触发 addProvider 并聚焦名称输入 [AICODING]`。
- 依赖恢复：worktree 无 node_modules，`pnpm install` 成功（postinstall wxt prepare 通过）。
- 验证：`pnpm typecheck`（vue-tsc --noEmit）无错误；`pnpm build`（wxt build）成功，产物 chrome-mv3 正常。
- 逻辑用例（代码审查）：addProvider 在 providers 末尾 push → nextTick 后 DOM 更新 → querySelectorAll('.provider-card') 取末卡片 → querySelector('input') 聚焦 name 输入 → focus 自动滚动入视口；addProvider 未调 activate，activeSourceId 仍 builtin，isFallback 保持 true，横幅正常。

## 待沉淀知识

**评估**：跳过独立知识文档。原因：改动 < 20 行（约 10 行净增）、属交互修复、且 #30 popup 重构将重做此区域（临时性）。

**可复用要点（供后续参考，不单独成档）**：
- 交互模式：empty-state CTA（兜底态「配置自有源」）→ 点击即 auto-create 实体（provider 卡片）+ focus 首字段（name input），比「滚动+高亮按钮」更贴合「发起配置」期望。
- Vue 实现：reactive push 后 `await nextTick()` 再 `querySelectorAll` 取末元素聚焦；`input.focus()` 原生滚动入视口，无需额外 scrollIntoView。
- 该模式已与 #30 popup 原型「功能化配置自有源」方向对齐，#30 重构时可复用此交互语义。
