# E2E 与构建排错

> 扩展构建、e2e 测试常见问题与解决方案。

## e2e 跑不起来

### 1. 扩展未加载 / service worker 找不到

- 确认已 `pnpm build`，`.output/chrome-mv3/` 存在。
- e2e fixture 通过 `--load-extension` 加载该目录；若路径不对会静默失败。
- Chrome 扩展不支持旧版 headless，必须用 `--headless=new`（已在 `e2e/fixtures.ts` 配置）。

### 2. 划词后触发按钮点击无反应

历史坑：document 的 `mouseup` 监听器会在 Playwright 合成 click 时触发，因选区仍在而**重建 trigger**，导致原 trigger 的 click 事件丢失。

解决（已实现）：mouseup handler 开头判断事件目标是否在已有 trigger/panel 内，是则返回；并在 trigger 上对 mousedown/mouseup `stopPropagation`。

### 3. 配置写入后 background 读不到 provider

历史坑：Vue 3 reactive proxy 数组经 `chrome.storage.local` 结构化克隆后**变异为对象**（`[...]` → `{"0":...}`），导致 `getProviders` 返回非数组、`.find` 失败、报"未配置或未启用"。

解决（已实现）：
- `setProviders` 写入前 `Array.from()` 转纯数组。
- `getProviders` 读取后 `Array.isArray` 防御，非数组返回 `[]`。

## CI 失败

### pnpm 报 node:sqlite 缺失

pnpm 11 要求 Node ≥ 22.13。CI 的 `actions/setup-node` 必须用 `node-version: 22`，不能用 20。

## 本地清理

e2e 残留状态导致用例不稳时，清理持久化 profile：

```bash
rm -rf .e2e-profile test-results playwright-report
```
