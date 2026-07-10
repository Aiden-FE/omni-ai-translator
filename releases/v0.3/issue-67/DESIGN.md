# DESIGN: #67 跨浏览器兼容 - Firefox/Edge 构建与运行时适配

> Issue #67 · 版本 v0.3 · 创建日期 2026-07-10

## 1. 方案概述

### 1.1 WXT manifest 差异化方案

将 `wxt.config.ts` 的 `manifest` 从静态对象改为函数形式 `(env: ConfigEnv) => UserManifest`。WXT 的 `ConfigEnv` 提供 `browser` 和 `manifestVersion`,据此返回浏览器差异化 manifest。

**WXT 自动处理的能力(无需手动干预)**:
- `manifest_version`: Firefox 默认 MV2,Chrome/Edge 默认 MV3
- `host_permissions` -> `permissions`: MV2 时 WXT 自动归并
- `action` -> `browser_action`: MV2 时 WXT 自动转换
- `background.service_worker` -> `background.scripts`: MV2/Firefox MV3 时 WXT 自动转换
- `web_accessible_resources`: MV3 对象格式自动转 MV2 数组格式

**需手动差异化的字段**:
- Firefox: 添加 `browser_specific_settings.gecko.id`(AMO 上架必需)
- Chrome/Edge: 无额外字段(MV3 标准产物)

**共享字段保持不变(不与 #66 冲突)**:
- `name`、`description`、`version`、`host_permissions`、`permissions`、`icons`(如有)均从静态 manifest 继承,WXT 自动合并

### 1.2 chrome.* -> browser.* 迁移清单

WXT 提供 `browser` 全局(webextension-polyfill 封装),统一三浏览器 API 差异。

| 文件 | 行号 | chrome.* 调用 | browser.* 替换 | API 差异说明 |
|------|------|--------------|----------------|-------------|
| `entrypoints/background.ts` | 17 | `chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { ...; return true; })` | `browser.runtime.onMessage.addListener(async (msg, sender) => { ...; return result; })` | polyfill 用 Promise 返回值替代 `return true` + `sendResponse` 回调 |
| `entrypoints/background.ts` | 58 | `chrome.runtime.onConnect.addListener(...)` | `browser.runtime.onConnect.addListener(...)` | 签名一致,直接替换 |
| `entrypoints/content.ts` | 147 | `chrome.runtime.connect({ name: 'translate-stream' })` | `browser.runtime.connect({ name: 'translate-stream' })` | 签名一致 |
| `entrypoints/popup/App.vue` | 11 | `chrome.runtime.openOptionsPage()` | `browser.runtime.openOptionsPage()` | polyfill 返回 Promise,无需 await |
| `shared/storage.ts` | 16 | `chrome.storage.local.get(key)` | `browser.storage.local.get(key)` | 均返回 Promise,用法一致 |
| `shared/storage.ts` | 21 | `chrome.storage.local.set(...)` | `browser.storage.local.set(...)` | 均返回 Promise,用法一致 |
| `shared/ui/SourceConfigPanel.vue` | 97 | `chrome.runtime.sendMessage(message) as Promise<T>` | `browser.runtime.sendMessage(message)` | polyfill 原生返回 Promise,移除类型断言 |

**关键 API 差异 - onMessage 监听器**:

Chrome `chrome.*` 模式:
```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => { sendResponse(await result); })();
  return true; // 保持通道开启
});
```

WXT `browser.*` (polyfill) 模式:
```ts
browser.runtime.onMessage.addListener(async (message, sender) => {
  return await result; // 直接返回 Promise
});
```

### 1.3 Edge 脚本补全

`package.json` scripts 补全:
```json
"dev:edge": "wxt -b edge",
"build:edge": "wxt build -b edge",
"zip:edge": "wxt zip -b edge"
```

### 1.4 测试 mock 适配

`shared/__tests__/storage.test.ts` 当前用 `vi.stubGlobal('chrome', {...})` mock storage。迁移后运行时代码使用 `browser.*`,测试需改为 `vi.stubGlobal('browser', {...})`。

`shared/translator/__tests__/adapter.test.ts` 通过 `vi.mock('@/shared/storage')` 模拟整个 storage 模块,不直接 mock `chrome`/`browser` 全局,无需改动。

### 1.5 tsconfig 类型调整

`tsconfig.json` 当前 `"types": ["chrome", "wxt/client"]`。迁移到 `browser.*` 后,`browser` 全局类型由 WXT 的 `.wxt/types/imports.d.ts` 提供(声明 `const browser: typeof import('wxt/browser')['browser']`)。保留 `"chrome"` 类型以兼容测试中的 `chrome` 引用(测试不计入运行时残留),无需移除。

## 2. 下游 #68 契约

### 2.1 三浏览器构建命令与产物路径

| 浏览器 | 构建命令 | 产物目录 | zip 命令 | zip 产物路径 |
|--------|---------|---------|---------|-------------|
| Chrome | `wxt build` (或 `pnpm build`) | `.output/chrome-mv3/` | `wxt zip` (或 `pnpm zip`) | `.output/llm-translator-{{version}}-chrome.zip` |
| Firefox | `wxt build -b firefox` (或 `pnpm build:firefox`) | `.output/firefox-mv2/` | `wxt zip -b firefox` (或 `pnpm zip:firefox`) | `.output/llm-translator-{{version}}-firefox.zip` |
| Edge | `wxt build -b edge` (或 `pnpm build:edge`) | `.output/edge-mv3/` | `wxt zip -b edge` (或 `pnpm zip:edge`) | `.output/llm-translator-{{version}}-edge.zip` |

> `{{version}}` 取自 `package.json` 的 `version` 字段(当前 `0.1.0`)。WXT zip artifact 模板为 `{{name}}-{{version}}-{{browser}}.zip`。

### 2.2 manifest 差异字段

| 字段 | Chrome (MV3) | Firefox (MV2) | Edge (MV3) |
|------|-------------|---------------|------------|
| `manifest_version` | 3 (WXT 自动) | 2 (WXT 自动) | 3 (WXT 自动) |
| `host_permissions` | 原样保留 | WXT 自动归并入 `permissions` | 原样保留 |
| `browser_specific_settings` | 无 | `{ gecko: { id: 'omni-ai-translator@aiden-fe.dev' } }` | 无 |
| `background` | `{ service_worker: '...' }` (WXT 自动) | `{ scripts: ['...'], persistent: false }` (WXT 自动) | `{ service_worker: '...' }` (WXT 自动) |
| `action` | 原样保留 | WXT 自动转 `browser_action` | 原样保留 |

### 2.3 权限基线(三浏览器一致)

```json
{
  "permissions": ["storage", "activeTab"],
  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*",
    "https://translate.googleapis.com/*",
    "https://edge.microsoft.com/*",
    "https://api.cognitive.microsofttranslator.com/*",
    "https://*/*"
  ]
}
```
> Firefox MV2: `host_permissions` 被 WXT 自动归并入 `permissions`。

## 3. 兼容性与风险

### 3.1 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| Firefox MV2 `browser_action` 与 Chrome MV3 `action` 行为差异 | popup 显示可能略有差异 | Edge/Chrome 用 MV3 action;Firefox MV2 browser_action 功能等价,WXT 自动转换 |
| `browser.runtime.onMessage` polyfill Promise 模式与 chrome 回调模式差异 | background 消息处理逻辑需重写 | 用 async/return Promise 模式替代 return true + sendResponse |
| `https://*/*` host permission 在 Firefox AMO 审核可能被质疑 | 上架审核风险 | 属商店审核范畴(#68),本任务仅保证构建有效 |
| #66 同时修改 wxt.config.ts | 合并冲突 | 本任务用 manifest 函数,不改 icons 等共享字段;优先改 package.json 和运行时代码 |

### 3.2 最小兼容修补原则

仅在构建/运行阻断时做最小修补,不引入新功能:
- 不改变权限模型(沿用 #64 清理后基线)
- 不改变 UI/交互/数据模型
- 不改变存储 key 与数据结构

## 4. Smoke 验证策略

三浏览器各执行一次划词翻译核心链路:

1. **加载扩展**: 在目标浏览器 `about:debugging`(Firefox)/`edge://extensions`(Edge)/`chrome://extensions`(Chrome) 加载 `.output/<browser>-mv*/` 目录
2. **划词触发**: 在任意网页选中文本 -> 出现"译"触发按钮
3. **翻译执行**: 点击触发按钮 -> 浮层显示"翻译中…" -> 流式译文渐进渲染
4. **结果展示**: 翻译完成 -> 浮层展示最终译文(markdown 渲染)
5. **配置验证**: 打开 popup/options -> 切换翻译源 -> 保存配置 -> 打开设置页

## 5. UX 与视觉实现

本任务不新增界面,沿用 PRD `releases/v0.3/7-cross-browser-build/PRD.md` 的无界面约束。Chrome、Firefox、Edge 中保持现有划词触发按钮、loading/streaming/done/error 浮层及 popup/options 配置流程一致。兼容修补不得改变既有设计 token、组件样式、键盘操作或可访问性语义。
