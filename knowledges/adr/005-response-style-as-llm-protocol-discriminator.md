# responseStyle 作为 LLM 协议区分器,取代 type 子分组

v0.2 事项 9 之前,LLM 翻译源在 `ProviderType` 内用 `openai-compatible`/`ollama` 两个子类型区分,而 `createLLMProvider` 又依赖 `responseStyle`(`openai`/`anthropic`)做二级路由——`type` 与 `responseStyle` 职责重叠,且二者仅协议格式不同,用户配置任意 LLM 源填的都是「完整接口 + 模型 + Key + 响应风格」,`type` 子分组无独立语义。我们决定将 `ProviderType` 收敛为 `'llm' | 'google' | 'microsoft'`,由 `responseStyle`(扩展为 `'openai' | 'anthropic' | 'ollama'`)统一承载协议格式区分,`createLLMProvider` 从「type 二级路由」扁平化为「按 `responseStyle` 三路分发」。LLM 源配置由此收敛为 baseUrl + model + apiKey + responseStyle 四要素,事项 7 popup-settings 在 UI 层做的「LLM 源类目归并」深化到了数据模型层。

**状态**: accepted

**考虑过的选项**:

- **存量迁移:on-read backfill vs write-back**。选 on-read:`getProviders` 读出时把旧 `type='ollama'` 补全为 `llm`+`responseStyle='ollama'`、旧 `type='openai-compatible'` 补全为 `llm`+原 `responseStyle`,不回写存储。理由:最小侵入、可回滚、用户无感,回写需额外写操作且无业务价值。
- **registry 是否保留旧 type 识别**。选保留:`inferCategory` 同时识别新 `llm` 与旧 `openai-compatible`/`ollama`,防止迁移前(其他代码路径直接传 config)路由失败。

**后果**:

- 新增 LLM 协议风格只需扩展 `responseStyle` 枚举 + 在三路分发新增分支,无需再动 `ProviderType`。
- 存量配置靠 `getProviders` on-read 补全迁移,存储层不主动改写;`type` 联合收紧后,与旧 type 字符串的比较需 `as string` 规避 TS2367(见任务 #43 踩坑)。
- `KNOWN_DEFAULT_BASE_URLS` 对 LLM 类改为按 `responseStyle` 索引,传统类仍按 `type` 索引。
