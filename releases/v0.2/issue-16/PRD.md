# PRD — 配置页翻译源选择 UI 改造（#16）

| 项 | 内容 |
|---|---|
| ISSUE_ID | #16 |
| 所属 PRD Issue | #4（source-picker-ui） |
| 迭代版本 | v0.2 |
| 改动范围 | 前端（`entrypoints/options/App.vue`） |
| 关联 PRD 文档 | `releases/v0.2/4-source-picker-ui/PRD.md` |

## 1. 需求来源

完整 PRD 已由 prodflow-prd 产出，见 `releases/v0.2/4-source-picker-ui/PRD.md`。本文档不重写 PRD，仅引用并补充 Issue #16 范围澄清与无人值守自动决策结论。

## 2. 核心需求（引用 PRD #4）

把 v0.1 仅面向 LLM 的配置页升级为多类源（LLM、传统 API Key、免 Key 兜底）统一管理界面：

1. 分区标题「LLM 提供方」→「翻译源管理」；移除「本插件不内置任何模型接口」旧提示，改为「未配置时使用免 Key 兜底翻译；配置自有源后覆盖兜底」。
2. 源类型下拉扩展为 4 项：openai-compatible / ollama / google / microsoft。
3. 条件字段渲染：LLM 类型（openai-compatible/ollama）显示 name/baseUrl/model/apiKey；传统类型（google/microsoft）显示 name/baseUrl/apiKey，不显示 model。
4. apiKey placeholder 明示「留空使用免 Key 兜底；填入则走官方 API」（传统源）；LLM 源保持「API Key（Ollama 可留空）」。
5. 顶部新增「当前生效源」提示行：用新契约 `get-active-sources` / `set-active-source` 读写；兜底生效时明示「免 Key 兜底（文本外传到 Google/微软）」+ 隐私提示 + 引导配置自有源；启用自有源后切换为该源名称，兜底提示消失。
6. 连通性测试扩展：对 LLM、传统 API Key、免 Key 兜底源均生效，复用 `test-provider` 通道，结果 inline 展示（✅ 译文 / ❌ 错误）。

## 3. 不包含（引用 Issue #16）

- 传统 API Key 源「有 Key 走官方 API」后端实现（属 PRD #3）。
- 多源优先级拖拽排序（v0.3+）、源用量统计、popup 切源。

## 4. 验收标准（引用 Issue #16 + PRD #4）

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 源类型选择 | 下拉含 4 项，按类型条件渲染字段（LLM 有 model，传统源无 model） | P0 |
| 生效源展示 | 顶部生效源提示行可见：兜底状态明示外传去向 + 引导；启用自有源后切换为该源名称 | P0 |
| 连通性测试 | 对 LLM、传统 API Key、免 Key 兜底源均生效，结果 inline 展示 | P0 |
| 文案更新 | 旧「不内置任何模型接口」提示已移除，替换为兜底关系说明 | P0 |
| 向后兼容 | v0.1 既有 LLM 配置可见可编辑（回归） | P0 |
| 可访问性 | 兜底态隐私提示对比度满足 WCAG AA；提示行用文字 + 语义标签（非纯颜色）表达状态 | P0 |

## 5. 澄清与自动决策（无人值守）

完整自动决策见 `MEMORY.md`「自动决策记录」。关键澄清：

- 添加按钮文案保持「+ 添加提供方」（e2e 依赖，Issue 未要求改）。
- 兜底态横幅含「测试连通」按钮，对当前生效的内置免 Key 源测试（内置源无卡片）。
- 点击已激活自有源「已启用」按钮可回到兜底（避免死路）。
- 传统源 baseUrl/apiKey 为 UI 信息展示，「有 Key 走官方 API」后端属 PRD #3，本轮测试实际走免 Key 端点。
