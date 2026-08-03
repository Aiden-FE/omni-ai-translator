# PLAN: 全文翻译编排器、content script 入口与增量翻译

> 版本: v0.4.0 | 任务: 17614208-4e99-455b-8dfb-5abbd6f7aede

## 执行计划（有序，每步保持绿色边界）

- [x] 1. **RED 测试先行**：新增 `shared/fullpage/orchestrator.test.ts`
  - 文件：`shared/fullpage/orchestrator.test.ts`
  - 覆盖：
    - `isBackgroundCommand` 类型守卫（合法/非法 msg）
    - `start('replace')` 基本流程：收集段、挂工具栏、翻译、渲染替换模式
    - `start('bilingual')` 双语模式渲染
    - 复用路径：active + records 非空 -> 仅 switchMode（无新 API 调用）
    - `onRestore`：恢复原文、断开观察器、销毁工具栏、active=false、cache 保留
    - 恢复后再次触发：cache 命中段秒级渲染（无 API 调用）
    - `onRetry`：清除失败标记、重跑池、更新 failureCount
    - `onSettled` isActive 校验：恢复后不渲染已返回段
    - `onSettled` isConnected 校验：元素移除后丢弃
    - `onSwitchMode`：翻转 mode + renderer.switchMode
    - 增量翻译：MutationObserver 检测新增节点 -> 收集 -> 翻译 -> 渲染（fake timers）
    - 增量翻译：过滤 data-llm-translator 节点（不回环）
    - 增量翻译：recordedEls 去重
  - 验证：`npx vitest run shared/fullpage/orchestrator.test.ts` 失败（orchestrator.ts 不存在） ✅ 已确认红（Failed to resolve import "./orchestrator"）

- [x] 2. **GREEN 实现编排器**：新增 `shared/fullpage/orchestrator.ts`
  - 消费：`collectSegments` / `runPool` / `retrySegments` / `applyReplace` / `applyBilingual` / `markFailed` / `clearFailedMark` / `switchMode` / `restoreAll` / `createToolbar` / `getTargetLang`
  - 产出：`start(mode)` / `isBackgroundCommand(msg)` / `__reset()` / `__getState()`
  - 验证：`npx vitest run shared/fullpage/orchestrator.test.ts` 全绿 ✅ 20/20 通过

- [x] 3. **content script 入口**：新增 `entrypoints/fullpage.content.ts`
  - 消费：`start` / `isBackgroundCommand`
  - WXT `defineContentScript` + `browser.runtime.onMessage`
  - 命名修正 `fullpage.ts` → `fullpage.content.ts`（WXT 按文件名识别入口类型，无 `.content` 后缀会被当作 unlisted script 不注册进 manifest）
  - 验证：`npx vue-tsc --noEmit` 通过 ✅、`npx eslint` 净 ✅

- [x] 4. **全量回归**：
  - `npx vitest run` 全绿（含新增测试） ✅ 15 文件 309 用例全过
  - `npx vue-tsc --noEmit` 通过 ✅
  - `npx eslint . --ext .ts,.vue` 净 ✅
  - `npx wxt build` 双端构建成功（chrome-mv3 + firefox-mv2，manifest.content_scripts 注册 content.js + fullpage.js） ✅

- [x] 5. **任务文档**：CHANGELOG.md、index.md 更新

## 依赖与接口

- 消费（已有）：t2 `collectSegments` / `runPool` / `retrySegments`、t3 renderer 全套、t4 `createToolbar`、`getTargetLang`、`BackgroundCommand` / `DisplayMode`
- 产出：`start(mode)` 供 entrypoint 调用；`isBackgroundCommand` 类型守卫供 entrypoint 校验消息
- 不改：`entrypoints/content.ts`、`entrypoints/background.ts`、翻译适配层

## 测试策略

- jsdom 环境（`@vitest-environment jsdom`）
- `vi.stubGlobal('browser', ...)`：同时 mock `runtime.sendMessage`（翻译池）+ `storage.local.get`（getTargetLang）
- `vi.stubGlobal('navigator', { language })`：控制 getTargetLang 回退
- `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(200)`：测试 MutationObserver 防抖
- `__reset()` 每个测试前重置模块级状态
- DOM 断言验证渲染结果（替换模式 textNodes、双语模式 blockHost、失败标记）
