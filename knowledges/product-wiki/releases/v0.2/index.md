# 迭代主文档

| 项 | 内容 |
|---|---|
| **版本号** | v0.2 |
| **迭代主题** | 翻译源配置闭环 |
| **状态** | draft |
| **负责人** |  |
| **创建日期** | 2026-07-01 |
| **最近更新** | 2026-07-04（PR #44 合并：研发任务 #43 闭环，功能事项 9 reviewing→done；#43 随 PR 合并自动关闭；知识沉淀 adr/005 responseStyle 协议区分器、feature/translator/llm-type-unify、context/development/on-read-storage-migration；PRD #42 关闭）；2026-07-04（研发任务 #43 实现完成：PR #44 已创建待合并，功能事项 9 draft→reviewing；typecheck + 143 单测 + 7 e2e 全绿；知识沉淀要点 feature/adr/context 已收集，待 PR 合并后统一沉淀）；2026-07-04（新增功能事项 9 llm-type-unify PRD draft #42：LLM 类型分组统一为响应风格(responseStyle 扩展 openai/anthropic/ollama)、深化事项7 UI 归并到数据模型层；UX 原型 v0.2-llm-type-unify.html 登记 prototypes 索引）；2026-07-04（研发任务 #35/#36 合并：PR #38（popup-settings）、PR #39（md-render）已合并到 master，功能事项 7/8 翻转 done；知识库登记 adr/003·004、feature/translator/popup-settings·markdown-render、context/development/dompurify-lazy-init；PRD #30/#31 关闭）；2026-07-04（功能事项 8 md-render 拆分研发任务 #36（全栈 · AI+前端+后端 · parallel-safe · base-branch））；2026-07-03（登记 bug #27/#28/#29 → 独立快修并合并 PR #32/#33/#34，Issue 已关闭；新增功能事项 7 popup-settings PRD draft #30、8 md-render PRD draft #31；功能事项 7 拆分研发任务 #35（前端 · parallel-safe · base-branch）；事项 1-6 done） |
| **开发周期估算** | ≤3 周（约 2.5–3 周） |
| **闭环业务链** | 用户在配置页选择/配置翻译源（免 Key 兜底 / 传统 API Key / LLM）→ 划词触发 → 统一适配层按配置路由 → 调用对应源 → 浮层展示译文；未配置任何源时默认走免 Key 兜底源，开箱即用 |
| **关联材料** | [../../strategy/index.md](../../strategy/index.md)、[../../roadmap/index.md](../../roadmap/index.md)、[../../../startup-summary.md](../../../startup-summary.md) |

---

## 迭代概览

本轮迭代是 LLM Translator 的首个正式迭代落档版本。v0.1（划词翻译 MVP）已在代码层实现但未走 releases 落档流程；本轮聚焦「翻译源配置」这一支撑性业务链的闭环。

**目标**：在现有 LLM 适配层之上，建立统一的翻译源适配层，引入传统翻译接口（Google/微软）作为免 Key 兜底，使用户在未配置任何模型时也能开箱即用；同时支持用户为传统翻译源填入自有 API Key 以提升额度与稳定性。

**范围边界**：本轮只闭环「翻译源配置与调用」一条业务链，不涉及小窗输入翻译、全文翻译、历史记录等其它业务链。本轮调整了 v0.1「不内置任何模型接口」的原则——内置传统翻译的免 Key 公共端点作为兜底，相应需更新隐私声明。

## 功能清单

| 编号 | 概要标题 | 优先级 | PRD 文档 | 状态 | 闭环路径说明 |
|---|---|---|---|---|---|
| 1 | unified-adapter | P0 | `./1-unified-adapter/PRD.md` | done | 抽象统一翻译源接口，将现有 LLM 适配迁移为 provider 之一，新增传统翻译 provider 抽象，对上层暴露一致接口；前端浮层按四类 errorType 差异化反馈（#10 后端 + #11 前端） |
| 2 | builtin-fallback | P0 | `./2-builtin-fallback/PRD.md` | done | 内置 Google + 微软免 Key 公共端点 provider，作为用户可选的免费翻译源；全新安装默认选中 microsoft，用户可随时切换；无隐式自动回退（研发任务 #14，PR #15 已合并） |
| 3 | traditional-apikey-config | P0 | `./3-traditional-apikey-config/PRD.md` | done | 配置页支持传统翻译源填 Key/端点，启用后覆盖免 Key 兜底；后端 #18 有 Key 走官方 API + region 字段（PR #20 已合并），前端 #19 region 输入框与联调回归（PR #21 已合并）；PRD #3 验收标准全覆盖，五条均达成 |
| 4 | source-picker-ui | P0 | `./4-source-picker-ui/PRD.md` | done | 配置页翻译源选择 UI：源类型选择、当前生效源展示、连通性测试扩展；研发任务 #16 完成，PR #17 已合并 |
| 5 | llm-anthropic-style | P1 | `./5-llm-anthropic-style/PRD.md` | done | LLM 适配层新增 anthropic 响应风格（默认 openai，向后兼容）；Issue #6 驱动，研发任务 #22 完成（full-stack · AI+前端+后端，parallel-safe，base-branch），PR #23 已合并 |
| 6 | llm-streaming | P1 | `./6-llm-streaming/PRD.md` | done | LLM 翻译采用流式响应，译文逐步呈现，避免用户干等；仅 LLM 源（openai-compatible/anthropic/ollama）流式，传统源（google/microsoft）保持非流式；涉及 provider 契约、background↔content 消息层（port 流式）、浮层渐进渲染；研发任务 #25 已完成（full-stack · AI+前端+后端，parallel-safe，base-branch），PR #26 已合并 |
| 7 | popup-settings | P1 | `./7-popup-settings/PRD.md` | done | 点击插件 icon 右上角弹出设置界面（popup），现代化重构配置入口，兼顾后续自由输入翻译入口；含 LLM 源类目归并（openai-compatible/ollama 统一为「LLM 接口配置」）；研发任务 #35（前端 · parallel-safe · base-branch）已完成，PR #38 已合并 |
| 8 | md-render | P1 | `./8-md-render/PRD.md` | done | 翻译浮层按 markdown 可读渲染译文（流式感知 + prompt 保留格式 + XSS 过滤）；研发任务 #36（全栈 · AI+前端+后端 · parallel-safe · base-branch）已完成，PR #39 已合并 |
| 9 | llm-type-unify | P1 | `./9-llm-type-unify/PRD.md` | done | 取消 LLM 类 type 子分组（openai-compatible/ollama），responseStyle 扩展为 openai/anthropic/ollama 统一区分协议格式；LLM 配置收敛为 baseUrl+model+apiKey+responseStyle；存量配置无感迁移；深化事项7 UI 归并到数据模型层；研发任务 #43（全栈 · AI+前端+后端 · parallel-safe · base-branch）已完成，PR #44 已合并；知识库登记 adr/005、feature/translator/llm-type-unify、context/development/on-read-storage-migration |

## 本轮不做

| 功能 | 所属业务链 | 延后原因 | 预计纳入版本 |
|---|---|---|---|
| 多源自动降级与优先级列表 | 翻译源配置 | 本轮源失败仅明确错误提示、人工切换；自动降级增加状态管理复杂度，超三周风险 | v0.3+ |
| 小窗输入翻译 + 翻译历史记录 | 小窗输入翻译 | 独立交互入口，属另一业务链 | v0.3（顺延） |
| 全文翻译（整页 DOM 改造 + 分段并发） | 全文翻译 | 复杂度高、风险大，独立业务链 | v0.4（顺延） |
| 跨浏览器（Firefox/Edge） | 平台 | 第一版仅 Chrome 验证 | 后续评估 |
| 商店上架与商业化 | 商业化 | 第一版开源免费，商业化延后 | 后续评估 |

> 注（2026-07-06）：上表「预计纳入版本」为 v0.2 规划时的预测，后续战略转向已调整——v0.3 改为自动化插件市场发布流水线（含跨浏览器、商店上架），全文翻译 v0.4、小窗输入 v0.5、翻译历史待定，商业化渐进式不预设版本。以 [roadmap/index.md](../../roadmap/index.md) 为准。

## 依赖与风险

| 类型 | 内容 | 影响范围 | 缓解措施 | 负责人 |
|---|---|---|---|---|
| 依赖 | v0.1 已实现的 LLM 适配层与配置页 | 适配层重构、配置页扩展 | 复用现有 provider 结构，迁移而非重写 |  |
| 风险 | 适配层重构波及现有划词翻译 | 划词翻译回归 | 复用现有 e2e 用例回归，保证划词链路不退化 |  |
| 风险 | 免 Key 公共端点不稳定（限流/封锁/地域不可达，如 Google 在大陆不可达） | 兜底翻译可用性 | 内置 Google + 微软两个源，失败时明确错误提示并支持人工切换 |  |
| 风险 | 隐私变更：默认外传文本到 Google/微软 | 隐私合规 | 同步更新隐私声明，明示默认外传行为与用户权利 |  |
| 隐私登记 | PRD 2-builtin-fallback、3-traditional-apikey-config 涉及隐私变更（新增第三方数据共享：文本外传到 Google/微软） | 隐私合规 | 需在 sprint-open Phase 4 步骤 5 统一更新隐私声明 |  |
| 隐私登记 | PRD 5-llm-anthropic-style 涉及隐私文案补充：LLM 提供方扩展到原生 Anthropic 端点（非 OpenAI 兼容协议），现有隐私声明第 5 节仅列「OpenAI 兼容接口 / 本地 Ollama」需补充 | 隐私合规 | 发布前用 prodflow-prd revise 或 privacy-policy 更新隐私声明，明示原生 Anthropic 端点文本外传（数据流同既有 LLM 提供方，仅协议/厂商补充） |  |

## 验收标准

| 验收项 | 验收条件 | 优先级 |
|---|---|---|
| 统一适配层 | 上层翻译调用通过统一接口路由到任意已注册 provider，LLM 与传统源行为一致 | P0 |
| 免 Key 兜底 | 用户未配置任何源时，划词翻译可直接返回译文（走免 Key 公共端点） | P0 |
| 传统 API Key 配置 | 配置页可为 Google/微软填入 Key/端点，启用后覆盖免 Key 兜底并连通性测试通过 | P0 |
| 配置页 UI | 源类型可选择、当前生效源可见、连通性测试覆盖新增源类型 | P0 |
| 划词回归 | v0.1 划词翻译链路在适配层重构后行为不退化（e2e 通过） | P0 |
| 隐私声明 | 隐私声明已反映默认外传文本到 Google/微软的行为，变更记录已登记 | P0 |

## 里程碑信息

| 项 | 内容 |
|---|---|
| **里程碑标题** | `v0.2 - 翻译源配置闭环` |
| **仓库** | Aiden-FE/llm-translator（GitHub） |
| **截止日期** | 2026-07-22 |
| **里程碑链接** | https://github.com/Aiden-FE/llm-translator/milestone/1 |
