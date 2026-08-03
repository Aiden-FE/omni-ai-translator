---
id: feature:translator:unified-adapter
type: feature
status: active
owner: project
updated: 2026-08-03
confidence: 0.95
sources:
  - shared/translator/index.ts
  - shared/translator/registry.ts
  - shared/translator/error.ts
  - shared/translator/builtin-sources.ts
  - shared/translator/llm-provider.ts
  - shared/translator/llm-protocol.ts
  - shared/translator/traditional-provider.ts
  - shared/translator/types.ts
  - shared/types.ts
  - entrypoints/background.ts
  - knowledges/feature/translator/unified-adapter.md
related:
  - adr:001-unified-translator-adapter-layer
  - adr:005-response-style-as-llm-protocol-discriminator
  - context:system:plugin-architecture
---

# 统一翻译源适配层

> 以 `shared/translator/` 当前代码为准，包含显式 LLM 协议与 Base URL 解析。

## 功能目标

把不同翻译源（LLM 类：OpenAI Chat Completions / OpenAI Responses / Anthropic / Ollama；传统类：Google / 微软）封装在同一接口下，使上层划词翻译只面向统一接口调用，不感知具体源类型。

## 业务规则

- **统一入口**：background 经 `translateWithAdapter(req)` 调用，适配层内部读 `settings.activeProviderId` + `providers` 并路由；background 内无源类型 if-else。
- **默认生效源**：`activeProviderId === null` 解析为 `builtin:microsoft`（显式默认，非隐式回退）。
- **查找顺序**：先用户已配置源，未命中再查内置免 Key 免费源；均未命中返回 `errorType:'no-config'`。
- **不做自动降级**：失败只返回错误提示，由用户在配置页人工切换。
- **内置免费源**：`builtin:microsoft` / `builtin:google`，端点为内置常量，不可编辑（`builtin-sources.ts`）。

## 接口与错误模型

```typescript
interface TranslationProvider {
  translate(req: TranslateRequest): Promise<TranslateResult>;
  test(req?: TranslateRequest): Promise<TranslateResult>;
  translateStream?(req, onChunk): Promise<TranslateResult>; // 可选，传统源不实现
}
type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';
```

`classifyError(err, status?)`：429→rate-limit，>=400→unreachable，fetch 异常→network。`errorFeedback(errorType)` 返回 `{ main, guidance }` 供浮层差异化渲染。

## 注册表与路由

`createProvider(config)`（`registry.ts`）按 `category`（缺省由 `inferCategory(type)` 推断，兼容旧 type）路由：

```
category=llm         → createLLMProvider（按 responseStyle 四路分发：openai-completions / openai-responses / anthropic / ollama）
category=traditional → createTraditionalProvider（google / microsoft，有 Key 官方端点 / 无 Key 公共端点双模式）
```

### LLM 协议与 Base URL 契约

- `responseStyle` 的有效值是 `openai-completions | openai-responses | anthropic | ollama`。缺失值和存量 `'openai'` 在读取时均规范为 `openai-completions`。
- `baseUrl` 表示服务根地址；每个 LLM handler 在 `fetch` 前调用 `resolveLlmEndpoint`，由协议追加 `/chat/completions`、`/responses`、`/messages` 或 `/api/chat`。当前协议的完整端点输入会被保留，故存量完整 endpoint 不会被重复拼接。
- OpenAI Responses 非流式请求使用 `{ model, input }`；响应优先读取 `output_text`，否则汇总 `output[].content[]` 中 `type='output_text'` 的 `text`。流式请求解析 `response.output_text.delta` 并在 `response.completed` 或 `[DONE]` 结束。
- 配置页的新 LLM 源默认 `openai-completions` 和 `https://api.openai.com/v1`；切换协议时，已知默认地址或已知 endpoint 重置为新协议的默认 Base URL，自定义地址保持不变。

## 生效源切换契约

- `getActiveSources()` → `{ sources: [...BUILTIN_FREE_SOURCES, ...providers], activeSourceId }`。
- `setActiveSource(id)` 仅写 `settings.activeProviderId`，不校验存在性。
- 消息通道：`get-active-sources` / `set-active-source`（`entrypoints/background.ts`）。

## 来源证据

- `shared/translator/index.ts`：`translateWithAdapter` / `translateWithAdapterStream` / `testWithAdapter` / `getActiveSources` / `setActiveSource`。
- `shared/translator/builtin-sources.ts`：`BUILTIN_FREE_SOURCES`、`DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft'`、端点常量。
- `shared/translator/error.ts`：四类错误归一化与反馈文案。
- `shared/types.ts`：`ProviderConfig` / `TranslateResult` / `ActiveSourcesResult`。
- `shared/translator/llm-protocol.ts`：`LlmProtocol` 的默认地址、规范化与端点解析。
- `shared/translator/llm-provider.ts`：四种协议的请求/响应适配（含 OpenAI Responses 流式与非流式）。
