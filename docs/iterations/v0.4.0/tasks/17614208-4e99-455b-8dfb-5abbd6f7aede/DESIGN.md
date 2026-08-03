# DESIGN: 全文翻译编排器、content script 入口与增量翻译

> 版本 v0.4 · 全文翻译 · 编排器（t5）

## 总体架构

编排器（`shared/fullpage/orchestrator.ts`）是全文翻译的**唯一状态持有者**，以模块级状态组合 t2（segmenter + pool）、t3（renderer）、t4（toolbar）四个无状态组件，形成完整的状态机：

```
background 右键菜单
  -> tabs.sendMessage(BackgroundCommand)
  -> entrypoints/fullpage.ts (content script, runtime.onMessage)
  -> orchestrator.start(mode)
     -> collectSegments(document.body)        [t2 segmenter]
     -> createToolbar(callbacks)              [t4 toolbar]
     -> runPool(records, { onSettled, isActive })  [t2 pool]
        onSettled: done -> renderer.apply(mode) / failed -> markFailed + setFailureCount  [t3 renderer]
     -> MutationObserver.observe(document.body)  [增量翻译]
```

`entrypoints/fullpage.ts` 是独立 content script 入口（WXT 多 content script），与 `entrypoints/content.ts`（划词翻译）各自独立注入、互不干扰、无共享运行时状态。

## 受影响文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `shared/fullpage/orchestrator.ts` | 新增 | 编排器状态机（start + 工具栏回调 + 增量翻译 + 类型守卫） |
| `shared/fullpage/orchestrator.test.ts` | 新增 | 单元测试（jsdom + fake timers） |
| `entrypoints/fullpage.content.ts` | 新增 | 独立 content script 入口（WXT 约定：额外 content script 须以 `.content.ts` 命名，否则被识别为 unlisted script 不进 manifest） |

不修改 `entrypoints/content.ts`、`entrypoints/background.ts`、翻译适配层。

## 模块级状态

| 变量 | 类型 | 说明 |
|---|---|---|
| `records` | `SegmentRecord[]` | 当前页所有分段记录 |
| `mode` | `DisplayMode` | 当前显示模式 |
| `active` | `boolean` | 翻译是否进行中（恢复原文后置 false） |
| `cache` | `Map<string,string>` | 会话级缓存，恢复原文后**不清除**（验收标准 10） |
| `toolbar` | `ToolbarApi \| null` | 工具栏实例 |
| `observer` | `MutationObserver \| null` | 增量翻译观察器 |
| `recordedEls` | `Set<HTMLElement>` | 已收段元素集合（防重复收段） |
| `targetLang` | `string` | start 时解析一次，传入池 |

增量翻译防抖状态：`pendingAddedNodes: Set<HTMLElement>`、`debounceTimer`、`isFlushing`。

## 数据契约

### 导出接口

```typescript
/** 启动全文翻译 */
export async function start(mode: DisplayMode): Promise<void>;

/** BackgroundCommand 类型守卫（供 entrypoint 消费） */
export function isBackgroundCommand(msg: unknown): msg is BackgroundCommand;
```

### start(mode) 流程

1. **复用路径**：若 `active && records.length > 0` -> 仅 `switchToMode(mode)`（零 API，复用缓存，验收标准 10），直接返回。
2. **全新路径**：
   - `active = true`；`mode = requestedMode`
   - `targetLang = await getTargetLang()`（start 时取一次）
   - `records = collectSegments(document.body)`（v0.4 同步收集，注释标注后续 requestIdleCallback 优化点）
   - `recordedEls = new Set(records.map(r => r.el))`
   - `toolbar = createToolbar({ onSwitchMode, onRestore, onRetry, onCollapse, onRecall })`；`toolbar.setMode(mode)`
   - `await runPool(records, { targetLang, concurrency: 3, cache, onSettled, isActive: () => active })`
   - 若 `active`（未被恢复）-> `startObserver()`

### onSettled 回调

池每段 settle 时调用（含 `translating` / `done` / `failed` 三态）：

```
if (!active) return;              // 恢复后不渲染
if (!seg.el.isConnected) return;  // 元素已移除 -> 丢弃
done   -> mode==='replace' ? applyReplace(seg) : applyBilingual(seg)
failed -> markFailed(seg) + updateFailureCount()
translating -> no-op
```

### 工具栏回调接线

| 回调 | 动作 |
|---|---|
| `onSwitchMode` | `switchToMode(mode === 'replace' ? 'bilingual' : 'replace')`：renderer.switchMode（零 API）+ 翻转 mode + toolbar.setMode |
| `onRestore` | renderer.restoreAll + observer.disconnect + toolbar.destroy + `active=false`（**保留 cache**） |
| `onRetry` | 收集 failed 段 -> clearFailedMark -> retrySegments（复用池，不清缓存）-> updateFailureCount |
| `onCollapse` | toolbar 已自动 collapse，no-op（预留暂停观察器扩展位） |
| `onRecall` | toolbar 已自动 expand，no-op |

### 增量翻译（MutationObserver）

- 观察 `document.body`，`{ childList: true, subtree: true }`。
- 200ms 防抖：聚合 `addedNodes` 到 `pendingAddedNodes`，每次 mutation 重置 timer。
- flush 时逐节点处理：过滤 `data-llm-translator` + `!isConnected` -> `collectSegments(node)` -> `recordedEls` 去重 -> 新段入 records -> `runPool`（同 onSettled + isActive）。
- `isFlushing` 防并发：flush 期间新到达的节点入新 set，flush 完成后重新调度。
- 观察器只在 `active` 期间连接；自身渲染产生的 DOM 变更靠 `data-llm-translator` 过滤，不形成回环。

### isActive 中止

`runPool` 的 `isActive: () => active`：恢复原文后不再派发新段。已返回段的 `onSettled` 检查 `active` 跳过渲染（防止恢复后残留译文闪回）。

## entrypoints/fullpage.content.ts

> 命名修正：初版设计为 `entrypoints/fullpage.ts`，实现时发现 WXT 按文件名模式识别入口类型
> （`content.ts` / `*.content.ts` → content-script，其余 → unlisted script），`fullpage.ts`
> 会被构建为 unlisted script 而不注册进 manifest.content_scripts。故采用 `fullpage.content.ts`，
> 构建产物 `content-scripts/fullpage.js` 与 `content-scripts/content.js` 并列注册（已验证 chrome-mv3 / firefox-mv2 双端 manifest）。

```typescript
export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    browser.runtime.onMessage.addListener((msg: unknown) => {
      if (isBackgroundCommand(msg)) {
        void start(msg.mode);
      }
    });
  },
});
```

`isBackgroundCommand` 类型守卫校验 `msg.type === 'fullpage-translate'` 且 `msg.mode` 为 `'replace' | 'bilingual'`（TS 严格模式，`unknown` + 类型守卫，不用 `any`）。listener 不返回值（无需 sendResponse）。

## 关键设计权衡

1. **模块级状态 vs 工厂函数**：任务明确要求模块级状态（编排器是唯一状态持有者）。导出 `__reset()` / `__getState()` 供测试重置与断言。
2. **retrySegments vs runPool 直调**：retry 用 `retrySegments`（专用函数，重置状态 + 复用池逻辑）。其不支持 `isActive`，但 `onSettled` 检查 `active` 跳过渲染，翻译仍完成并更新缓存（有利于再次触发）。
3. **observer 启动时机**：`await runPool` 后启动（v0.4 顺序，翻译期间的新增内容靠下次 flush 补偿）。
4. **复用路径不重建 toolbar**：再次触发（active + records）仅 switchMode，toolbar 不销毁重建。

## 边界与风险

- 翻译返回时页面可能已恢复原文或元素已移除：`active` + `el.isConnected` 双重校验。
- 恢复后再次触发：新 records 从 DOM 重收集，cache Map 命中段秒级渲染（不发 API），新段正常翻译。
- 划词翻译零回归：不修改 content.ts / background.ts；两个 content script 各自独立。
- 大页面（上千段）：v0.4 同步收集，注释标注 `requestIdleCallback` 分片优化点。
