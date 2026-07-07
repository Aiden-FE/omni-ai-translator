# MEMORY — Issue #22 LLM 适配层 anthropic 响应风格支持

| 项 | 内容 |
|---|---|
| ISSUE_ID | #22 |
| 版本 | v0.2 |
| 项目 | llm-translator (git@github.com:Aiden-FE/llm-translator.git) |
| 基础分支 | master |
| 任务 worktree | /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-22 |
| PRD Issue | #6 |
| PRD 文档 | releases/v0.2/5-llm-anthropic-style/PRD.md |
| 迭代主文档 | releases/v0.2/index.md |
| ADR-001 | knowledges/adr/001-unified-translator-adapter-layer.md |
| 执行模式 | 无人值守（默认自动决策并留痕） |

## PRD 摘要

为 LLM 适配层新增「响应风格」维度：`ProviderConfig` 增加可选字段 `responseStyle: 'openai' | 'anthropic'`（默认 openai，向后兼容），使原生 Anthropic Messages API 端点（Claude 官方或 Anthropic 兼容代理）可作为 OpenAI 兼容源的一种风格直接配置。不影响既有 openai 风格、传统源、免 Key 兜底源。

## 关键业务规则与技术约束

1. **responseStyle 仅对 openai-compatible 类型有意义**；ollama 固定走 callOllama，google/microsoft 传统源不受影响。缺省按 openai（向后兼容，存量配置无需迁移）。
2. **anthropic 风格请求规范**：
   - 请求头：`x-api-key: <apiKey>`（非 Bearer）、`anthropic-version: 2023-06-01`、`Content-Type: application/json`
   - 请求体：`{ model, max_tokens, system: <翻译指令>, messages: [{role:'user', content: <原文>}], temperature: 0.3 }`
   - 响应解析：`data.content[0].text`
3. **错误归一化**：失败仍经 `classifyError` 归一化为四类 errorType（429→rate-limit，4xx/5xx→unreachable，fetch 异常→network），不新增错误类型。
4. **baseUrl 沿用 #5 修复**：用户填完整路径，代码仅去尾斜杠不追加 path。
5. **API Key 安全**：严禁出现在日志/commit/错误文案中，仅存 chrome.storage.local。
6. **TS 严格模式**：禁止 any，用 unknown + 类型守卫。
7. **配置读写统一走 shared/storage.ts**；LLM 调用统一走适配层。
8. **max_tokens**：Anthropic Messages API 必填字段，需设定合理默认值（如 1024）。

## 改动范围（全栈，AI+前端+后端）

- 后端：`shared/types.ts`（ProviderConfig 新增 responseStyle）、`shared/translator/llm-provider.ts`（风格分流 + callAnthropic）
- 前端：`entrypoints/options/App.vue`（响应风格单选 UI + 条件渲染 + 复位逻辑 + 说明文案）
- 测试：`shared/translator/__tests__/llm-provider.test.ts`（openai/anthropic 两条风格路径单测）、`e2e/mock-server.ts`（新增 Anthropic /v1/messages 路由）、`e2e/translate.spec.ts`（anthropic 风格 e2e + openai 回归）

## 不包含

- anthropic 流式响应（streaming，延后 v0.3+）
- 其他厂商原生协议、自动协议探测
- 隐私声明更新（发布前产物，不在 #22 代码范围，仅在 CHANGELOG 提示）

## 依赖链元数据

- 并发安全等级：parallel-safe
- MR 基线策略：base-branch（从 master 起，无上游依赖）
- 上游依赖：无（#5 baseUrl path 修复已 closed，本任务沿用其完整路径用法）
- 上游 Issue/MR：无
- 推荐合并顺序：单任务，无顺序
- Stacked MR：否

## 代码结构关键定位

- `shared/types.ts:13` — ProviderConfig interface（新增 responseStyle 字段处）
- `shared/translator/llm-provider.ts:17` — callOpenAICompatible（风格分流处）
- `shared/translator/llm-provider.ts:7` — buildPrompt（翻译指令构建，anthropic 风格作为 system）
- `shared/translator/llm-provider.ts:77` — createLLMProvider（type 路由）
- `shared/translator/error.ts:10` — classifyError（错误归一化，已支持 429/4xx/5xx/network）
- `entrypoints/options/App.vue:271` — 源类型 select（响应风格单选插入位置）
- `entrypoints/options/App.vue:151` — onTypeChange（类型切换复位逻辑扩展点）
- `e2e/mock-server.ts:40` — mock 路由（新增 Anthropic /v1/messages 路由处）

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| callAnthropic 实现位置 | 在 llm-provider.ts 内新增独立函数，由 createLLMProvider 路由 | PRD 7.2.2 允许「拆出独立 callAnthropic 函数，由设计阶段定」；独立函数更清晰、可单测 | 低 | 删除函数恢复单一 callOpenAICompatible |
| max_tokens 默认值 | 1024 | Anthropic API 必填；翻译场景译文长度有限，1024 足够 | 极长文本可能截断（非本任务范围） | 调整常量 |
| anthropic 风格鉴权缺 Key 时行为 | 仍发请求（不带 x-api-key），由端点返回 401→unreachable | 与 openai 风格 apiKey 可选行为一致；不擅自新增 no-config 错误类型 | Anthropic 端点必拒无 Key 请求，错误归类正确 | 无需回滚 |

## 开发结果（Step4 完成）

### 测试结果

| 验证项 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 通过 |
| `pnpm lint` | ✅ 通过 |
| vitest 单测 | ✅ 93 passed（6 文件），含 8 个新增 anthropic/回归测试 |
| `pnpm e2e` | ✅ 4 passed（含 anthropic 风格 + 3 个既有回归用例） |

### 踩坑记录

- App.vue 响应风格单选用 `:checked` + `@change` 而非 `v-model`，因为 `responseStyle` 是可选字段（缺省为 openai），v-model 无法直接绑定 undefined。`onResponseStyleChange` 显式设置值并保存。
- e2e 中选择 anthropic 单选用 `card.getByTestId('response-style').locator('input[type="radio"][value="anthropic"]').check()`，通过 data-testid scope 到单选容器。
- mock server `/v1/messages` 路由需在 `/v1/chat/completions` 之后、`/translate` 之前，且 URL 匹配用 `includes('/v1/messages')`，不会与 `/v1/chat/completions` 冲突。
| 配置页 responseStyle 单选插入位置 | baseUrl 行之后、apiKey 行之前（与 model 同区域） | 视觉上属于「接口风格」配置组，紧邻端点配置 | 低 | 调整模板位置 |
| 真实 Anthropic 端点联调 | 可选手动验收，不阻塞 mock e2e | 任务上下文明确：无真实 Key 时 e2e 用 mock 路由完成 | 无 | 无 |
