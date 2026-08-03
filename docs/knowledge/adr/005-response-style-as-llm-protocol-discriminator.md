---
id: adr:005-response-style-as-llm-protocol-discriminator
type: adr
status: active
owner: project
updated: 2026-08-03
confidence: 0.95
sources:
  - shared/types.ts
  - shared/storage.ts
  - shared/translator/llm-protocol.ts
  - shared/translator/registry.ts
  - shared/translator/llm-provider.ts
  - knowledges/adr/005-response-style-as-llm-protocol-discriminator.md
related:
  - context:development:storage-migration
  - feature:translator:unified-adapter
  - adr:001-unified-translator-adapter-layer
---

# ADR-005 responseStyle 作为 LLM 协议区分器，取代 type 子分组

**状态**：accepted

## 背景

此前 LLM 源在 `ProviderType` 内用 `openai-compatible` / `ollama` 子类型区分，而 `createLLMProvider` 又依赖 `responseStyle` 做二级路由——`type` 与 `responseStyle` 职责重叠，且二者仅协议格式不同，`type` 子分组无独立语义。

## 决策

将 `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`，由 `responseStyle` 独立承载 LLM 请求协议。最终协议集合为：

```ts
type LlmProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic'
  | 'ollama';
```

`createLLMProvider` 按这四种协议分发。LLM 配置收敛为 `baseUrl`、`model`、`apiKey`、`responseStyle` 四要素，其中 `baseUrl` 是服务根地址而非必须填写完整请求端点。

所有 LLM 请求和连通性测试使用 `resolveLlmEndpoint(baseUrl, protocol)` 生成最终 URL。解析器会 trim 空白与尾部 `/`，按协议追加端点，且当输入已经是当前协议的完整端点时保持不变，避免重复拼接：

| 协议 | 默认 Base URL | 请求端点后缀 |
|---|---|---|
| `openai-completions` | `https://api.openai.com/v1` | `/chat/completions` |
| `openai-responses` | `https://api.openai.com/v1` | `/responses` |
| `anthropic` | `https://api.anthropic.com/v1` | `/messages` |
| `ollama` | `http://localhost:11434` | `/api/chat` |

## 考虑过的选项

- **存量迁移：on-read backfill vs write-back**。选 on-read：`getProviders` 读出时补全，不回写。旧 `responseStyle: 'openai'`、缺失值或未知值均规范化为 `'openai-completions'`，保留既有 Chat Completions 行为（见 `context:development:storage-migration`）。
- **registry 是否保留旧 type 识别**。选保留：`inferCategory` 同时识别新 `llm` 与旧 `openai-compatible` / `ollama`，防迁移前路由失败。

## 后果

- 新增 LLM 协议风格只需扩展 `responseStyle` 枚举、端点映射与分发分支，无需再动 `ProviderType`。
- `type` 联合收紧后，与旧 type 字符串比较需 `as string` 规避 TS2367。
- OpenAI Responses 同时支持非流式 `input` 请求及 SSE `response.output_text.delta` 流式事件；这与 Chat Completions 的 `messages`/`choices` 协议明确分离。

## 来源证据

- `shared/types.ts`：`ProviderType`、四值 `LlmProtocol` 与 `ProviderConfig.responseStyle`。
- `shared/translator/llm-protocol.ts`：协议规范化、默认 Base URL 与端点解析。
- `shared/storage.ts`：`migrateProvider` on-read 补全。
- `shared/translator/registry.ts`：`inferCategory` 旧 type 兼容。
