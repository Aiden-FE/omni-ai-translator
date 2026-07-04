## 变更摘要

本 PR 将 LLM 翻译源的配置从「按 type 分组(openai-compatible/ollama)」简化为「单一 LLM 类型 + 响应风格(openai/anthropic/ollama)区分协议」。消除 type 子分组,由 `responseStyle` 统一承载协议格式区分,LLM 源配置收敛为 baseUrl + model + apiKey + responseStyle 四要素。

### 核心变更

- **类型层**: `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`;`responseStyle` 扩展为 `'openai' | 'anthropic' | 'ollama'`,对所有 LLM 源生效
- **路由**: `createLLMProvider` 从 type 二级路由改为 responseStyle 三路分发(含流式 translateStream)
- **迁移**: `getProviders` 读出时自动迁移旧 type(ollama→llm+ollama, openai-compatible→llm+原 responseStyle),不回写存储,用户无感
- **UI**: LLM optgroup 收敛为单一「LLM」option;响应风格 radio 三选一对所有 LLM 源展示;切换响应风格 baseUrl 联动替换 + 测试结果复位
- **兼容**: `inferCategory` 保留旧 type 识别;`shared/llm.ts` 兼容层签名不变

## 审查上下文

| 项 | 内容 |
|---|---|
| PRD Issue | #42 — https://github.com/Aiden-FE/llm-translator/issues/42 |
| PRD 文档 | `knowledges/product-wiki/releases/v0.2/9-llm-type-unify/PRD.md` |
| 版本号 | v0.2 |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| DESIGN | `releases/v0.2/issue-43/DESIGN.md` |
| PLAN | `releases/v0.2/issue-43/PLAN.md` |
| CHANGELOG | `releases/v0.2/issue-43/CHANGELOG.md` |
| 验收标准 | 见 PRD §8 验收标准(6 项):类型收敛+迁移无感+路由三路分发+连通性测试三风格+e2e回归+隐私无变更 |
| UX 规范 | `knowledges/ux/design-system.md`、`knowledges/ux/interaction-patterns.md`、`knowledges/ux/accessibility.md`、`knowledges/feature/translator/popup-settings.md` |
| 视觉原型 | `knowledges/ux/prototypes/v0.2-llm-type-unify.html` |
| 知识沉淀 | context: on-read 存储迁移模式; adr: responseStyle 作协议区分器取代 type 子分组; feature: LLM 类型统一为响应风格 |
| 并发安全等级 | parallel-safe |
| MR 基线策略 | base-branch |
| 上游 Issue/MR | 无 |
| 基线分支 | master |
| 推荐合并顺序 | 无(无上游依赖) |
| Stacked MR | 否 |
| 依赖契约或接口文档 | ADR-001(统一适配层工厂模式); shared/types.ts ProviderConfig |

### 测试结果

- `pnpm typecheck`: 通过(vue-tsc --noEmit 无错误)
- `pnpm lint`: 通过(eslint 无错误)
- `pnpm test`: 8 文件 143 测试全绿(含 registry/llm-provider/adapter/storage 迁移与路由用例)
- `pnpm e2e`: 7 测试全绿(含 anthropic/ollama 响应风格划词翻译 + 连通性测试)

### 知识沉淀清单

- **feature**: LLM 类型统一为响应风格(交互/状态/迁移) — 建议路径 `knowledges/feature/translator/llm-type-unify.md`
- **adr**: responseStyle 作协议区分器取代 type 子分组(决策/取舍) — 建议路径 `knowledges/adr/adr-002-response-style-as-protocol-discriminator.md`
- **context**: on-read 存储迁移模式(场景/实现) — 建议路径 `knowledges/context/development/on-read-storage-migration.md`

Closes #43
