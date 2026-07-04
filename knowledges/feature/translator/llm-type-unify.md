# LLM 类型分组统一为响应风格

## 功能目标

取消 LLM 翻译源在 `ProviderType` 内的 `openai-compatible`/`ollama` 子分组,统一为单一 `llm` 类型,由 `responseStyle`(`openai`/`anthropic`/`ollama`)统一承载协议格式区分。LLM 源配置收敛为 baseUrl + model + apiKey + responseStyle 四要素,存量配置无感迁移。深化事项 7 popup-settings 在 UI 层做的「LLM 源类目归并」到数据模型层。

## 业务规则

- `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`;传统翻译(google/microsoft)保持独立 type,不受影响。
- `responseStyle` 由「仅 openai-compatible 生效」改为「所有 LLM 源生效」,扩展为 `'openai' | 'anthropic' | 'ollama'`,缺省 `'openai'`。
- `createLLMProvider` 路由从「type 二级路由」改为「按 `responseStyle` 三路分发」:ollama→callOllama / anthropic→callAnthropic / openai(含缺省)→callOpenAICompatible;流式 `translateStream` 同步。
- 切换响应风格时,baseUrl 仅在命中 `KNOWN_DEFAULT_BASE_URLS` 时自动替换,自定义端点保留;连通性测试结果复位(`testMsgs[p.id]` 清除)。
- 切换为传统源时,`responseStyle` 重置为 `openai`。
- Key 仅存 `chrome.storage.local`,不写入日志/错误文案/commit。
- 隐私无变更:LLM 文本外传行为同事项 5/6。

## 状态流转

响应风格 radio(openai/anthropic/ollama)对所有 LLM 源展示:

- **切换响应风格** → baseUrl 命中 `KNOWN_DEFAULT_BASE_URLS` 则联动替换为对应风格默认端点 + 测试结果复位;自定义端点保留。
- **切换为传统源(google/microsoft)** → `responseStyle` 置 `openai`(避免残留无效风格)。
- **新建 LLM 源** → 默认 `type='llm'` + `responseStyle='openai'`。

## 存量迁移(on-read backfill)

- `getProviders` 读出时补全,不回写存储:旧 `type='ollama'` → `llm` + `responseStyle='ollama'`;旧 `type='openai-compatible'` → `llm` + 原 `responseStyle`(缺省 openai);`type='llm'` 不变。
- `registry.inferCategory` 同时识别新 `llm` 与旧 `openai-compatible`/`ollama`,防止迁移前其他代码路径直接传 config 时路由失败。

## 权限控制

- 无新增权限;复用既有 content/background 消息通道与 `chrome.storage.local`。

## UI 或交互要点

- 源类型下拉 LLM optgroup 收敛为单一「LLM」option(去除 openai-compatible/ollama 子项);`optgroup` 语义保留供读屏识别类目。
- 响应风格 radio group 对所有 LLM 源展示,默认 openai;键盘可达(Tab + 方向键) + 可见聚焦环(`outline: 2px solid #1f2937`)。
- model 输入对所有 LLM 源展示(原先仅 openai-compatible)。
- `KNOWN_DEFAULT_BASE_URLS` 对 LLM 类改为按 `responseStyle` 索引,传统类仍按 `type` 索引。
- 设计 token:色彩 #1F2937/#DC2626/#16A34A、字体 system-ui 14px、间距 4px 基准、圆角 卡片 8px/输入 4px;popup 400×600 / options max-width 720px;`@media (prefers-reduced-motion: reduce)` 关闭过渡。

## 相关文件

- `shared/types.ts` — `ProviderType` 收敛、`responseStyle` 扩展
- `shared/translator/llm-provider.ts` — `createLLMProvider` 按 `responseStyle` 三路分发(translate + translateStream)
- `shared/translator/registry.ts` — `inferCategory` 适配新 type + 旧 type 兼容识别
- `shared/storage.ts` — `getProviders` on-read 迁移(`migrateProvider`)
- `shared/ui/SourceConfigPanel.vue` — LLM 单一 option、响应风格 radio、baseUrl 联动、测试复位、`isLlmType`
- `shared/llm.ts` — `@deprecated` 兼容层适配新 type

## 相关模块

- [统一翻译源适配层](unified-adapter.md) — 源类型枚举、注册路由基础
- [popup 设置入口](popup-settings.md) — 事项 7 UI 层 LLM 源类目归并,本功能深化到数据模型层
- [LLM 翻译流式响应](streaming.md) — 三源流式契约,`translateStream` 同步调整
- ADR-005 `knowledges/adr/005-response-style-as-llm-protocol-discriminator.md` — responseStyle 取代 type 子分组的决策与取舍
