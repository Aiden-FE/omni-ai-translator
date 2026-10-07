# CONTEXT — Omni AI Translator 接管活文档

> **状态**：接管期 v0.4.0 工作底稿。
> **范围**：术语表 / 业务边界 / 关键架构决策 / 当前问题与解法进度。
> **维护原则**：随项目推进持续更新；转入正式迭代后由 `/domain-modeling` 技能接管并迁移为仓库内 `docs/adr/` ADR 集合。
> **不入 git**：本文档为本次会话的工作笔记；如需进入仓库需另开 PR。

---

## 1. 术语表（ubiquitous language）

### 1.1 翻译源
| 术语 | 定义 | 出处 |
|---|---|---|
| `ProviderConfig` | 翻译源配置：id/name/type/baseUrl/apiKey?/model/region?/responseStyle?/category? | `shared/types.ts` |
| `ProviderType` | `'llm' \| 'google' \| 'microsoft'` | `shared/types.ts` |
| `ProviderCategory` | `'llm' \| 'traditional'`，`ProviderConfig.category` 缺省时按 `type` 推断 | `shared/types.ts`, `shared/translator/registry.ts` |
| `LlmProtocol` (= `responseStyle`) | `'openai-completions' \| 'openai-responses' \| 'anthropic' \| 'ollama'` | `shared/types.ts` |
| 旧 `type` 子分组 | `'openai-compatible' \| 'ollama'`，已收敛到新 `type='llm' + responseStyle`；`shared/storage.ts:migrateProvider` 读出时即时迁移 | `shared/storage.ts` |
| 免 Key 内置源 | `google` / `microsoft` keyless 公共端点；fresh install 默认 `microsoft` | `shared/translator/builtin-sources.ts`, 隐私页 §3 |
| `activeSourceId` / `activeProviderId` | 当前生效源 | `shared/translator/index.ts`, `shared/types.ts` |
| `TranslationCapabilities` | `{ batchStream: boolean }` 决定全文走 `runBatchPool` 还是 `runPool` | `shared/types.ts`, `shared/translator/index.ts` |

### 1.2 翻译能力
| 术语 | 定义 |
|---|---|
| 文本翻译 | 用户主动提供独立文本并获取译文的翻译能力；与当前网页内容和页面翻译状态无关。 |
| 文本翻译会话 | 从 popup 打开到关闭的一次临时交互上下文；在文本翻译与设置界面之间导航不会结束该会话。 |
| 默认目标语言 | 用户在设置中持久化的目标语言偏好，供各类翻译能力初始化使用；未配置时跟随浏览器首选语言。 |
| 临时目标语言 | 单次文本翻译期间对默认目标语言的临时覆盖；不改变默认目标语言，也不影响其他翻译能力。 |
| 目标语言目录 | 文本翻译与设置共享的标准目标语言集合；目录不随当前翻译源变化。 |
| 划词翻译 | content script 监听 `mouseup`，划词后出现浮按钮（`llm-translator-trigger`），点击触发；浮层在 about:blank iframe 内（`entrypoints/content.ts:showPanel`） |
| 全文翻译 | 右键菜单 `fullpage-replace` / `fullpage-bilingual` → background `tabs.sendMessage` → fullpage.content → orchestrator |
| `DisplayMode` | `'replace' \| 'bilingual'` 全文译文显示模式 |
| 流式翻译 | 经 `browser.runtime.connect({ name: 'translate-stream' })` 长连接；契约 `StreamPortMessage` = request / chunk / done / error |
| 批量流式翻译 | 经 `browser.runtime.connect({ name: 'fullpage-translate-batch-stream' })`；契约 `BatchStreamPortMessage` = request / chunk / done / error |

### 1.3 错误
| `ErrorType` | 含义 | 触发场景 |
|---|---|---|
| `no-config` | 未配置生效源 | `activeProviderId === null` |
| `network` | fetch/SW 异常/流式中断 | 所有 `fetch` reject + port onDisconnect 未 done 路径 |
| `rate-limit` | 429 / 配额超限 | provider 显式 |
| `unreachable` | baseUrl 不可达 | DNS / 5xx |

UI 在 `entrypoints/content.ts:renderError` 差异化显示；契约源 `shared/translator/error.ts`。

### 1.4 全文翻译领域
| 术语 | 定义 |
|---|---|
| `SegmentRecord` | 单段翻译记录：`{ el, text, status, translatedText?, semantic? }` |
| `SemanticTranslation` | LLM 批量流返回的结构化译文（block/heading/inline 三类） |
| `orchestrator` | 全文翻译唯一状态持有者；模块级 state；`sessionGeneration` 守卫会话失效 |
| `segmenter` | 无状态：`collectSegments`（传统分段）/ `collectSemanticSegments`（LLM 语义块） |
| `translate-pool` | 无状态：传统并发池（concurrency 3），`runPool` / `retrySegments` |
| `batch-pool` | 无状态：LLM 批量流并发池；`createBatchRequestGate` 三槽 gate 跨池复用 |
| `renderer` | 无状态：`applyReplace` / `applyBilingual` / `markLoading` / `markFailed` / `switchMode` / `restoreAll` |
| `toolbar` | 无状态 UI：`ToolbarApi` 提供 mode/restore/retry/collapse/recall 回调 |
| `recordedEls` | 已收段元素集合；增量翻译去重 |
| `viewportObserver` | 视口外段 IO，进入后入池（多会话复用，doStart disconnect 旧句柄） |
| `batchRequestGate` | 三槽 gate，避免 viewport / dynamic / retry pool 叠加并发 |

### 1.5 消息与契约
| 名称 | 方向 | 类型 | 用途 |
|---|---|---|---|
| `Message` | content → background | 短消息 | translate / test-provider / get-settings / get-providers / get-active-sources / get-translation-capabilities / set-active-source |
| `BackgroundCommand` | background → content | 短消息 | `fullpage-translate` + mode |
| `StreamPortMessage` | content ↔ background | port 'translate-stream' | 划词流式 |
| `BatchStreamPortMessage` | content ↔ background | port 'fullpage-translate-batch-stream' | 全文批量流 |

### 1.6 翻译加速（Translation Acceleration）
| 术语 | 定义 | 出处 |
|---|---|---|
| 加速节点 | 一个部署在官方或用户自有基础设施上的翻译加速服务实例；由用户按文档自行部署，对插件而言只是一个可配置的 URL | `services/relay/`（设计） |
| 加速端点 | 设置中配置的加速节点 URL；为空表示不使用加速 | `Settings.accelEndpoint`（设计） |
| 缓存条目 | 一条「规范化原文 + 源语言 + 目标语言」三元组对应的译文；加速节点中以该三元组的哈希为标识存储 | `services/relay/`（设计） |
| 查缓存 | 翻译请求发出前向加速节点发起的批量查询，用于判定每条原文是否已有译文 | `POST /v1/cache:lookup` |
| 存缓存 | 翻译成功后异步向加速节点发起的批量写入，用于建立或更新缓存条目 | `POST /v1/cache:commit` |
| 命中 / 未命中 | 加速节点对某条原文返回了译文即为命中；未返回即未命中，插件照常走当前生效源翻译 | `POST /v1/cache:lookup` |
| 开放缓存 | 加速节点的匿名读、匿名 upsert 写模型：任何客户端都能覆盖任意缓存条目，信任由用户对自选节点的所有权承担 | ADR-0002 |

---

## 2. 业务边界

### 2.1 进程拓扑
```
┌──────────────────────────────────────────────────────────────────┐
│  background.ts  (MV3 Service Worker)                             │
│  - contextMenus 创建 + 监听 (fullpage / fullpage-replace / ...)  │
│  - runtime.onMessage 路由 Message                                 │
│  - runtime.onConnect 路由 StreamPort + BatchStreamPort           │
│  - 调 shared/translator/* 适配层                                   │
└──────────────────────────────────────────────────────────────────┘
        ▲                       ▲                       ▲
        │ Message                │ port                  │ tabs.sendMessage
        │ (popup/options)        │ (划词 content)          │ (右键菜单触发)
┌───────┴────────┐   ┌──────────┴──────────┐  ┌────────┴────────────┐
│ popup/App.vue   │   │ content.ts          │  │ fullpage.content.ts │
│ options/App.vue │   │ - 划词浮按钮         │  │ - 收命令 →           │
│                 │   │ - 流式浮层 (iframe)  │  │   orchestrator.start│
└─────────────────┘   └─────────────────────┘  └─────────────────────┘
                          (注入到 <all_urls>)
```

### 2.2 翻译流
| 入口 | 数据通道 | 终止 |
|---|---|---|
| 划词 content → port → background | `StreamPortMessage` | done / error / port disconnect |
| 右键菜单 → background → tabs.sendMessage → fullpage.content | `BackgroundCommand` | orchestrator 自行管理会话 |
| popup / options → background | `Message` | 同步返回 |

### 2.3 适配层路由
```
ProviderConfig
   │
   ▼  registry.createProvider(config)
   │  (category ?? inferCategory(type))
   ├── 'llm'              → createLLMProvider
   │                         └── responseStyle 决定 3 路:
   │                              openai-completions / openai-responses / anthropic
   └── traditional        → createTraditionalProvider
                              (google / microsoft)
```

### 2.4 存储契约
- `browser.storage.local` 两 key：
  - `llm_translator:providers: ProviderConfig[]`
  - `llm_translator:settings: Settings` (activeProviderId / defaultTargetLang / customPrompt?)
- Key 严禁外泄；只本地；隐私页 §4 声明
- 旧 `type='openai-compatible'/'ollama'` 读出时由 `migrateProvider` 即时收敛

### 2.5 浏览器覆盖
| 浏览器 | manifest_version | 关键差异 |
|---|---|---|
| Chrome | MV3 | 默认 target |
| Edge | MV3 | 同 Chrome |
| Firefox | MV2 | `browser_specific_settings.gecko.id`；WXT 自动 `host_permissions → permissions`、`action → browser_action` |

---

## 3. 关键架构决策

### 3.1 浮层用 about:blank iframe 隔离（`entrypoints/content.ts:showPanel`）
- 原因：宿主页面 CSS 会覆盖浮层 `p/code/h1` 等语义标签的颜色（PR #45 `color:inherit`、PR #46 Shadow DOM 都不彻底）
- 做法：浮层容器在宿主 DOM，文档写在 about:blank iframe（`contentDocument` 可写）；CSS 通过 `?inline` 字符串注入 iframe
- 触发按钮结构简单留宿主 DOM

### 3.2 划词与全文用两个 content script（`entrypoints/content.ts` + `entrypoints/fullpage.content.ts`）
- 原因：各自独立注入、互不干扰、无共享运行时状态
- 全文 content 只做 `runtime.onMessage` 收命令 → 调 orchestrator.start；不持有任何状态

### 3.3 全文翻译"编排器是唯一状态持有者"（`shared/fullpage/orchestrator.ts`）
- segmenter / pool / renderer / toolbar 都是无状态组件
- 模块级 state：`records / mode / active / cache / semanticCache / batchStreamEnabled / targetLang / sessionGeneration / startInFlight`
- `sessionGeneration` 单调递增：拒绝 restore / restart 前启动的晚到回调

### 3.4 port 双契约
- `translate-stream`：划词流式（单段）
- `fullpage-translate-batch-stream`：全文批量流式（多段）
- background 内分别路由；port.disconnect 与 SW 回收路径有显式守卫（`disconnected` 标志 + `try/catch`）

### 3.5 batchPool 三槽 gate（`shared/fullpage/batch-pool.ts:createBatchRequestGate`）
- viewport / dynamic / retry 三个并发入口共享同一 gate，避免叠加打爆 LLM
- 入池走 `runBatchPool` / `retryBatchSegments`，并发上限 3

### 3.6 视口 + 增量双观察器
- 视口观察（`createViewportObserver`）：out-of-view 段挂在 IO，进入视口后入池
- 增量观察（`MutationObserver` + 200ms 防抖）：宿主页面 DOM 变更时收集新增节点，按 `data-llm-translator` 标记过滤自身产物
- 25ms micro-batch 聚合窗口：视口进入 + 动态分段共用同一派发队列

### 3.7 capability 路由
- `getTranslationCapabilities` 在 `doStart` 入口查一次
- 决定 `collectSegments` vs `collectSemanticSegments`、`runPool` vs `runBatchPool`
- retry 路径复用同一 capability 决定走 `retrySegments` 还是 `retryBatchSegments`

### 3.8 适配层 type 收敛
- `ProviderType` 从旧 4 值 (`openai-compatible/ollama/google/microsoft`) 收敛为 3 值 (`llm/google/microsoft`)
- 差异移至 `responseStyle`
- `migrateProvider` 读出时即时迁移，不回写；用户无感知

### 3.9 测试分层
- `shared/**` 单测：vitest（474 通过 / 20 文件）
- 端到端：playwright + 自定义 mock-server（`e2e/mock-server.ts`），需 `wxt build` 先
- E2E 覆盖：fullpage + translate 两套；当前仅 chromium（Q7=R2 决定补 Firefox/Edge 通道）

### 3.10 WXT 0.19 + 手写 tsconfig
- 根 `tsconfig.json` 最初不 `extends "./.wxt/tsconfig.json"`，导致 `vue-tsc` 报全局未定义
- 修复 = `extends` + `shims-vue.d.ts`（最小化、Q5=A 决定）

### 3.11 加速层是「只缓存不代理」
加速节点只回答「这段原文是否已有译文」，从不代持翻译接口凭据、从不代理翻译请求。
插件的三条翻译路径（划词流式、popup 文本、全文批量流）统一先查缓存：命中条目直接出结果，
未命中条目重组后照常发给当前生效源，翻译完成再异步存缓存。详见 ADR-0002。

### 3.12 加速失败一律 fail-open
查缓存超时 3 秒（可配）后或任何异常（网络错误、非 2xx、响应畸形）都按「全未命中」处理，
用户不可见；存缓存为 fire-and-forget，失败即丢弃。加速节点是性能层，任何情况下不得阻断翻译。

### 3.13 缓存命中不模拟流式
命中条目以一次性完整译文呈现，不走 LLM 流式管线；全文翻译中命中段落即时渲染，
未命中段落才入池。缓存的作用是消除等待，不是复刻流式体验。


### 3.14 加速范围默认只覆盖免 Key 内置源
`Settings.accelScope` 取 `'builtin'`（默认）或 `'all'`。默认只对内置免 Key 源（google / microsoft）走加速：
用户自有源的原文不外发给加速节点，需要时由用户显式打开。加速价值最大的场景正是「免费源慢 + 限流 + 零成本顾虑」。

### 3.15 第三方加速 URL 首次配置需显式确认
官方节点不弹确认；配置第三方 URL 时弹一次对话框，说明「该节点可看到全部原文，且可返回任意译文」。
确认状态存 `browser.storage.local`，URL 变更时重置。理由：第三方节点返回的内容无法被验证，这是唯一有实际约束力的知情点。

### 3.16 加速端点配置形态
`Settings.accelEndpoint: string | null`，空串表示不使用加速。设置页用单选呈现「不使用 / 官方域名 / 自定义域名」，
选官方等价于填入官方 URL，不引入 `preset` 字段；提供「测试连通」按钮打 `GET /healthz`。
**默认不使用**——发往项目方服务器必须是显式选择。

### 3.17 Settings 读出不做深合并
`shared/storage.ts` 的 `get<T>(key, fallback)` 命中已存对象时直接返回该对象，不与 `DEFAULT_SETTINGS` 合并。
存量用户已存的对象不含新增字段，读出来是 `undefined` 而非 `null`／默认值。新增 Settings 字段必须声明为可选，
并在读取侧归一化；`getSettings` 需要加一步 normalize 才能保证类型上非可选字段总是有值。

### 3.18 隐私政策与 README 必须同步更新
现有隐私政策明文写着「API Key 仅保存在浏览器本地，不会发送到本项目的服务器」。启用官方加速后需新增独立章节
「翻译加速」：加速可选且默认关闭；启用后原文发往所选节点；API Key 仍只存本地、永不发往加速节点；
第三方节点由第三方运营、数据政策以其自身为准。README「配置自己的翻译源」之后加「使用翻译加速」小节并挂官方部署文档链接。


### 3.19 契约容错：坏条跳过、好条照处理
服务端对批量请求中的非法单条（缺字段/类型不符/超长）跳过，不整批 400；命中条缺 `translatedText`
按未命中处理。错误响应统一 `{ error: string }`。插件侧 `id` 只用于回填，缓存身份完全由服务端计算。

### 3.20 relay 模块与测试形态
NestJS 单模块单控制器：`cache.controller` + `cache.service` + `rate-limit` + `config`，fastify 引导读
`TRUST_PROXY`。`GET /healthz` 返回 `{ status, version, redis: 'ok'|'down' }`。测试三层：单测 mock
ioredis、契约测试用 CI redis service 跑真 mget/pipeline、插件 e2e 覆盖划词命中与全文部分命中。
服务端不打原文/译文日志，只可打缓存键哈希。

### 3.21 Redis 客户端用 ioredis 直连
不进 cache-manager：lookup 的 `mget` 与 commit 的 `pipeline SET EX` 直接调用，抽象层只增阅读成本。

### 3.22 版本与发布节奏
扩展发 `0.5.0`（minor，可选新能力）；`@omni/relay` 独立版本线 `0.1.0`，compose 文档引用具体 tag。
**代码先合 master、release 等官方节点可用后再打**：官方选项在 fail-open 下虽不阻断翻译，但商店用户
会把「测试连通失败」当 bug 上报。文档注明「v0.5.0 起支持，官方端点上线另行通知」。

### 3.23 Settings 新字段沿用可选惯例
`accelEndpoint?: string | null`、`accelScope?: 'builtin' | 'all'`，读取侧判空归一化，不把深合并
藏进 storage 层（与 §3.17 一致，跟随既有 `customPrompt?` 模式）。


---

## 4. 当前问题与解法进度

### 4.1 已完成
- [x] 接管读懂：4 节术语 + 决策树
- [x] 复现 `pnpm typecheck` 根因：根 tsconfig 不 `extends .wxt/tsconfig.json`
- [x] 性能基线 ①（测量脚本已写，待执行；本轮末 R3 决定 chunking 策略）

### 4.2 修复 PR（Q5=A、Q6=B）
- 分支：`fix/typecheck-wxt-extends` ← `ai-devflow-sprint/v0.4.0`
- 改动：
  - `tsconfig.json` 加 `"extends": "./.wxt/tsconfig.json"`
  - 新建 `shims-vue.d.ts`
- 验收：vue-tsc 错误 27→0；vitest 474/474 仍全绿；e2e 不在此次 PR 跑（仅冒烟，CR 时看）

### 4.3 待办（按优先级）
| 序 | 主题 | 来源 | 预计工作量 |
|---|---|---|---|
| P0 | 提交 typecheck 修复 PR | Q5/Q6 | 0.5 天 |
| P1 | ① 全页大文档性能（1000+ 段） | Q7 | 1 周 |
| P2 | ② Firefox/Edge e2e 覆盖 | R1 候选 | 2-3 天 |
| P3 | ③ 文本翻译 | 独立于页面翻译状态；不含输入、译文或历史持久化 | 3-4 天 |
| P4 | CONTEXT.md 移入 `docs/adr/` | Q4 转正式 | 后续 sprint |
| P5 | v0.4.0 release tag + AMO 提交 | 收尾 | 0.5 天 |
| — | ④ 翻译加速节点（插件加速层 + `services/relay` + `docs/relay` 公开文档） | grilling 20 问全采纳，ADR-0002/0003/0004 | 2-3 周 |
| — | ④-b 官方节点部署（域名证书 / Cloudflare / Redis / compose 落地） | 明确出本轮范围（Q14=A） | 0.5 天 |

### 4.4 已知技术债
- `c5fbf86 docs: remove docs` 删除了 `docs/iterations/v0.4.0/CHANGELOG.md` 与 4 个 archive branch 的 PLAN/DESIGN。**当前 v0.4.0 范围仅能从代码与 commit 推断**。修复 PR 合并后另开一个 `docs: rebuild v0.4.0 changelog` PR。
- `docs/privacy/index.html` 引用了不存在的 `knowledges/product-wiki/privacy/PRIVACY-POLICY.md` 路径；考虑在提交隐私页时把源路径同步改正文。
- PRD/issue 标签与 `docs/agents/triage-labels.md` 写的 5 默认标签不一致；后续若要用 5 标签体系，需先在仓库做迁移。
- `noUnusedLocals` / `noUnusedParameters` 严格模式开启，目前 typecheck 不通时是掩盖态——修复后可能暴露若干未用变量/参数；不在本次 PR 处理。

---

## 5. 变更日志（本接管活文档）

| 日期 | 变更 |
|---|---|
| 2026-08-07 | 接管读懂；建立 v0.4.0 快照；记录 25 个 sprint commit 的术语与决策 |
| 2026-10-07 | 翻译加速节点能力：grilling 第一轮 8 项决策全采纳；落 §1.6 术语 + §3.11-3.13 决策 + ADR-0002/0003/0004 |
| 2026-10-07 | grilling 第二轮：Q9-Q12/Q15 采纳；Q13 采纳并追加真实 IP 限流要求；Q14=A（官方节点部署出本轮范围）。落 §3.14-3.18 |
| 2026-10-07 | grilling 第三轮：Q16-Q20 全采纳，前沿清空。落 §3.19-3.23 + 更新 ADR-0002；设计树走完，待用户确认共享理解 |
