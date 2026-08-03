# CHANGELOG: 全文翻译编排器、content script 入口与增量翻译

> 版本 v0.4.0 · 任务 17614208-4e99-455b-8dfb-5abbd6f7aede（t5）

## 新增

- `shared/fullpage/orchestrator.ts` — 全文翻译编排器（唯一状态持有者）
  - 模块级状态：`records` / `mode` / `active` / `cache`（会话级，恢复后保留）/ `toolbar` / `observer` / `recordedEls` / `targetLang` / 增量防抖状态（`pendingAddedNodes` / `debounceTimer` / `isFlushing`）。
  - `start(mode)`：复用路径（active + records 非空 → 仅 switchMode，零 API）；全新路径（getTargetLang → collectSegments → createToolbar → runPool 并发 3 逐段即时渲染 → startObserver）。
  - 并发触发守卫 `startInFlight`：右键菜单连点时第二次等待首次完成后按最新状态决策，防重复收集/建栏/派发。
  - 工具栏回调接线：`onSwitchMode`（renderer.switchMode 零 API）、`onRestore`（restoreAll + 断观察器 + 销毁工具栏 + active=false，保留 cache）、`onRetry`（clearFailedMark + retrySegments 复用缓存 + 更新 failureCount）、`onCollapse`/`onRecall`（no-op，预留扩展位）。
  - 增量翻译：MutationObserver `{childList, subtree}` + 200ms 防抖聚合 addedNodes → 过滤 `data-llm-translator` 注入子树与已断开节点 → collectSegments → recordedEls 去重 → 新段走缓存/翻译/渲染；`isFlushing` 防并发，flush 期间新节点重新调度。
  - 防闪回双保险：池 `isActive: () => active`（恢复后不再派发新段）+ `handleSettled` 的 `active` 与 `el.isConnected` 校验（恢复后/元素移除后不渲染已返回段）。
  - `isBackgroundCommand(msg)` 类型守卫（`unknown` + 守卫，TS 严格模式无 `any`）。
  - 测试钩子 `__getState()` / `__reset()`。
- `shared/fullpage/orchestrator.test.ts` — 20 个单元测试（jsdom + fake timers）：
  - 类型守卫、replace/bilingual 基本流程、空页面、重复触发不重复建栏、并发 start 守卫；
  - 复用路径（验收标准 10：零 API、工具栏不重建）、恢复后再触发 cache 命中秒级渲染；
  - onSwitchMode / onRestore / onRetry 回调；onSettled 的 active（防闪回）与 isConnected（元素移除丢弃）守卫；
  - 增量翻译（验收标准 9）：新增节点翻译渲染（双模式）、过滤注入子树、自身渲染不回环、recordedEls 去重、恢复后观察器断开。
- `entrypoints/fullpage.content.ts` — 独立 content script 入口
  - `defineContentScript({ matches: ['<all_urls>'] })` + `runtime.onMessage`：经 `isBackgroundCommand` 守卫后 `void start(msg.mode)`（catch 仅 console.warn，不阻断宿主页面）。
  - 与 `entrypoints/content.ts`（划词翻译）各自独立注入、互不干扰、无共享运行时状态；划词翻译零回归（未改动 content.ts / background.ts / 翻译适配层）。

## 设计偏差说明

- **入口命名 `fullpage.ts` → `fullpage.content.ts`**：WXT 按文件名模式识别入口类型（`content.ts` / `*.content.ts` → content-script；其余 → unlisted script）。初版 `fullpage.ts` 被构建为 unlisted script（产物落在 `.output/fullpage.js` 且不进 manifest.content_scripts）；改名后产物为 `content-scripts/fullpage.js`，与 `content-scripts/content.js` 并列注册（chrome-mv3 / firefox-mv2 双端 manifest 已验证）。DESIGN.md 已同步标注。
- **新增并发 start 守卫**：DESIGN 未覆盖「首次 start 在途时再次触发」的竞态（会重复收集/建栏），实现补充 `startInFlight` 守卫并有测试锁定。

## 验证（实际运行）

- `npx vitest run` — 15 文件 309 用例全绿（含新增 orchestrator 20 用例）。
- `npx vue-tsc --noEmit` — 通过。
- `npx eslint . --ext .ts,.vue` — 净。
- `npx wxt build`（chrome-mv3）— 成功；manifest.content_scripts 注册 `content.js` + `fullpage.js`。
- `npx wxt build -b firefox`（firefox-mv2）— 成功；manifest 同样双 content script 注册。

## 知识沉淀

本次任务产出已沉淀为长期知识：

| 知识 ID | 类型 | 候选映射 | 复用场景 |
|---|---|---|---|
| `feature:fullpage:orchestrator` | feature | candidate #0 | 后续扩展全文翻译功能（翻译进度指示器、批量重试策略优化、多页面翻译状态管理）或实现其他 content script 状态机时复用编排器状态机模式（唯一状态持有者组合无状态组件、startInFlight 并发重入守卫、增量翻译防抖管线、isActive/onSettled 防闪回双保险） |

- 沉淀文件：`docs/knowledge/feature/fullpage-orchestrator.md`
- 索引同步：`docs/knowledge/feature/index.md`（feature 分类索引）、`docs/knowledge/index.md`（根索引）已新增条目。
- 关联知识：`feature:fullpage:segmenter-pool`（编排器组合的 t2/t3 组件）、`feature:fullpage:command-channel`（命令来源）、`feature:translator:unified-adapter`（翻译通道）、`context:system:plugin-architecture`。

## 遗留与后续

- 大页面（上千段）首帧收集为同步遍历，orchestrator 内已注释标注后续 `requestIdleCallback` 分片优化点。
- 观察器启动时机为 `await runPool` 之后（v0.4 顺序）：翻译期间的新增内容靠启动后 mutation 补偿，存在理论窗口期，后续可提前启动观察器。
- e2e（Playwright）未在本任务覆盖全文翻译链路，建议后续补右键菜单 → 全文翻译的端到端用例。
