# PLAN — Issue #28 执行计划

## 任务清单

- [x] 编辑 `entrypoints/options/App.vue` select（约 291-307 行）：4 个平铺 option 改为 optgroup 分组（LLM 接口配置 / 传统翻译），去除「（云端）」「（本地）」后缀，value 不变
- [x] 运行 `pnpm typecheck`（vue-tsc --noEmit）确认无类型错误
- [x] 代码审查：确认 optgroup 分组语义清晰、value 未变、onTypeChange 逻辑不受影响
- [x] 提交代码：`fix(#28): LLM 源下拉分组为 LLM 接口配置/传统翻译并去除云端本地后缀 [AICODING]`

## 后续步骤（由 Step5/Step6 覆盖，独立验证）

- Step5：写 CHANGELOG.md、自审
- Step6：提交迭代文档并推送、创建 PR（base=master，head=issue-28，body 含 Closes #28 + 审查上下文）
