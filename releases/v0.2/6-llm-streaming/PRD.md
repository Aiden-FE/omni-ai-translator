# PRD — LLM 翻译流式响应（llm-streaming）

| 项 | 内容 |
|---|---|
| 文档类型 | 需求文档（PRD） |
| 状态 | draft |
| 负责人 |  |
| 创建日期 | 2026-07-03 |
| 最近更新 | 2026-07-03 |
| 适用范围 | LLM Translator v0.2 — 功能事项 6 |
| 关联材料 | [../../../knowledges/startup-summary.md](../../../knowledges/startup-summary.md)、[../../../knowledges/product-wiki/strategy/index.md](../../../knowledges/product-wiki/strategy/index.md)、[../../../knowledges/product-wiki/roadmap/index.md](../../../knowledges/product-wiki/roadmap/index.md)、[../index.md](../index.md)、[../../../knowledges/adr/001-unified-translator-adapter-layer.md](../../../knowledges/adr/001-unified-translator-adapter-layer.md)、[./1-unified-adapter/PRD.md](../1-unified-adapter/PRD.md)、[./5-llm-anthropic-style/PRD.md](../5-llm-anthropic-style/PRD.md) |

---

## 1. 摘要

本 PRD 为 LLM 翻译引入流式响应：划词翻译触发后，译文 token 边产生边渲染到浮层，用户即时看到翻译进展，不再干等完整响应。仅 LLM 源（OpenAI 兼容 / Anthropic / Ollama）流式；传统源（Google / 微软）保持非流式一次性返回。它扩展功能事项 1 建立的 `TranslationProvider` 契约与 background↔content 消息层，不改既有非流式链路行为。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 / 负责人 | 待定 | 本事项由 prodflow-issue-report 登记后落档 |
| 研发（前端/扩展） | 待定 | MV3 + WXT + Vue 3 + TS；后端流式 provider + 前端浮层渐进渲染 |
| UX | 待定 | UX 章节待 issue 创建后补全 |

## 3. 背景

LLM Translator v0.1/v0.2 的划词翻译是非流式的：用户划词→点击触发按钮→浮层显示「翻译中…」→等待 LLM 返回完整响应→一次性显示译文。当前 `callOpenAICompatible` / `callAnthropic` / `callOllama` 均 `await resp.json()` 等待完整响应，经 `chrome.runtime.sendMessage` 请求-响应单次传递，浮层在完整译文返回前只显示「翻译中…」。

长文本翻译时，用户需干等数秒甚至更久，期间无任何渐进反馈——这与产品「轻量不打扰阅读流」的 UX 原则相悖，也削弱了 LLM 翻译相对传统机翻的体验优势。

**为什么现在做**：流式响应是 LLM 接口的原生能力（OpenAI / Anthropic / Ollama 均支持 SSE 或 NDJSON 流式），技术上早已可行。功能事项 5（llm-anthropic-style）的知识沉淀中曾将「流式响应 streaming」明确列入「不包含，延后 v0.3+」。本事项将其**前移到 v0.2 作为功能事项 6** 落地——产品决定优先改善翻译即时反馈体验，不再顺延到 v0.3。

**依赖前提**：功能事项 1（unified-adapter）已建立的 `TranslationProvider` 接口、provider 注册路由、四类错误模型是本事项的契约基础。本事项在其上扩展流式能力，不重写适配层。

## 4. 目标

**目标**：LLM 翻译采用流式响应，译文渐进渲染到浮层，用户即时看到翻译进展；非 LLM 源行为不退化。

**对齐愿景**：产品策略中「轻量交互、不打扰阅读流」与「LLM 提供优于传统机翻的译文体验」。流式响应把 LLM 的生成过程透明地呈现给用户，把「等待」变成「看见」，强化 LLM 翻译的体验差异化。

**关键结果（SMART）**：

| 编号 | 关键结果 | 衡量方式 |
|---|---|---|
| KR1 | 三种 LLM 源（openai-compatible / anthropic / ollama）翻译时浮层渐进渲染译文，首字出现时间显著早于非流式完整响应时间 | 手动验证 + 代码审查 |
| KR2 | 流式过程中浮层不再仅显示「翻译中…」，而是逐 chunk 追加译文文本 | 代码审查 + e2e |
| KR3 | 传统源（google / microsoft）保持非流式一次性返回，行为与 v0.2 一致 | v0.2 e2e 用例回归通过 |
| KR4 | 流式中断（网络断开 / 4xx / 429）归入四类 `errorType`，浮层正确反馈 | 单元测试覆盖流式错误路径 |
| KR5 | v0.1/v0.2 划词翻译 e2e 回归全绿（含流式 LLM 源与非流式传统源） | Playwright e2e |

## 5. 细分市场

本事项服务于产品既有两类用户，重点改善**长文本/慢网络场景**的翻译体验：

- **普通阅读用户**（待完成任务：阅读外文页面，想要快速看懂）：长段落翻译时不再面对数秒空白等待，译文渐进出现降低等待焦虑。
- **技术用户 / 开发者**（待完成任务：自带 Key、接本地模型）：本地 Ollama 推理较慢时，流式让首字更早出现，体验明显改善。

**约束**：
- MV3 Service Worker 会被回收，流式 port 连接需处理 SW 中断与重连/清理。
- content-script 不直接 fetch 第三方接口，流式 fetch 仍在 background 内进行，chunk 经 port 推送到 content。
- 流式 fetch 需读取 `ReadableStream`，MV3 background SW 支持 `fetch` + `response.body.getReader()`。
- 跨域请求仍需 manifest `host_permissions`（沿用既有声明，流式不改变域名范围）。

## 6. 价值主张

| 客户任务 / 需求 | 客户获得 | 客户避免的痛点 | 我们做得更好的地方 |
|---|---|---|---|
| 想快速看懂外文长文本 | 译文边生成边显示，首字即反馈 | 干等数秒无任何反馈的空白期 | 流式渐进渲染 vs 一次性等待 |
| 本地模型推理慢也想用 | Ollama 流式首字更早 | 本地模型慢时仿佛卡死 | 流式让本地慢推理也可用 |
| 想要稳定的翻译反馈 | 流式中断仍归四类错误，明确提示 | 流式中断只看到模糊卡顿 | 复用四类 errorType 差异化反馈 |

## 7. 解决方案

### 7.1 UX / 原型

流式改造用户可见的部分集中在划词浮层：触发后浮层从「翻译中…」态过渡到「译文渐进出现」态，文本逐 chunk 追加，流结束定稿。流式态的视觉表现（打字机/光标/渐显）、流式中断时已渲染部分译文的处理（保留 + 错误提示 / 清除）由 UX 评审定。

> 详细 UX 设计见下文「## UX 设计」章节。

### 7.2 核心功能

**7.2.1 Provider 契约扩展（流式方法）**

`TranslationProvider` 接口新增流式方法（可选实现）：

- `translateStream?(req: TranslateRequest, onChunk: (chunk: TranslateChunk) => void): Promise<TranslateResult>`：流式翻译，逐 chunk 经 `onChunk` 回调推送，返回最终 `TranslateResult`（含完整译文与可能的错误）。
- `TranslateChunk`：`{ deltaText: string }`（增量译文片段）；最终 `TranslateResult` 复用现有类型，`translatedText` 为拼装后的完整译文。
- LLM provider（openai-compatible / anthropic / ollama）实现 `translateStream`；传统 provider 不实现（`undefined`）。
- 既有 `translate(req): Promise<TranslateResult>` 非流式契约保留，供传统源、连通性测试 `test()` 与单元测试使用，行为不变。

**7.2.2 适配层流式入口**

`shared/translator/index.ts` 新增流式统一入口：

- `translateWithAdapterStream(req, onChunk): Promise<TranslateResult>`：读取生效源配置（同 `translateWithAdapter`），创建 provider。
  - provider 实现 `translateStream` → 调流式方法，逐 chunk 经 `onChunk` 上抛，返回最终结果。
  - provider 未实现 `translateStream`（传统源）→ 回退调 `translate(req)`，将完整译文作为单 chunk 经 `onChunk` 推送一次，再返回结果（非流式源对上层表现为「一次性流」）。
- 既有 `translateWithAdapter(req)` 非流式入口保留，行为不变（连通性测试、兼容路径）。
- 无可用源仍返回 `TranslateResult{ errorType: 'no-config' }`（不调 onChunk）。

**7.2.3 消息层 Port 化**

translate 流程从 `chrome.runtime.sendMessage` 请求-响应改为 `chrome.runtime.Port` 长连接：

- content-script 划词触发翻译时，`chrome.runtime.connect({ name: 'translate-stream' })` 建立端口，通过 `port.postMessage` 发送翻译请求（text / targetLang / sourceLang）。
- background 监听连接，从 port 消息取出请求，调 `translateWithAdapterStream(req, onChunk)`：
  - `onChunk` 内 `port.postMessage({ type: 'chunk', deltaText })` 逐 chunk 推送。
  - 完成时 `port.postMessage({ type: 'done', result })` 并 `port.disconnect()`。
  - 错误时 `port.postMessage({ type: 'error', result })`（result 含 errorType）并 disconnect。
- content-script `port.onMessage` 监听：`chunk` → 渐进追加译文到浮层；`done` → 定稿；`error` → 错误反馈。
- SW 回收处理：port 断开时 content 侧 `port.onDisconnect` 清理浮层态；流式进行中 SW 被回收属异常路径，归入 `network` 错误反馈（不保证断点续传）。
- 既有 `sendMessage({type:'translate'})` 路径：可保留作兼容或移除，由研发评估；连通性测试 `test-provider` 仍走 sendMessage（无需流式）。

**7.2.4 LLM 流式协议实现**

`shared/translator/llm-provider.ts` 三条调用路径新增流式实现（沿用各响应风格的鉴权与请求体规范，仅加 `stream: true` 并改用 `response.body.getReader()` 解析流）：

| 源路径 | 流式请求 | 流式解析 |
|---|---|---|
| `callOpenAICompatible`（含流式变体） | body 加 `stream: true` | SSE：按行读 `data: {...}`，取 `choices[0].delta.content`；遇 `data: [DONE]` 结束 |
| `callAnthropic`（含流式变体） | body 加 `stream: true` | SSE：解析事件流，`content_block_delta` 事件取 `delta.text`；`message_stop` 结束 |
| `callOllama`（含流式变体） | body 改 `stream: true`（当前为 false） | NDJSON：按行读 JSON，取 `message.content`；流结束信号 |

- 每条流式路径内部累加 delta 得到完整 `translatedText`，填入最终 `TranslateResult`。
- 流式 fetch 非 2xx：读状态码经 `classifyError` 归类（429→rate-limit，4xx/5xx→unreachable），返回错误 result。
- 流读取过程抛异常 / 流中断：`classifyError(err)` → `network`，返回已收 delta 拼装的部分译文 + 错误标记（是否回传部分译文由 7.2.6 与 UX 定）。

**7.2.5 浮层渐进渲染**

content-script 浮层在流式过程中的状态扩展：

| 状态 | 反馈 |
|---|---|
| 待触发 | 圆形「译」按钮（沿用） |
| 流式加载 | 译文文本逐 chunk 追加（替代 v0.2「翻译中…」静态文案）；可选打字机/光标视觉 |
| 流式定稿 | 完整译文文本（沿用成功态） |
| 流式中断 | 四类 errorType 差异化文案 + 引导（沿用功能事项 1 错误模型） |

- 流式加载态对 LLM 源生效；传统源经「一次性流」回退，浮层表现为一次显示完整译文（等价于现状）。
- 渐进渲染须避免频繁重排：chunk 追加做轻量节流/合并（如 requestAnimationFrame 合批）。

**7.2.6 错误与回退**

- 流式中断错误经 `classifyError` 归入四类 `errorType`，浮层按功能事项 1 的差异化文案反馈。
- 已渲染的部分译文处理：**默认保留已渲染译文 + 追加错误提示行**（待 UX 评审确认；备选：清除并仅显示错误）。
- 非流式回退：provider 不支持流式 / 流式建立失败 → 适配层回退 `translate()` 一次性返回，浮层单次显示。

### 7.3 技术

- 技术栈：Manifest V3 + WXT + Vue 3 + TypeScript，原生 `fetch` + `ReadableStream`（不引入 SDK）。
- 模块位置：
  - provider 契约扩展：`shared/translator/types.ts`（`translateStream` / `TranslateChunk`）、`shared/types.ts`（如需 chunk 类型）。
  - 流式入口：`shared/translator/index.ts`（`translateWithAdapterStream`）。
  - LLM 流式实现：`shared/translator/llm-provider.ts`（三条流式变体）。
  - 消息层：`entrypoints/background.ts`（port 监听）、`entrypoints/content.ts`（port 建连 + 渐进渲染）。
- 存储：不新增存储项；生效源读取沿用 `chrome.storage.local`。
- 类型：`TranslateChunk` 新增；`TranslationProvider.translateStream` 可选字段，向后兼容（传统 provider 无需改动）。
- 测试：vitest 单元测试覆盖流式解析（SSE/NDJSON 拆包、delta 累加、错误归类）、适配层流式/回退分支；playwright e2e 覆盖划词流式渲染与流式中断反馈。

### 7.4 假设

| 假设 | 验证方式 | 失败信号 |
|---|---|---|
| MV3 background SW 支持 `fetch` + `response.body.getReader()` 读取流式响应 | 研发阶段在三种 LLM 源各跑一次流式验证 | 流读取在 SW 不可用或被提前回收 |
| OpenAI 兼容 / Anthropic / Ollama 流式协议解析与各端点实际一致 | 三种源各做流式联调 | delta 字段路径不符 / SSE 事件名不符 |
| port 长连接在翻译周期内稳定，SW 回收为低概率异常 | e2e + 手动长文本翻译 | 频繁断连导致流式不可用 |
| 流式 chunk 追加不引起浮层性能问题（长文本） | 长文本手动验证 + 节流合批 | 重排卡顿 / 丢帧 |
| 传统源经「一次性流」回退后浮层行为与现状一致 | v0.2 传统源 e2e 回归 | 行为退化 |

## 8. 发布

**时间范围**：约 1–1.5 周（provider 契约扩展 + 三种 LLM 流式实现 + port 消息层 + 浮层渐进渲染 + 错误回退 + e2e 回归）。

**第一版（v0.2 本 PRD 范围）**：
- `TranslationProvider` 流式方法 + `TranslateChunk` 类型
- 适配层 `translateWithAdapterStream`（含非流式回退）
- 三种 LLM 源流式实现（OpenAI SSE / Anthropic SSE / Ollama NDJSON）
- translate 流程 port 化（content↔background）
- 浮层渐进渲染 + 流式态视觉（待 UX）
- 流式中断错误归入四类 errorType
- v0.1/v0.2 划词 e2e 回归通过

**未来版本**：
- 流式中途取消（用户主动终止，关闭浮层即取消）
- 多源流式自动降级
- 流式时动态调整 prompt

## 本轮不做

| 功能 | 延后原因 | 预计版本 |
|---|---|---|
| 流式中途取消（用户主动终止） | 需 AbortController + UI 取消入口，增加复杂度 | v0.3+ |
| 多源流式自动降级 | 依赖多源降级能力（v0.3+） | v0.3+ |
| 流式时动态调整 prompt | 与 prompt 自定义能力耦合 | v0.3+ |
| 传统源流式 | Google / 微软接口返回完整响应，不支持流式 | 不做 |

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| LLM 流式 | 三种 LLM 源翻译时浮层渐进渲染译文，首字早于完整响应 | P0 |
| 非流式回退 | 传统源一次性返回译文，行为与 v0.2 一致 | P0 |
| 消息层 port 化 | translate 流程经 port 推送 chunk，content 渐进渲染 | P0 |
| 错误归类 | 流式中断归入四类 errorType，浮层差异化反馈 | P0 |
| 划词回归 | v0.1/v0.2 划词翻译 e2e 全绿 | P0 |
| 性能 | 长文本流式渲染无明显卡顿（节流合批） | P1 |

## UX 设计

### UX 依据

- Issue: `#24`（https://github.com/Aiden-FE/llm-translator/issues/24）
- 版本: v0.2
- 知识来源: [knowledges/ux/interaction-patterns.md](../../../knowledges/ux/interaction-patterns.md)（划词浮层状态反馈）、[knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)（浮层视觉）、[knowledges/ux/accessibility.md](../../../knowledges/ux/accessibility.md)（对比度、非颜色依赖、aria-live）
- 设计假设: LLM 流式译文渐进出现比静态「翻译中…」更降低等待焦虑；该假设待用户验证

### 视觉设计

> 本 PRD 不新增独立用户界面，流式渲染复用现有划词浮层视觉（见 [knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md)「翻译浮层」：深色背景 `#1F2937` + 浅色文字 `#F9FAFB`、最大宽度 360px、圆角 8px、内边距 10px 12px）。不单独产出视觉原型；视觉差异仅体现在译文文本的渐进追加与流式态光标。

流式态增量视觉（沿用既有浮层，仅文本区行为变化）：

- 译文文本逐 chunk 追加到浮层文本区，替代 v0.2 静态「翻译中…」文案。
- 流式进行中可选显示闪烁竖线光标 `▋`（CSS animation）提示「正在生成」，流结束移除。光标为辅助视觉，非唯一状态指示（同时有 aria-live 通告，见可访问性）。

### 交互逻辑（差异）

通用划词流程（选中→触发按钮→浮层→关闭）引用 [knowledges/ux/interaction-patterns.md](../../../knowledges/ux/interaction-patterns.md)，不重复展开。本 PRD 的差异在于**浮层「加载」态从静态文案改为渐进渲染译文**：

| 阶段 | LLM 源（流式） | 传统源（非流式回退） |
|---|---|---|
| 触发 | 点击「译」按钮 → 浮层出现 | 同左 |
| 加载 | port 推送 chunk → 译文逐字追加 + 光标 | 浮层显示「翻译中…」（沿用 v0.2） |
| 定稿 | 流结束 → 移除光标，译文定稿 | 一次性返回 → 显示完整译文 |
| 中断 | 已渲染译文保留 + 错误提示行 | 四类 errorType 错误反馈（沿用） |

- chunk 追加做轻量节流（requestAnimationFrame 合批），避免高频重排。
- 流式中断时**默认保留已渲染译文 + 追加错误提示行**（如「❌ 翻译中断，请检查网络」），让用户看到部分成果；备选「清除仅显示错误」待用户验证后定。

### 业务约束

- 浮层只负责渲染 chunk 与错误展示，不判别源类型或错误类型（错误归类由适配层 `classifyError` 产出）。
- 流式 chunk 经 port 推送，content 不直接 fetch。
- 本轮**不做流式中途取消**（用户关闭浮层即结束，不主动 AbortController 终止请求）。
- 流式态仅对 LLM 源生效；传统源经适配层「一次性流」回退，浮层表现为一次显示完整译文。

### 状态变化（差异）

浮层状态在 v0.2 基础上细化加载态：

| 状态 | 反馈 |
|---|---|
| 待触发 | 圆形「译」按钮（沿用） |
| 加载-流式 | 译文逐 chunk 追加 + 闪烁光标 `▋`（LLM 源） |
| 加载-非流式 | 「翻译中…」（传统源，沿用 v0.2） |
| 成功 | 完整译文文本，光标移除（沿用） |
| 流式中断 | 已渲染译文 + 错误提示行（如「❌ 翻译中断」） |
| 失败-配置缺失/网络/限流/源不可达 | 四类 errorType 差异化文案 + 引导（沿用功能事项 1） |

### 设备适配（差异）

无差异。浮层宽度自适应沿用 [knowledges/ux/design-system.md](../../../knowledges/ux/design-system.md) 响应式规则，最大宽度 360px 不变；长文本流式追加自动换行。

### 可访问性（差异）

- 流式译文进展用 `aria-live="polite"` 通告（屏幕阅读器在断点朗读已生成译文），不打断用户当前任务；流式定稿时通告完整译文。
- 错误反馈不依赖颜色，沿用「❌」文字前缀 + 可读文案（符合 [knowledges/ux/accessibility.md](../../../knowledges/ux/accessibility.md)「不依赖纯图标」）。
- 流式光标 `▋` 为视觉辅助，非唯一状态指示，不影响键盘/读屏用户（状态由 aria-live 与文本承载）。
- 浮层深色背景 `#1F2937` + 浅色文字 `#F9FAFB` 对比度满足 WCAG AA（沿用）。

### 验收补充

- LLM 源翻译时浮层渐进渲染译文（非静态「翻译中…」），首字出现早于完整响应。
- 流式光标流式进行中显示、定稿移除；错误反馈含「❌」前缀不依赖颜色。
- 流式译文进展有 aria-live 通告；对比度满足 WCAG AA。
- 传统源浮层行为与 v0.2 一致（一次性显示完整译文）。
- v0.1/v0.2 划词成功/加载/触发流程行为不退化（回归）。
