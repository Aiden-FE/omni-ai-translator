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
| P3 | ③ popup 翻译状态 / 历史 | R1 候选，R9 拍板延后 | 3-4 天 |
| P4 | CONTEXT.md 移入 `docs/adr/` | Q4 转正式 | 后续 sprint |
| P5 | v0.4.0 release tag + AMO 提交 | 收尾 | 0.5 天 |

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
