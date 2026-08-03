---
id: context:development:storage-migration
type: context
status: active
owner: project
updated: 2026-08-03
confidence: 0.95
sources:
  - shared/storage.ts
  - shared/translator/llm-protocol.ts
  - shared/translator/registry.ts
  - knowledges/context/development/on-read-storage-migration.md
related:
  - context:development:coding-standard
  - adr:005-response-style-as-llm-protocol-discriminator
---

# on-read 存储迁移模式

> 以 `shared/storage.ts` 的 `migrateProvider` 实现为准。

`chrome.storage.local` 存量配置在数据模型演进时采用 **on-read backfill**：读出时补全新形态字段，**不回写存储**，用户无感。`getProviders` 把旧类型和协议值投影为运行时的 `ProviderConfig`；存储层不主动改写，直到用户下次主动保存才会落入新形态。

## 迁移规则（`migrateProvider`）

| 旧形态 | 新形态 |
|--------|--------|
| `type='ollama'` | `type='llm'` + `responseStyle='ollama'` |
| `type='openai-compatible'` | `type='llm'` + `normalizeLlmProtocol(responseStyle)` |
| `type='llm'` | 保持 `type='llm'`，并以 `normalizeLlmProtocol(responseStyle)` 规范协议 |
| `responseStyle='openai'`、缺失或未知值 | `responseStyle='openai-completions'` |

`normalizeLlmProtocol` 只保留 `openai-responses`、`anthropic`、`ollama` 三个非默认值；其余输入统一回退为 `openai-completions`。因此旧 OpenAI 配置不会在读取后意外变成 Responses 或其他协议。

## 关系

- 存量配置（旧形态）→ `getProviders` 的 `migrateProvider` → 运行时新形态；存储层保持旧形态。
- `registry.ts` 的 `inferCategory` 同时识别新 `llm` 与旧 `openai-compatible` / `ollama`，兜底迁移前其他代码路径直接传 config 的场景。

## 踩坑

- **TS 联合收紧后的旧值比较**：`ProviderType` 收敛后不再含 `'ollama'` / `'openai-compatible'`，直接 `p.type === 'ollama'` 报 TS2367。需 `const rawType = p.type as string` 转 string 比较。
- **registry 必须保留旧 type 识别**：否则迁移前未经 `getProviders` 的旧 type 配置会路由失败。

## 适用场景

- 数据模型字段重命名 / 枚举收敛 / 形态变更，存量数据需无感迁移且不强制写回。
- 迁移逻辑纯函数、可由读出值确定性推出新形态（无外部依赖）。

## 来源证据

- `shared/storage.ts`：`migrateProvider` + `getProviders` 调 `map(migrateProvider)`，不回写。
- `shared/translator/llm-protocol.ts`：`normalizeLlmProtocol` 的默认协议回退规则。
- `shared/translator/registry.ts`：`inferCategory` 旧 type 兼容识别。
