---
id: adr:001-unified-translator-adapter-layer
type: adr
status: accepted
owner: project
updated: 2026-07-30
confidence: 0.85
sources:
  - shared/translator/index.ts
  - shared/translator/registry.ts
  - shared/translator/error.ts
  - shared/translator/types.ts
  - shared/llm.ts
  - knowledges/adr/001-unified-translator-adapter-layer.md
related:
  - feature:translator:unified-adapter
  - context:system:plugin-architecture
  - adr:005-response-style-as-llm-protocol-discriminator
---

# ADR-001 统一翻译源适配层设计（初始化草稿）

**状态**：accepted

## 背景

v0.2 引入传统翻译源（Google / 微软）作为免 Key 源，需要把 v0.1 只支持 LLM 的适配逻辑（`shared/llm.ts` 内按 type 的 if-else 分支）抽象为通用接口。

## 决策

新建 `shared/translator/` 目录建立统一适配层（而非扩展 `shared/llm.ts`）；provider 采用工厂函数（`createLLMProvider` / `createTraditionalProvider`）返回接口对象，而非类继承体系；错误归一化为四类互斥 `errorType`（`no-config` / `network` / `rate-limit` / `unreachable`），供前端差异化反馈消费。

## 考虑过的选项

| 方案 | 结论 |
|------|------|
| A. 新建 `shared/translator/` 目录 | 采用 |
| B. 扩展 `shared/llm.ts` | 否决 — 成为 god file，后续扩源难维护 |
| C. Provider 类继承体系 | 否决 — MV3 SW 无长生命周期对象，工厂函数更轻量，避免 OOP 过度设计 |

## 错误模型（四类互斥）

| errorType | 触发 | 归一化规则（`classifyError`） |
|-----------|------|-------------------------------|
| `no-config` | 未匹配到 provider | 适配层入口直接返回 |
| `network` | fetch 异常 / 超时 | 无 HTTP 状态码时 fallback |
| `rate-limit` | 源返回 429 | `status === 429` |
| `unreachable` | 4xx/5xx（非 429）、域名不可达 | `status >= 400` |

每类对应不同用户侧操作（去配置 / 检查网络 / 重试或换源 / 换源），429 单列因限流是可重试的瞬时状态。

## 后果

- `shared/llm.ts` 降级为兼容层（`@deprecated`），保留导出签名但内部委托适配层。
- `TranslateResult.errorType` 是供前端消费的契约，新增值需同步前端反馈与单测。
- `ProviderConfig.category` 可选，缺省按 `type` 推断，向后兼容。
- 回滚：删除 `shared/translator/`，恢复 `shared/llm.ts` 与 `entrypoints/background.ts`。

## 来源证据

- `shared/translator/error.ts`：`classifyError` / `errorFeedback` / `errorTypeMessage`。
- `shared/translator/registry.ts`：`createProvider` 工厂路由。
- `entrypoints/background.ts`：无源类型分支，统一委托适配层。
