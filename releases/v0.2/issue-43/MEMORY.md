# 任务记忆文档

本文档用于存储当前开发任务 #43 的关键信息。

## 任务基础信息

| 项 | 说明 |
|----|------|
| 版本号 | v0.2 |
| ISSUE_ID | #43 |
| 基础分支 | master |
| 任务分支 | issue-43 |
| PRD Issue | #42 |
| 并发安全 | parallel-safe |
| MR 策略 | base-branch |
| 上游依赖 | 无 |
| Stacked MR | 否 |

---

## API 接口信息

### ProviderType 类型收敛

- 旧: `'openai-compatible' | 'ollama' | 'google' | 'microsoft'`
- 新: `'llm' | 'google' | 'microsoft'`
- 向后兼容: registry `inferCategory` 仍识别旧 type(`openai-compatible`/`ollama` → llm)

### responseStyle 扩展

- 旧: `'openai' | 'anthropic'`(仅 openai-compatible 生效)
- 新: `'openai' | 'anthropic' | 'ollama'`(所有 LLM 源生效),缺省 `'openai'`

### createLLMProvider 路由

- 旧: `type==='ollama'` → callOllama;`responseStyle==='anthropic'` → callAnthropic;else → callOpenAICompatible
- 新: `responseStyle==='ollama'` → callOllama;`responseStyle==='anthropic'` → callAnthropic;else(openai/缺省) → callOpenAICompatible
- 流式 translateStream 同步调整

### 存储迁移(getProviders on-read backfill)

- `type='ollama'` → `type='llm'` + `responseStyle='ollama'`
- `type='openai-compatible'` → `type='llm'` + `responseStyle` 取原值(缺省 openai)
- `type='llm'` → 不变(已是新形态)

### KNOWN_DEFAULT_BASE_URLS

- openai: `https://api.openai.com/v1/chat/completions`
- anthropic: `https://api.anthropic.com/v1/messages`
- ollama: `http://localhost:11434/api/chat`
- 额外含短前缀: `https://api.openai.com`, `http://localhost:11434`

---

## 业务规则与约束

- LLM 源配置四要素: baseUrl + model + apiKey + responseStyle,type 统一为 `llm`
- 传统翻译(google/microsoft)保持独立 type,不受影响
- 切换响应风格时 baseUrl 仅在命中 KNOWN_DEFAULT_BASE_URLS 时自动替换,自定义端点保留
- 切换响应风格时连通性测试结果复位(testMsgs[p.id] 清除)
- 切换为传统源时 responseStyle 置 openai
- Key 仅存 chrome.storage.local,不写入日志/错误文案/commit
- 隐私无变更:LLM 文本外传行为同事项5/6

---

## 技术决策

- **on-read 迁移而非 write-back**: getProviders 读出时补全,不回写旧形态,用户无感。最小侵入、可回滚。
- **registry 保留旧 type 识别**: inferCategory 同时识别 `llm`(新)和 `openai-compatible`/`ollama`(旧),保证存量配置在迁移前也能正确路由。
- **createLLMProvider 路由从 type 改为 responseStyle**: 消除二级路由,扁平化为三路分发。
- **DEFAULT_BASE_URL 改为按 responseStyle 索引**(LLM 类),传统类仍按 type 索引。

---

## 依赖关系

- 依据 ADR-001(统一适配层工厂模式)、feature/translator/unified-adapter·popup-settings·streaming
- 事项7 popup-settings(任务 #35 / PR #38)已做 UI 层归并,本任务深化到数据模型层
- 无上游 PR 依赖,base-branch 策略,直接基于 master

---

## 自动决策记录

| 决策 | 理由 |
|------|------|
| on-read 迁移不回写 | 最小侵入,用户无感,可回滚;回写需额外写操作且无业务价值 |
| registry 旧 type 兼容保留 | 防止迁移前(如其他代码路径直接传 config)路由失败 |
| DEFAULT_BASE_URL 拆分为 LLM(按 responseStyle) + 传统(按 type) | LLM 类 baseUrl 随响应风格变化,传统类不变 |
| e2e 新增 ollama 风格用例 | 验收要求覆盖三种响应风格连通性测试 |

---

## 踩坑记录

### TypeScript 类型比较:旧 type 字符串不在 ProviderType 联合中
- **原因**: `ProviderType` 收敛后不再含 `'ollama'`/`'openai-compatible'`,TS 报 TS2367 比较无意
- **解决方案**: `migrateProvider` 中 `const rawType = p.type as string` 转为 string 比较;registry `inferCategory` 参数改为 `string`
- **影响**: storage.ts, registry.ts

### e2e ollama 断言:stream 字段为 true 非false
- **原因**: 划词翻译走流式路径(callOllamaStream,stream:true),连通性测试才走非流式(callOllama,stream:false);getLastRequestBody 返回最后一次请求(流式翻译)
- **解决方案**: 断言改为 `expect(body?.stream).toBe(true)`

---

## 待沉淀知识

- **feature**(LLM 类型统一为响应风格): 交互模式(响应风格 radio 三选一)、状态流转(切换复位测试结果)、迁移策略(on-read backfill)。相关文件: types.ts, llm-provider.ts, registry.ts, storage.ts, SourceConfigPanel.vue。建议路径: `knowledges/feature/translator/llm-type-unify.md`
- **adr**(responseStyle 作协议区分器取代 type 子分组): 决策(从 type 二级路由改为 responseStyle 三路分发)、取舍(on-read 迁移 vs write-back、保留旧 type 兼容)。建议路径: `knowledges/adr/adr-002-response-style-as-protocol-discriminator.md`
- **context**(on-read 存储迁移模式): 场景(chrome.storage.local 存量配置无感迁移)、实现(getProviders 读出时补全 type+responseStyle)。建议路径: `knowledges/context/development/on-read-storage-migration.md`
