# MEMORY — Issue #28 LLM 源下拉标签误导修复

## BUG 摘要

Issue #28【bug】配置页源类型下拉项「OpenAI 兼容（云端）」「Ollama（本地）」将协议风格与部署位置混为一谈，且 Ollama 本应与 OpenAI 兼容同属「LLM 接口配置」类目却单列，用户配置 LLM 接口时被「云端/本地」字样误导。严重程度：一般。

- 代码位置：`entrypoints/options/App.vue:291-307`（select + 4 个平铺 option）
- 关联 PRD：#4（source-picker-ui）、#6（llm-anthropic-style）
- 里程碑：v0.2 - 翻译源配置闭环

## 技术约束

- select 标签保留 `v-model="p.type"` 和 `@change="onTypeChange(p)"` 不变。
- option 的 `value` 保持不变（`openai-compatible` / `ollama` / `google` / `microsoft`），不影响 `onTypeChange` 逻辑（该函数依据 `p.type` 值做 baseUrl 替换、responseStyle 复位、测试结果清除）。
- 改法：用 `<optgroup label="...">` 分组——「LLM 接口配置」含 openai-compatible / ollama；「传统翻译」含 google / microsoft。去除「（云端）」「（本地）」后缀。
- ollama 默认本地端点（http://localhost:11434）的辅助说明已在 `baseUrlPlaceholder`（App.vue:52-53）体现，下拉标签无需「本地」后缀。
- `ProviderType` 类型（shared/types.ts:7）不涉及改动，纯 UI 文案/结构修复。
- optgroup 是原生 HTML 元素，键盘可达（符合 accessibility.md「设置页所有可操作元素可通过 Tab 聚焦」），label 提供分组语义（符合 accessibility.md「不依赖纯图标传达信息」）。

## 跨任务协调

### 与 #27 同文件协调

#27（改 anchor/method）与本任务同改 `entrypoints/options/App.vue`。#27 已完成（PR #33 未合并），本 worktree 从 master 切出（不含 #27 改动）。#27 改 anchor（约 257 行）和新增 method（约 120 行），本任务改 select 区域（291-307 行），**改动区域不重叠，合并时无冲突**。推荐 #27（PR #33）先于 #28 合并。非代码依赖。

### 与 #30（事项7 popup-settings）协调

PRD #30 已把 #28 列为验收标准 KR3，计划把配置 UI 迁到 popup 并重做该分类（interaction-patterns.md:63 已记录 popup 将用 optgroup 分组「LLM 接口配置/传统翻译」）。用户已决策：**本次按独立快修在 options 页修复，接受事项7 后续可能重做**。本修复采用与 #30 一致的分组方案（LLM 接口配置/传统翻译），即使 #30 重做 popup，分组语义也一致，不会产生矛盾。

## 依赖链元数据

- 并发安全等级：ordered
- MR 基线策略：base-branch（从 master 创建 PR）
- 上游 Issue/MR：无（与 #27 非代码依赖，改区不重叠）
- 基线分支：master
- 推荐合并顺序：#27（PR #33）先于 #28
- Stacked：否
- 依赖契约：无

## 自动决策记录

- **设计批准**：采用 optgroup 分组 + 去后缀方案（Issue 推荐改法），保守默认自动推进。理由：最小改动、value 不变、与 #30 分组方案一致。
- **与 #30 协调决策**：按独立快修在 options 页修复，接受事项7 后续重做。已留痕，不返回 blocked。

## 执行记录

- Step4 完成：编辑 App.vue select（291-307 行），4 个平铺 option 改为 2 个 optgroup（LLM 接口配置 / 传统翻译），去「（云端）」「（本地）」后缀，value 不变。1 file changed, 16 insertions(+), 12 deletions(-)。
- 依赖恢复：worktree 无 node_modules，执行 `pnpm install` 成功。
- typecheck：`pnpm typecheck`（vue-tsc --noEmit）通过，无类型错误。
- commit：`91409d4 fix(#28): LLM 源下拉分组为 LLM 接口配置/传统翻译并去除云端本地后缀 [AICODING]`

## 待沉淀知识

跳过知识沉淀。原因：改动小于 20 行（净增 4 行），纯 UI 文案/结构修复（optgroup 分组 + 去后缀），无新架构决策或技术踩坑；且 PRD #30（事项7 popup-settings）将重做配置 UI 分类，届时再沉淀 optgroup 分组模式更有价值。
