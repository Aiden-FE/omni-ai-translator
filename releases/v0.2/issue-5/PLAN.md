# PLAN — Issue #5

## 执行计划

### 任务清单

- [x] T1: `shared/llm.ts` — `callOpenAICompatible` 改为 `provider.baseUrl.replace(/\/+$/, '')`,移除 `/v1/chat/completions` 拼接;同步更新函数顶部注释
- [x] T2: `shared/llm.ts` — `callOllama` 改为 `provider.baseUrl.replace(/\/+$/, '')`,移除 `/api/chat` 拼接;同步更新函数顶部注释
- [x] T3: `shared/types.ts` — `ProviderConfig.baseUrl` 注释补充「完整接口路径」语义
- [x] T4: `entrypoints/options/App.vue` — `addProvider` 默认 baseUrl 改为完整路径,按 type 区分(openai-compatible: `https://api.openai.com/v1/chat/completions`;ollama: `http://localhost:11434/api/chat`)
- [x] T5: `entrypoints/options/App.vue` — BaseURL 输入框 placeholder 改为「完整接口路径」提示,并按 type 切换示例
- [x] T6: 校验 — typecheck(`./node_modules/.bin/vue-tsc --noEmit`)与 lint(`./node_modules/.bin/eslint . --ext .ts,.vue`)通过
- [x] T7: 审查 — 子 agent 审查实现覆盖 PLAN 全部任务与代码质量(结论:代码 PASS,无引入 bug,无遗漏)

### 依赖关系
T1/T2/T3 独立;T4/T5 同文件顺序执行;T6 依赖 T1-T5;T7 依赖 T6。

### 实施偏差/变更记录
- T5 实施时超出原计划:新增 `onTypeChange(p)`,切换提供方类型时若 baseUrl 命中已知默认值集合(含历史 host 形式 `https://api.openai.com`、`http://localhost:11434`),自动替换为新 type 的完整路径默认值,解决存量配置迁移。已在 DESIGN.md 风险评估范围内,属体验改进。
- T6 校验方式调整:因 worktree 路径含 `#` 导致 `pnpm <script>` 前置 deps check 重跑失败的 install,改为直接调用 `node_modules/.bin/vue-tsc` 与 `node_modules/.bin/eslint`(均 exit 0)。详见 MEMORY.md 环境踩坑。

### 备注
- 不改 entrypoints 结构,`.wxt` 复制快照有效。
- e2e 回归受 worktree `#` 路径编码限制,在 PR CI 执行;本地以 typecheck+lint 为门禁。
