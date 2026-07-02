# PLAN — 配置页翻译源选择 UI 改造执行计划（#16）

## 任务清单

- [x] 1. 改造 `entrypoints/options/App.vue` script：引入 `sendMessage` 类型化封装；新增 `activeSourceId`/`allSources`/`bannerTestMsg`/`testMsgs` 响应式状态；`onMounted` 改为先 `get-active-sources` 再 `getProviders`/`getSettings`
- [x] 2. 重写 `activate(id)`：经 `set-active-source` 消息切换；已激活自有源再次点击 → 回 `builtin:microsoft`；完成后 reload `get-active-sources`
- [x] 3. 拆分保存：`saveProviders()`（setProviders + reload）+ `saveTargetLang()`（read-merge setSettings）；provider 字段编辑调 `saveProviders`，目标语言调 `saveTargetLang`
- [x] 4. 扩展 `DEFAULT_BASE_URL`/`KNOWN_DEFAULT_BASE_URLS` 为 4 类型（google/microsoft 默认官方端点）；`onTypeChange` 命中替换
- [x] 5. `testProvider(p)` 改为写 `testMsgs[p.id]`；新增 `testBuiltin()` 测试横幅当前内置源，写 `bannerTestMsg`
- [x] 6. 模板：分区标题「LLM 提供方」→「翻译源管理」；旧提示替换为「未配置时使用免 Key 兜底翻译；配置自有源后覆盖兜底」
- [x] 7. 模板：顶部新增 `effective` 横幅（兜底态/自有源态两态），含隐私提示、引导、兜底态测试连通按钮
- [x] 8. 模板：类型下拉扩展 4 项；model 行 `v-if="isLlmType(p.type)"`；apiKey placeholder 按类型；每卡 inline 测试消息
- [x] 9. 样式：补横幅 `.effective` 两态、`data-state` 语义、隐私提示 `#4b5563`、`prefers-reduced-motion`；沿用设计 token
- [x] 10. 保持 e2e 选择器不变（`+ 添加提供方`/`.provider-card`/`名称`/`base-url` testid/`模型名`/`启用`/`留空则使用浏览器首选语言`）
- [x] 11. 运行 `pnpm typecheck` 通过
- [x] 12. 运行 `pnpm build` 通过
- [x] 13. 运行 `pnpm test`（vitest 单测）回归通过（71 passed）
- [x] 14. 自审：对照验收要点逐项核对 UI 逻辑（兜底态/自有源态/条件字段/连通性测试/文案/兼容/可访问性）

## 执行偏差与补充

- 审查子 agent 发现「删除当前生效源时横幅短暂停留在已删除源」的轻微时序问题，已修复：`removeProvider` 改为先 `set-active-source('builtin:microsoft')` 再过滤保存，消除闪烁。
- `onTypeChange` 增加清除该卡旧测试结果（类型变更后旧结果失效）。
- 其余实现与 DESIGN.md 一致，无偏差。

## 依赖与优先级

- 全部任务集中单文件 `App.vue`，顺序执行 1→10（脚本→模板→样式），再 11→14 验证。
- 优先级均 P0；复杂度：中（单文件但状态/模板分支较多）。
