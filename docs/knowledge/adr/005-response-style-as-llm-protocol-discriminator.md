---
id: adr:005-response-style-as-llm-protocol-discriminator
type: adr
status: active
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - shared/types.ts
  - shared/storage.ts
  - shared/translator/registry.ts
  - shared/translator/llm-provider.ts
  - knowledges/adr/005-response-style-as-llm-protocol-discriminator.md
related:
  - context:development:storage-migration
  - feature:translator:unified-adapter
  - adr:001-unified-translator-adapter-layer
---

# ADR-005 responseStyle 作为 LLM 协议区分器，取代 type 子分组（初始化草稿）

**状态**：accepted

## 背景

此前 LLM 源在 `ProviderType` 内用 `openai-compatible` / `ollama` 子类型区分，而 `createLLMProvider` 又依赖 `responseStyle` 做二级路由——`type` 与 `responseStyle` 职责重叠，且二者仅协议格式不同，`type` 子分组无独立语义。

## 决策

将 `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`，由 `responseStyle`（扩展为 `'openai' | 'anthropic' | 'ollama'`）统一承载协议格式区分。`createLLMProvider` 从「type 二级路由」扁平化为「按 `responseStyle` 三路分发」。LLM 源配置收敛为 baseUrl + model + apiKey + responseStyle 四要素。

## 考虑过的选项

- **存量迁移：on-read backfill vs write-back**。选 on-read：`getProviders` 读出时补全，不回写。最小侵入、可回滚、用户无感（见 `context:development:storage-migration`）。
- **registry 是否保留旧 type 识别**。选保留：`inferCategory` 同时识别新 `llm` 与旧 `openai-compatible` / `ollama`，防迁移前路由失败。

## 后果

- 新增 LLM 协议风格只需扩展 `responseStyle` 枚举 + 三路分发新增分支，无需再动 `ProviderType`。
- `type` 联合收紧后，与旧 type 字符串比较需 `as string` 规避 TS2367。

## 来源证据

- `shared/types.ts`：`ProviderType = 'llm' | 'google' | 'microsoft'`；`responseStyle?: 'openai' | 'anthropic' | 'ollama'`。
- `shared/storage.ts`：`migrateProvider` on-read 补全。
- `shared/translator/registry.ts`：`inferCategory` 旧 type 兼容。
