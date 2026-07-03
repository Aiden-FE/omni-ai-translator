# 统一翻译源适配层

## 功能目标

把不同类型的翻译源（LLM 类的 OpenAI 兼容 / Ollama，传统类的 Google / 微软）封装在同一接口下，使上层划词翻译只面向统一接口调用，不感知具体源类型。

## 业务规则

- **统一入口**：上层（background）调用翻译时经适配层统一入口 `translateWithAdapter(req)`，由适配层内部读取 `settings.activeProviderId` + `providers` 并路由，background 内无源类型 if-else 分支。
- **无可用源**：生效源 ID 在用户已配置源与内置免 Key 免费源中均未匹配时返回 `errorType: 'no-config'`，不硬编码兜底逻辑。
- **行为不变**：LLM provider（openai-compatible / ollama）从 `shared/llm.ts` 迁移而来，相同输入产出相同 `TranslateResult`（新增 `errorType` 字段），baseUrl 需为用户填写的完整接口路径，代码不追加固定 path。
- **传统 provider 有 Key / 无 Key 双模式**：google / microsoft 按 `config.apiKey` 是否存在切换调用方式 — 有 Key 走官方鉴权端点（读 `config.baseUrl`），无 Key 走免 Key 公共端点（builtin-sources.ts 常量，端点不可编辑）。无 Key 路径由功能事项 2 / #14 实现，有 Key 路径由功能事项 3 / #18 实现（关联 PRD #3 功能事项 3，#19 前端联调已交付：配置页 microsoft 有 Key 时显示 region 输入框 + e2e 验证官方端点落点与 Key/region header），两条路径均经 `classifyError` 归类失败。
- **默认生效源**：全新安装、用户未做选择时默认选中 `builtin:microsoft`（显式默认值，非隐式回退）；`settings.activeProviderId === null` 时解析为默认 microsoft。
- **存储读写**：翻译路径（`translateWithAdapter` / `testWithAdapter`）只读 `chrome.storage.local`（经 `shared/storage.ts`）；`setActiveSource` 写入 `settings.activeProviderId`（供 #4 配置页切换生效源）。
- **不做自动降级**：翻译失败（含内置免 Key 免费源失败）只返回错误提示，不自动切换到其它源，由用户在配置页人工切换。

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
    └── category=traditional → createTraditionalProvider (google / microsoft，有 Key 走官方端点 / 无 Key 走免 Key 公共端点)
```

## LLM 响应风格（responseStyle）

`ProviderConfig.responseStyle?: 'openai' | 'anthropic'`（`shared/types.ts`，#22 新增）— 仅对 `openai-compatible` 类型有意义，缺省按 `'openai'`（向后兼容，存量配置无需迁移）。使原生 Anthropic Messages API 端点（如 Claude 官方 `https://api.anthropic.com/v1/messages`）可作为 OpenAI 兼容源的一种风格直接配置使用。

`createLLMProvider`（`shared/translator/llm-provider.ts`）在 `openai-compatible` 类型下按 `responseStyle` 内部分流（ollama 不受影响，固定走 `callOllama`）：

```
createLLMProvider(config)
    ├── config.type === 'ollama' → callOllama(config, req)
    └── config.type === 'openai-compatible'
         ├── responseStyle === 'anthropic' → callAnthropic(config, req)
         └── else（openai / 缺省）       → callOpenAICompatible(config, req)
```

### anthropic 风格请求规范（callAnthropic）

| 维度 | 规范 |
|---|---|
| 鉴权头 | `x-api-key: <apiKey>`（非 Bearer，有 apiKey 时携带）+ `anthropic-version: 2023-06-01` |
| 请求体 | `{ model, max_tokens: 1024, system: <翻译指令>, messages: [{role:'user', content: <原文>}], temperature: 0.3 }` |
| 响应解析 | `data.content[0].text`（可选链兜底空数组/null） |
| 错误归一化 | 复用 `classifyError`：429→rate-limit，4xx/5xx→unreachable，fetch 异常→network（不新增错误类型） |
| baseUrl | 沿用 #5 修复（用户填完整路径，去尾斜杠，不追加 path） |

### 配置页 UI（#22）

`entrypoints/options/App.vue` 源卡片在类型为 `openai-compatible` 时展示响应风格单选（openai / anthropic，默认 openai），切换类型时复位为 openai，说明文案区分两种风格。连通性测试复用 `test-provider` 通道，覆盖 anthropic 风格。

### 不包含

- anthropic 流式响应（streaming，延后 v0.3+）
- 其他厂商原生协议、自动协议探测

## 四类错误模型

`classifyError(err, status?)`（`shared/translator/error.ts`）将底层异常 / HTTP 状态码归一化为四类互斥 `errorType`：

| errorType | 触发场景 | 归一化规则 | 可读提示 |
|-----------|----------|------------|----------|
| `no-config` | 未配置任何源或当前源未启用 | 适配层入口未匹配到 provider 时直接返回 | 未配置可用翻译源，请在配置页选择或添加源 |
| `network` | fetch 抛异常、超时 | `classifyError` 无 HTTP 状态码时 fallback | 翻译请求失败，请检查网络或源地址 |
| `rate-limit` | 源返回 429 | `classifyError` status === 429 | 翻译源繁忙（限流），请稍后再试或在配置页切换源 |
| `unreachable` | 源返回 4xx/5xx（非 429）、域名不可达 | `classifyError` status >= 400 | 翻译源不可达，请在配置页切换到其它源 |

每类对应不同的用户侧操作，前端可据此做差异化反馈而非统一「翻译失败」。`errorTypeMessage(errorType)` 返回合并的可读提示（主文案 + 引导拼接），`errorFeedback(errorType)` 返回拆分的 `{ main, guidance }` 结构供前端浮层差异化渲染（#11 产出）。

## 数据流

```
content-script → sendMessage({type:'translate', payload})
    → background.ts → translator.translateWithAdapter(req)
        → 读取 settings.activeProviderId + providers (via storage)
        → activeProviderId === null → 解析为默认 builtin:microsoft
        → 先查 stored providers，未命中再查 builtin free sources
        → 均未命中 → TranslateResult{errorType:'no-config'}
        → 命中 → registry.createProvider(config) → provider.translate(req)
            → LLM provider: fetch → 成功返回译文 / 失败 classifyError → errorType
            → 传统 provider: 按 apiKey 切换 — 有 Key 走官方端点(读 baseUrl) / 无 Key 走内置免 Key 端点常量 → 成功返回译文 / 失败 classifyError → errorType
        → TranslateResult → background → content → 浮层展示
```

## 生效源切换契约

`getActiveSources()` / `setActiveSource(id)`（`shared/translator/index.ts`，供 #4 配置页消费）：

- `getActiveSources()` 返回 `ActiveSourcesResult`（`shared/types.ts`）：
  - `sources: ProviderConfig[]` — 内置免 Key 免费源在前 + 用户已配置源在后（`[...BUILTIN_FREE_SOURCES, ...providers]`）
  - `activeSourceId: string` — 当前生效源 ID；`settings.activeProviderId === null` 时解析为默认 `builtin:microsoft`
- `setActiveSource(id)` 仅写入 `settings.activeProviderId`，不校验 id 是否存在（由调用方保证）；id 可为内置源 ID（`builtin:microsoft` / `builtin:google`）或用户已配置源 ID
- 消息通道：`get-active-sources` / `set-active-source`（`entrypoints/background.ts`）

## 传统 provider 有 Key / 无 Key 双模式

`createTraditionalProvider(config)`（`shared/translator/traditional-provider.ts`）按 `config.apiKey` 是否存在切换调用方式，两种模式共用同一 provider 实例与 `classifyError` 错误归一化：

| 模式 | 触发条件 | google 调用 | microsoft 调用 |
|------|----------|-------------|----------------|
| 无 Key | `config.apiKey` 缺省 | `callGoogle` — GET 免 Key 公共端点 `translate_a/single`，解析嵌套数组（#14） | `callMicrosoft` — GET edge auth 取 JWT token → POST 免 Key 翻译端点（#14） |
| 有 Key | `config.apiKey` 存在 | `callGoogleWithKey` — POST 官方 v2 端点，响应 `data.translations[0].translatedText`（#18） | `callMicrosoftWithKey` — POST 官方端点，headers 鉴权，不走 edge auth（#18） |

**有 Key 端点构造与请求体**：

- **google 有 Key**：POST `<baseUrl>/language/translate/v2?key=<apiKey>`，body `{ q: [text], target, source?, format: 'text' }`，响应 `{ data: { translations: [{ translatedText }] } }`。`baseUrl` 默认为 host（`https://translation.googleapis.com`），自动追加 `/language/translate/v2`；若 `baseUrl` 已含该路径则不重复追加，兼容用户填完整端点。
- **microsoft 有 Key**：POST `<baseUrl>?api-version=3.0&to=<target>`，body `[{ Text: text }]`，响应 `[{ translations: [{ text, to }] }]`。直接用 `config.baseUrl`（去尾斜杠）+ 查询参数，由用户填写完整官方端点；不再走 edge auth 取 JWT token（官方 Key 鉴权无需 token）。

### region 字段契约

`ProviderConfig.region?: string`（`shared/types.ts`，#18 新增，#19 前端已消费）：

- **microsoft Azure Translator 区域**（如 `eastus`、`global`），有 Key 时携带 `Ocp-Apim-Subscription-Region` header。
- **google 不使用** region 字段。
- **缺省 / 纯空白**（trim 后为空）时不发送 Region header（部分全局资源可省略，并防御无效空白值）。
- 字段可选、向后兼容，既有存储的 `ProviderConfig` 无需迁移即可读取。
- **前端消费（#19）**：配置页 `entrypoints/options/App.vue` 在源类型为 microsoft 且已填入 apiKey 时显示 region 输入框（placeholder「Azure 区域，如 eastus」），无 Key 或非 microsoft 源不显示；region 为公开区域值，普通文本输入（非凭证，无需掩码）。

### 安全约束

- Key 仅放入 query 参数（google）/ header（microsoft），region 仅放入 header。
- Key / region 不写入日志、错误文案、commit，仅存 `chrome.storage.local`。

### 连通性测试

`test()` 委托 `translate`，有 / 无 Key 两条路径均可经配置页连通性测试验证（#16 配置页 4 类源连通性测试已接入）。

## 相关文件

- `shared/translator/types.ts` — `TranslationProvider` 接口定义
- `shared/translator/error.ts` — 错误归一化（`classifyError` / `errorTypeMessage` / `errorFeedback`）
- `shared/translator/registry.ts` — provider 工厂注册表与路由（`createProvider` / `inferCategory`）
- `shared/translator/index.ts` — 统一入口（`translateWithAdapter` / `testWithAdapter` / `getActiveSources` / `setActiveSource`，后两者供 #4 配置页消费）
- `shared/translator/llm-provider.ts` — LLM provider 工厂（`createLLMProvider`，迁移自 `shared/llm.ts`；#22 新增 `callAnthropic` 函数 + `responseStyle` 风格分流）
- `shared/translator/traditional-provider.ts` — 传统 provider 实现（`createTraditionalProvider`，google/microsoft 有 Key 官方端点 + 无 Key 公共端点双模式，#18 扩展有 Key 路径）
- `shared/translator/builtin-sources.ts` — 内置免 Key 免费源常量与查找（`BUILTIN_FREE_SOURCES` / `DEFAULT_ACTIVE_SOURCE_ID` / `getBuiltinSourceById` / 端点常量）
- `shared/translator/__tests__/` — Vitest 单元测试（error / registry / llm-provider / adapter / builtin-sources / traditional-provider，93 用例，含 `errorFeedback` 四类 errorType 渲染路径、内置免 Key 源查找、传统 provider 有/无 Key 双路径与 region header 校验、#22 anthropic 风格请求构建/响应解析/错误归类与 openai 回归测试）
- `entrypoints/options/App.vue` — 配置页翻译源管理（#16 交付 4 类源管理 + 连通性测试；#19 新增 microsoft 有 Key 场景 region 输入框，条件渲染 `p.type === 'microsoft' && p.apiKey`；#22 新增 openai-compatible 响应风格单选 UI + 切换类型复位 + 说明文案）
- `e2e/translate.spec.ts` + `e2e/mock-server.ts` — Playwright e2e（#19 扩展 mock server 新增 microsoft `/translate` 路由 + headers 记录，新增 microsoft 有 Key 划词 e2e 验证官方端点落点与 `Ocp-Apim-Subscription-Key`/`Ocp-Apim-Subscription-Region` header 携带；#22 新增 Anthropic `/v1/messages` mock 路由 + anthropic 风格划词翻译 e2e 验证请求落点与 `x-api-key`/`anthropic-version` header）
- `shared/types.ts` — `ProviderConfig`（含 #18 新增可选 `region?`、#22 新增可选 `responseStyle?: 'openai' | 'anthropic'`）/ `TranslateResult` / `ErrorType` / `ProviderCategory` / `ActiveSourcesResult` 类型定义
- `shared/llm.ts` — 兼容层，保留 `translate(provider, req)` / `testProvider(provider)` 导出签名，内部委托适配层（已标记 `@deprecated`，新代码用 `shared/translator` 统一入口）
- `entrypoints/background.ts` — `translate` 分支用 `translateWithAdapter`，`test-provider` 分支用 `testWithAdapter`，`get-active-sources` / `set-active-source` 分支供 #4 配置页消费，无源类型分支
- `entrypoints/content.ts` — 划词浮层，`doTranslate` 按 `errorType` 调用 `errorFeedback` 渲染主行（❌ + 主文案）+ 引导次要行（#11 产出）
- `assets/content.css` — 浮层样式，含错误态主行 `.llm-translator-error-main` 和引导次要行 `.llm-translator-error-hint`（#11 产出）

## 相关模块

- [ADR-001 统一翻译源适配层设计](../../adr/001-unified-translator-adapter-layer.md) — 适配层位置、工厂模式、四类错误模型的设计决策
- [插件架构](../../context/system/plugin-architecture.md) — 脚本环境与数据流总览

---

> 更新日期：2026-07-03 · 关联 Issue：#14（免 Key 公共端点 + 生效源切换契约）、#18（有 Key 走官方 API + region 字段契约，关联 PRD #3 功能事项 3）、#19（前端联调：配置页 region 输入框 + microsoft 有 Key e2e 验证）、#22（LLM 适配层 anthropic 响应风格支持：responseStyle 字段 + callAnthropic + 配置页 UI，关联 PRD #6 功能事项 5）
