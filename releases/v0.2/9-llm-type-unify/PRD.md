# PRD: LLM 类型分组统一为响应风格(llm-type-unify)

> **版本**:v0.2 · **功能事项**:9-llm-type-unify · **优先级**:P1 · **状态**:draft
> **PRD Issue**:[#42](https://github.com/Aiden-FE/llm-translator/issues/42) · **里程碑**:v0.2 - 翻译源配置闭环
> **最近更新**:2026-07-04

---

## 1. 摘要

本 PRD 把 LLM 翻译源的配置从「按 type 分组(openai-compatible/ollama)」简化为「单一 LLM 类型 + 响应风格(openai/anthropic/ollama)区分协议」。用户配置任意 LLM 源只需填完整接口、模型、Key、响应风格四项,不再被无意义的子类型分组增加认知负担。这是对事项7 `popup-settings`「LLM 源类目归并」的深化——从 UI 层 optgroup 聚合推进到数据模型层。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求落档 |
| 研发 | 待 `prodflow-subtask-gen` 拆分 | 全栈(AI + 前端 + 后端) |
| 关联事项 | 事项7 `popup-settings`(研发任务 #35 / PR #38) | 本事项深化其 UI 归并到数据模型层 |
| 依据 | ADR-001、feature/translator/unified-adapter·popup-settings·streaming | 适配层架构与现状路由 |

## 3. 背景

LLM Translator 在 v0.2 建立了统一翻译源适配层(事项1,ADR-001),把 LLM 类(openai-compatible/ollama)与传统类(google/microsoft)封装在同一接口下。LLM 类内部又按 `type` 细分 openai-compatible 与 ollama 两个子类型,并通过 `responseStyle`(openai/anthropic)仅在 openai-compatible 下区分协议格式。

事项7 `popup-settings` 已在 UI 层把这两个子类型归并到「LLM 接口配置」optgroup,但明确「不改 `ProviderType` 枚举、源类型分组是 UI 层聚合」。归并止步于 UI 层,数据模型层 `ProviderConfig.type` 仍区分二者,且 `responseStyle` 仅对 openai-compatible 生效。

实际使用中,用户配置 openai-compatible 或 ollama 时填写的字段完全一致——都是「完整接口路径(baseUrl) + 模型(model) + API Key + 响应风格」,二者仅请求/响应协议格式不同。子类型分组在用户侧无实际意义,却增加了配置复杂度与代码路由分支。现在做这件事,是因为事项7 已验证 UI 归并可行,深化到数据模型层的时机成熟,且能在 v0.2 发布前收敛配置形态。

## 4. 目标

**目标**:消除 LLM 类内部 type 子分组,由 `responseStyle` 统一承载协议格式区分,LLM 源配置收敛为 baseUrl + model + apiKey + responseStyle 四要素。

**为什么重要**:降低用户配置认知负担(从选「子类型 + 响应风格」简化为只选「响应风格」);收敛代码路由分支(`createLLMProvider` 从 type + responseStyle 二级路由扁平化为 responseStyle 三路分发);为后续接入其他原生协议(只需扩 responseStyle 枚举)留出干净扩展点。

**如何对齐愿景**:v0.2 迭代主题「翻译源配置闭环」要求配置体验简洁可靠;本事项把事项7 的 UI 归并彻底化,闭合「LLM 源配置」的简化路径。

**关键结果(SMART)**:
- **KR1**:LLM 源配置项由「type(openai-compatible/ollama)+ responseStyle(仅 openai-compatible)」收敛为「type=llm + responseStyle(openai/anthropic/ollama)」,100% LLM 源走新路由。
- **KR2**:存量 `type=ollama` / `type=openai-compatible` 配置 100% 无感迁移,迁移前后翻译输出一致(相同输入相同 `TranslateResult`)。
- **KR3**:`createLLMProvider` 路由分支从 type 二级判断改为 responseStyle 三路分发,流式 `translateStream` 同步;既有单元测试 + e2e 全部通过,划词翻译行为不退化。
- **KR4**:连通性测试覆盖 openai/anthropic/ollama 三种响应风格。

## 5. 细分市场

**为谁构建**:需要配置自有 LLM 翻译源的用户——包括使用 OpenAI 兼容接口(如 OpenAI、DeepSeek、通义千问等兼容端点)、原生 Anthropic Messages API、本地 Ollama 的技术用户。

**待完成任务**:「我想用自己的 LLM 接口做划词翻译,填一次就能用,不用理解子类型区别。」

**约束**:
- 用户需自行填写完整接口路径、模型名、API Key(本地 Ollama 可留空 Key)。
- 不同 LLM 厂商协议格式不同(OpenAI 兼容 / Anthropic 原生 / Ollama),需由响应风格区分。
- 传统翻译源(google/microsoft)用户不在本事项范围,保持独立。

## 6. 价值主张

| 维度 | 内容 |
|---|---|
| 客户任务 | 用自有 LLM 接口配置划词翻译源 |
| 客户获得 | 配置更简洁——只选「响应风格」而非「子类型 + 响应风格」;四要素清晰(baseUrl / model / key / responseStyle) |
| 客户避免 | 不再被 openai-compatible/ollama 子类型分组困扰;不再遇到「选了 ollama 却没有响应风格选项」的不一致体验 |
| 比现状更好 | 事项7 只在 UI 层归并,配置数据模型仍分叉;本事项彻底统一,配置形态与协议路由一致,扩展新协议只需加 responseStyle 枚举值 |

## 7. 解决方案

### 7.1 UX / 原型

配置页(popup/options 共用 `SourceConfigPanel.vue`)源卡片的源类型下拉简化:LLM 类由「OpenAI 兼容 / Ollama」两个选项收敛为单一「LLM」选项;响应风格单选对所有 LLM 源展示,选项为 OpenAI 兼容 / Anthropic / Ollama 三选一。详见 `## UX 设计` 章节(由 `prodflow-ux-evaluate` 补全)。

### 7.2 核心功能

**F1 类型层收敛**
- `ProviderType` 由 `'openai-compatible' | 'ollama' | 'google' | 'microsoft'` 收敛为 `'llm' | 'google' | 'microsoft'`。
- `responseStyle` 由 `'openai' | 'anthropic'` 扩展为 `'openai' | 'anthropic' | 'ollama'`,作为 LLM 协议格式区分器;缺省 `'openai'`(向后兼容)。
- `category` 语义不变(`'llm' | 'traditional'`)。

**F2 createLLMProvider 路由调整**
- 路由从「`type===ollama` → callOllama;`type===openai-compatible` 下 `responseStyle===anthropic` → callAnthropic;else → callOpenAICompatible」调整为按 `responseStyle` 三路分发:`ollama` → callOllama;`anthropic` → callAnthropic;`openai`(含缺省)→ callOpenAICompatible。
- 流式 `translateStream` 同步调整:`ollama` → callOllamaStream;`anthropic` → callAnthropicStream;`openai` → callOpenAICompatibleStream。

**F3 registry / inferCategory 调整**
- `registry.createProvider` 按 `category`(或 type 推断)路由到 createLLMProvider / createTraditionalProvider 不变;`inferCategory` 适配新 type:`'llm'` → llm,`'google'`/`'microsoft'` → traditional。
- 旧配置缺省 category 按 type 推断的兼容路径保留(同时识别旧 type `openai-compatible`/`ollama` → llm,保证存量读取不报错)。

**F4 存量配置无感迁移**
- `shared/storage.ts` 的 `getProviders` 读出时补全:旧 `type='ollama'` → `type='llm'` + `responseStyle='ollama'`;旧 `type='openai-compatible'` → `type='llm'` + `responseStyle` 取原值(anthropic 保留,缺省 openai)。
- 迁移在读出时即时完成,写入时不回写旧形态;用户无感知。

**F5 配置页 UI 调整**
- 源类型下拉:LLM 类 optgroup 由两选项收敛为单一「LLM」选项;传统翻译(google/microsoft)optgroup 不变。
- 响应风格单选:由「仅 `type==='openai-compatible'` 展示」改为「所有 LLM 源展示」,选项 OpenAI 兼容 / Anthropic / Ollama;新增 Ollama 选项。
- `onTypeChange`:切换为 LLM 时 baseUrl 命中已知默认值则自动替换为 LLM 默认(沿用 OpenAI 兼容默认端点);`onResponseStyleChange`:切换响应风格时 baseUrl 命中已知默认值则自动替换为对应风格默认端点(anthropic → Anthropic 官方、ollama → 本地 Ollama、openai → OpenAI 官方)。
- `isLlmType(type)` 适配:`type === 'llm'` 判断。

**F6 错误模型与安全约束不变**
- 复用四类 errorType(no-config / network / rate-limit / unreachable)与 `classifyError`,不新增错误类型。
- Key 仅存 `chrome.storage.local`,不写入日志/错误文案/commit;region 字段(传统 microsoft)不受影响。

### 7.3 技术

- 改动文件:`shared/types.ts`、`shared/ui/SourceConfigPanel.vue`、`shared/translator/llm-provider.ts`、`shared/translator/registry.ts`、`shared/storage.ts`、测试(`shared/translator/__tests__/`、`e2e/translate.spec.ts`)。
- 复用 ADR-001 工厂函数模式与四类错误模型,不改变适配层架构。
- 兼容层 `shared/llm.ts`(@deprecated)随之适配新 type,不破坏旧导出签名。

### 7.4 假设

- 假设存量用户配置中 `type='ollama'` 的源 baseUrl 已是完整 Ollama 接口路径(如 `http://localhost:11434/api/chat`),迁移后走 callOllama 行为不变——需测试验证。
- 假设 ollama 作为 responseStyle 后,其请求/响应协议处理与原 `callOllama` 完全一致(仅入口路由变化,不重写协议代码)。
- 假设事项7 已移除「云端/本地」误导后缀(bug #28),本事项 UI 不重新引入。

## 8. 发布

**时间范围**:约 1 周(全栈改动 + 存量迁移 + 测试回归)。

**第一版(v0.2-9)包含**:
- 类型层收敛(`ProviderType` / `responseStyle` 三值)
- `createLLMProvider` 路由按 responseStyle 三路分发(含流式)
- registry / inferCategory 适配
- 存量配置无感迁移
- 配置页 UI 简化(单一 LLM 选项 + 响应风格对所有 LLM 源展示 + 新增 ollama)
- 单元测试 + e2e 回归

**未来版本**:其他厂商原生协议(如新增 Gemini 原生协议)只需扩 `responseStyle` 枚举值 + 加 callXxx,无需再动 type 分组。

**验收标准**:
1. LLM 源配置仅 `type=llm` + `responseStyle`(openai/anthropic/ollama),四要素(baseUrl / model / apiKey / responseStyle)齐全。
2. 存量 `type=ollama` / `type=openai-compatible` 配置无感迁移,翻译行为不退化(相同输入相同 `TranslateResult`)。
3. `createLLMProvider` 按 responseStyle 三路分发,流式 `translateStream` 同步。
4. 连通性测试覆盖 openai/anthropic/ollama 三种响应风格。
5. e2e 划词翻译回归通过,既有单元测试(含 anthropic / openai 回归)全绿。
6. 隐私无变更(无新增数据收集/共享)。

**风险与缓解**:
- 适配层路由重构波及划词翻译 → 复用既有 e2e 用例回归,保证划词链路不退化。
- 存量迁移边界(旧 type 缺省 / category 缺省推断)→ `inferCategory` 保留旧 type 识别 + `getProviders` 读出补全,单元测试覆盖迁移路径。
- 响应风格切换时 baseUrl 自动替换误覆盖用户自定义端点 → 仅在命中「已知默认值集合」时替换,用户自定义端点保留(沿用事项5 既有 `KNOWN_DEFAULT_BASE_URLS` 机制)。

## UX 设计

### UX 依据

- Issue: `#42`
- 版本: `v0.2`
- 知识来源: `knowledges/ux/design-system.md`、`knowledges/ux/interaction-patterns.md`、`knowledges/ux/accessibility.md`、`knowledges/feature/translator/popup-settings.md`
- 设计假设: 事项7 已移除「云端/本地」误导后缀(bug #28),本事项不重新引入;响应风格切换的 baseUrl 联动复用事项5 既有 `KNOWN_DEFAULT_BASE_URLS` 机制。

### 视觉设计

> 设计系统与视觉原型由 `web-design-engineer` 产出,见 [`knowledges/ux/prototypes/v0.2-llm-type-unify.html`](../../../knowledges/ux/prototypes/v0.2-llm-type-unify.html)。
> 复用既有设计系统(`knowledges/ux/design-system.md`:色彩 #1F2937/#DC2626/#16A34A、字体 system-ui 14px、间距 4px 基准、圆角 卡片 8px/输入 4px、提供方卡片规范),本 PRD 不另立规范。以下仅记录差异性约束。

### 交互逻辑(差异)

- **源类型下拉收敛**:LLM 类 optgroup 由「OpenAI 兼容 / Ollama」两选项收敛为单一「LLM」option;传统翻译(google/microsoft)optgroup 不变。用户选 LLM 后不再区分子类型。
- **响应风格展示条件变更**:响应风格单选由「仅 `type==='openai-compatible'` 展示」改为「`type==='llm'` 展示」(所有 LLM 源);选项由 openai/anthropic 扩为 openai/anthropic/ollama 三选一,新增 Ollama,默认 openai。
- **baseUrl 联动替换**:切换响应风格时,若当前 baseUrl 命中「已知默认值集合」(`KNOWN_DEFAULT_BASE_URLS`),则自动替换为对应风格默认端点(anthropic → `https://api.anthropic.com/v1/messages`、ollama → `http://localhost:11434/api/chat`、openai → `https://api.openai.com/v1/chat/completions`);用户自定义端点(不在已知集合)保留不动。切换源类型为 LLM 时同理。
- **model 字段**:对所有 LLM 源展示(`type==='llm'`),行为与原 openai-compatible/ollama 一致;传统源不展示。
- **响应风格说明文案**:三种风格各配一句适用端点说明(OpenAI 兼容端点 / 原生 Anthropic Messages API / 本地 Ollama),沿用事项5 `responseStyleHint` 文案模式扩展。

### 状态流转(差异)

- **响应风格切换 → 测试结果复位**:切换响应风格时清空该卡连通性测试结果(`testMsgs[p.id]`),避免显示与新风格不符的旧结果(复用事项5 `onResponseStyleChange` 既有复位逻辑,扩展至 ollama)。
- **源类型切换 → 响应风格处理**:切换为 LLM 时响应风格保留当前值(来自旧 openai-compatible 的 anthropic 保留);切换为传统源时响应风格置 openai(沿用事项5 `onTypeChange` 既有逻辑,适配新 type 枚举)。

### 业务约束

- **baseUrl 自动替换边界**:仅在命中「已知默认值集合」时替换,用户自定义端点一律保留,避免误覆盖。
- **model 展示规则**:`type==='llm'` 展示 model 输入;传统源不展示。
- **响应风格取值约束**:仅 LLM 源有 responseStyle;传统源 responseStyle 无意义(缺省 openai,不展示单选)。
- **连通性测试**:复用 `test-provider` 通道,覆盖 openai/anthropic/ollama 三种响应风格;结果 inline 展示(✅ 译文 / ❌ 错误,按 ok/err 着色),复用既有 `isOk`/`isErr` 渲染。

### 设备适配(差异)

- 无新增断点差异。popup 变体保持 400×600 固定尺寸、卡片可折叠;options 变体 max-width 720px。源类型下拉收敛后 LLM 卡片高度略降,不影响布局。通用响应式策略引用 `knowledges/ux/design-system.md`。

### 可访问性(差异)

- 响应风格单选(radio group)键盘可达:Tab 聚焦 + 方向键切换(原生 radio 行为);可见聚焦环(`outline: 2px solid #1f2937`,沿用既有)。
- 源类型下拉收敛为单一「LLM」option 后,optgroup「LLM 接口配置」语义分组保留,供读屏识别类目。
- 响应风格说明文案以纯文字表达适用端点,不依赖纯图标;错误/成功色非唯一区分(同时有 ❌/✅ 文字),复用 `knowledges/ux/accessibility.md` 通用规则。
- `@media (prefers-reduced-motion: reduce)` 关闭过渡(沿用事项7 既有)。

### 验收补充

- [ ] 源类型下拉 LLM optgroup 仅一个「LLM」option;传统翻译 optgroup 不变。
- [ ] 响应风格单选对所有 LLM 源展示,含 OpenAI 兼容 / Anthropic / Ollama 三选项,默认 OpenAI 兼容。
- [ ] 切换响应风格:baseUrl 命中已知默认值时自动替换为对应风格默认端点;自定义端点保留。
- [ ] 切换响应风格时连通性测试结果复位;切换为传统源时响应风格置 openai。
- [ ] model 字段对所有 LLM 源展示,传统源不展示。
- [ ] 响应风格单选键盘可达(Tab + 方向键)+ 可见聚焦环;optgroup 语义分组保留。
- [ ] 连通性测试覆盖 openai/anthropic/ollama 三种响应风格,结果 inline 展示。
