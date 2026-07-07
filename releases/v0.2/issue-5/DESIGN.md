# DESIGN — Issue #5

## 背景与目标

见 PRD.md。核心问题:`shared/llm.ts` 两处 `url` 拼接硬编码 path,与「用户填完整 URL」的预期冲突。

## 技术选型与方案

### 方案对比

- **方案 A(采用):仅去末尾斜杠,直接用完整 URL**
  - `const url = provider.baseUrl.replace(/\/+$/, '');`
  - 移除两处硬拼接 path。改动最小,符合 Issue 期望与验收标准。
  - 风险:存量用户若只填了 host(如 `https://api.openai.com`),升级后请求会打到 `https://api.openai.com`(无 path)而失败。**缓解**:同步把默认示例值改为完整路径,并在 UI 文案明确要求填完整路径;连通性测试失败时返回的错误信息已包含 HTTP 状态与响应体,用户可据此修正。

- **方案 B:自动探测,host 则补 path、完整 URL 则直用**
  - 用正则判断 URL 是否含 path 段,无则补默认 path。
  - 复杂度高、规则模糊(代理网关 path 千差万别),易再次出错。不采用。

- **方案 C:新增 `endpoint` 字段,与 `baseUrl` 并存**
  - 改动面大、迁移成本高,超出 bug 修复范围。不采用。

**最终选择:方案 A** —— 最小改动、可测试、可回滚,与 Issue 验收标准一致。

## 数据结构/模型变更

`shared/types.ts`:`ProviderConfig` 无新增字段,`baseUrl` 语义由「host」改为「完整接口路径」。语义变更在 UI 文案与默认值中体现,无需数据迁移代码(存量配置需用户手动补全 path,UI 文案提示)。

## 接口/实现变更

### `shared/llm.ts`

```ts
// callOpenAICompatible
const url = provider.baseUrl.replace(/\/+$/, '');

// callOllama
const url = provider.baseUrl.replace(/\/+$/, '');
```

其余请求/响应逻辑不变。

### `entrypoints/options/App.vue`

- `addProvider` 默认值:`baseUrl: 'https://api.openai.com'` → `'https://api.openai.com/v1/chat/completions'`(openai-compatible);Ollama 类型默认 `'http://localhost:11434/api/chat'`。
- BaseURL 输入框 placeholder:`'BaseURL'` → `'完整接口路径,如 https://api.openai.com/v1/chat/completions'`。
- 类型为 Ollama 时,placeholder 与默认值相应切换为 Ollama 端点。

### `shared/types.ts`

无需结构变更;`baseUrl` 字段注释补充「完整接口路径」语义。

## 兼容性与风险

- **向后兼容**:存量仅填 host 的配置会失效,需用户补全 path。属可接受的破坏性变更(当前为立项阶段 v0.1/v0.2,用户基数极小),且 UI 文案与默认值同步引导。
- **回滚**:还原 `shared/llm.ts` 两处拼接与 App.vue 默认值/placeholder 即可。

## 测试策略

- `pnpm typecheck`(直接调 `vue-tsc`)通过。
- `pnpm lint`(直接调 `eslint`)通过。
- e2e(若可运行):划词翻译全链路回归。受 worktree `#` 路径编码影响,wxt build 在 worktree 内可能失败;e2e 回归在主仓库或 PR CI 中执行。
