# PLAN — Issue #22 执行计划

| 项 | 内容 |
|---|---|
| ISSUE_ID | #22 |
| 版本 | v0.2 |
| 创建日期 | 2026-07-03 |
| 执行模式 | 无人值守（自动批准） |

## 任务清单

### 后端 — 类型与适配层

- [x]T1: `shared/types.ts` — `ProviderConfig` 新增 `responseStyle?: 'openai' | 'anthropic'` 字段（含 JSDoc 注释，说明仅对 openai-compatible 有意义、缺省按 openai）
- [x]T2: `shared/translator/llm-provider.ts` — 新增 `callAnthropic(provider, req)` 函数（x-api-key + anthropic-version 头 + max_tokens + 顶层 system + 原文作 user message + 解析 data.content[0].text + classifyError 错误归一化）
- [x]T3: `shared/translator/llm-provider.ts` — `createLLMProvider` 内 openai-compatible 类型按 `config.responseStyle` 路由（anthropic→callAnthropic，openai/缺省→callOpenAICompatible）

### 前端 — 配置页 UI

- [x]T4: `entrypoints/options/App.vue` — 源卡片 openai-compatible 类型时展示响应风格单选（openai/anthropic，默认 openai），含说明文案（区分两种风格）
- [x]T5: `entrypoints/options/App.vue` — `onTypeChange` 中类型从 openai-compatible 切换为其它时复位 responseStyle 为 openai
- [x]T6: `entrypoints/options/App.vue` — `addProvider` 默认值补充（新添加的 openai-compatible 源 responseStyle 缺省按 openai，无需显式设置但确保不残留）

### 测试 — 单元测试

- [x]T7: `shared/translator/__tests__/llm-provider.test.ts` — anthropic 风格成功路径单测（请求构建：x-api-key + anthropic-version + system + max_tokens + messages；响应解析：data.content[0].text）
- [x]T8: `shared/translator/__tests__/llm-provider.test.ts` — anthropic 风格错误归类单测（429→rate-limit、500→unreachable、fetch TypeError→network）
- [x]T9: `shared/translator/__tests__/llm-provider.test.ts` — openai 风格回归（responseStyle 缺省 + 显式 openai 均走原路径，既有用例不退化）

### 测试 — e2e

- [x]T10: `e2e/mock-server.ts` — 新增 Anthropic `/v1/messages` 路由（返回 `{content:[{type:'text',text:'你好,世界'}]}`）
- [x]T11: `e2e/translate.spec.ts` — 新增 anthropic 风格划词翻译 e2e（配置 anthropic 源 → 划词 → 断言浮层译文 + 请求落点 /v1/messages + 请求头含 x-api-key）
- [x]T12: `e2e/translate.spec.ts` — 验证既有 openai 风格 e2e 回归不退化

### 验证

- [x]T13: 运行 `pnpm typecheck` 通过
- [x]T14: 运行 `pnpm lint` 通过
- [x]T15: 运行 vitest 单测全部通过
- [x]T16: 运行 `pnpm e2e` 全部通过（含 anthropic + openai 回归）

## 依赖关系

- T2 依赖 T1（类型先定义）
- T3 依赖 T1、T2
- T4 依赖 T1
- T5 依赖 T4
- T7-T9 依赖 T1-T3
- T10-T12 依赖 T1-T5、T10
- T13-T16 依赖 T1-T12

## 优先级与复杂度

| 任务 | 优先级 | 复杂度 |
|---|---|---|
| T1-T3 | P0 | 中（核心后端逻辑） |
| T4-T6 | P0 | 中（UI 条件渲染 + 复位） |
| T7-T9 | P0 | 中（单测覆盖两条路径） |
| T10-T12 | P0 | 中（e2e mock 扩展 + 新用例） |
| T13-T16 | P0 | 低（验证命令） |

## 执行结果

所有 16 项任务全部完成。

| 验证项 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 通过（vue-tsc --noEmit 无错误） |
| `pnpm lint` | ✅ 通过（eslint 无错误） |
| vitest 单测 | ✅ 93 passed（6 文件），含 8 个新增 anthropic/回归测试 |
| `pnpm e2e` | ✅ 4 passed（含 anthropic 风格 + 3 个既有回归用例） |

### 实际改动文件

| 文件 | 改动 |
|---|---|
| `shared/types.ts` | ProviderConfig 新增 `responseStyle?: 'openai' \| 'anthropic'` |
| `shared/translator/llm-provider.ts` | 新增 `callAnthropic` 函数 + `createLLMProvider` 风格路由 |
| `entrypoints/options/App.vue` | 响应风格单选 UI + onTypeChange 复位 + 说明文案 + CSS |
| `shared/translator/__tests__/llm-provider.test.ts` | 新增 anthropic 风格 + openai 回归测试（8 个） |
| `e2e/mock-server.ts` | 新增 Anthropic `/v1/messages` 路由 |
| `e2e/translate.spec.ts` | 新增 anthropic 风格划词翻译 e2e |

### 偏差说明

无偏差。实现完全按 PLAN.md 执行，方案 A（独立 callAnthropic 函数）落地。
