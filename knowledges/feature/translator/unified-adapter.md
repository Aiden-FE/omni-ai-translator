# 统一翻译源适配层

## 功能目标

把不同类型的翻译源（LLM 类的 OpenAI 兼容 / Ollama，传统类的 Google / 微软）封装在同一接口下，使上层划词翻译只面向统一接口调用，不感知具体源类型。

## 业务规则

- **统一入口**：上层（background）调用翻译时经适配层统一入口 `translateWithAdapter(req)`，由适配层内部读取 `settings.activeProviderId` + `providers` 并路由，background 内无源类型 if-else 分支。
- **无可用源**：未配置任何源或当前源 ID 不匹配时返回 `errorType: 'no-config'`，不硬编码兜底逻辑（兜底源由功能事项 2 注入）。
- **行为不变**：LLM provider（openai-compatible / ollama）从 `shared/llm.ts` 迁移而来，相同输入产出相同 `TranslateResult`（新增 `errorType` 字段），baseUrl 需为用户填写的完整接口路径，代码不追加固定 path。
- **传统 provider 占位**：google / microsoft 可注册但 `translate` / `test` 返回 `errorType: 'unreachable'`，具体实现由功能事项 2/3 完成。
- **存储只读**：适配层只读 `chrome.storage.local`（经 `shared/storage.ts`），不写。
- **不做自动降级**：翻译失败只返回错误提示，由用户在配置页人工切换源。

## 接口定义

`TranslationProvider` 接口（`shared/translator/types.ts`）— 所有翻译源实现同一契约：

```typescript
interface TranslationProvider {
  id: string;
  type: 'llm' | 'traditional';
  translate(req: TranslateRequest): Promise<TranslateResult>;
  test(req?: TranslateRequest): Promise<TranslateResult>;
}
```

`TranslateResult` 错误模型（`shared/types.ts`，下游 #11 前端消费契约）：

```typescript
interface TranslateResult {
  translatedText: string;
  error?: string;        // 原始错误信息
  errorType?: ErrorType; // 四类互斥，供前端差异化反馈
}
type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';
```

## 注册表与路由

`createProvider(config: ProviderConfig): TranslationProvider`（`shared/translator/registry.ts`）根据 `ProviderConfig` 创建对应 provider 实例：

- `category === 'llm'`（或 type 为 `openai-compatible` / `ollama` 且 category 缺省）→ `createLLMProvider`
- `category === 'traditional'`（或 type 为 `google` / `microsoft` 且 category 缺省）→ `createTraditionalProvider`
- `category` 缺省时由 `inferCategory(type)` 推断，向后兼容旧配置

```
ProviderConfig.type + category
    │
    ▼
registry.createProvider(config)
    ├── category=llm         → createLLMProvider (openai-compatible / ollama)
    └── category=traditional → createTraditionalProvider (google / microsoft 占位)
```

## 四类错误模型

`classifyError(err, status?)`（`shared/translator/error.ts`）将底层异常 / HTTP 状态码归一化为四类互斥 `errorType`：

| errorType | 触发场景 | 归一化规则 | 可读提示 |
|-----------|----------|------------|----------|
| `no-config` | 未配置任何源或当前源未启用 | 适配层入口未匹配到 provider 时直接返回 | 未配置可用翻译源，请在配置页选择或添加源 |
| `network` | fetch 抛异常、超时 | `classifyError` 无 HTTP 状态码时 fallback | 翻译请求失败，请检查网络或源地址 |
| `rate-limit` | 源返回 429 | `classifyError` status === 429 | 翻译源繁忙（限流），请稍后再试或在配置页切换源 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | `classifyError` status >= 400 | 翻译源不可达，请在配置页切换到其它源 |

每类对应不同的用户侧操作，前端可据此做差异化反馈而非统一「翻译失败」。`errorTypeMessage(errorType)` 返回对应可读提示。

## 数据流

```
content-script → sendMessage({type:'translate', payload})
    → background.ts → translator.translateWithAdapter(req)
        → 读取 settings.activeProviderId + providers (via storage)
        → 无可用源 → TranslateResult{errorType:'no-config'}
        → 有源 → registry.createProvider(config) → provider.translate(req)
            → LLM provider: fetch → 成功返回译文 / 失败 classifyError → errorType
            → 传统 provider (占位): 返回 {errorType:'unreachable'}
        → TranslateResult → background → content → 浮层展示
```

## 相关文件

- `shared/translator/types.ts` — `TranslationProvider` 接口定义
- `shared/translator/error.ts` — 错误归一化（`classifyError` / `errorTypeMessage`）
- `shared/translator/registry.ts` — provider 工厂注册表与路由（`createProvider` / `inferCategory`）
- `shared/translator/index.ts` — 统一入口（`translateWithAdapter` / `testWithAdapter`）
- `shared/translator/llm-provider.ts` — LLM provider 工厂（`createLLMProvider`，迁移自 `shared/llm.ts`）
- `shared/translator/traditional-provider.ts` — 传统 provider 占位（`createTraditionalProvider`）
- `shared/translator/__tests__/` — Vitest 单元测试（error / registry / llm-provider / adapter，40 用例）
- `shared/types.ts` — `ProviderConfig` / `TranslateResult` / `ErrorType` / `ProviderCategory` 类型定义
- `shared/llm.ts` — 兼容层，保留 `translate(provider, req)` / `testProvider(provider)` 导出签名，内部委托适配层（已标记 `@deprecated`，新代码用 `shared/translator` 统一入口）
- `entrypoints/background.ts` — `translate` 分支用 `translateWithAdapter`，`test-provider` 分支用 `testWithAdapter`，无源类型分支

## 相关模块

- [ADR-001 统一翻译源适配层设计](../../adr/001-unified-translator-adapter-layer.md) — 适配层位置、工厂模式、四类错误模型的设计决策
- [插件架构](../../context/system/plugin-architecture.md) — 脚本环境与数据流总览
