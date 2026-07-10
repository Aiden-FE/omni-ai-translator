# MEMORY: #67 跨浏览器兼容 - Firefox/Edge 构建与运行时适配

## 任务元数据
- Issue: #67
- PRD Issue: #55
- 迭代版本: v0.3
- 类型: 前端
- 上游依赖: #64 (PR #70 已合并,master 已含 contextMenus 清理后权限基线)
- 下游消费者: #68 (多浏览器发布流水线)
- worktree: /home/admin/dev/prodflow/ai-projects/llm-translator/.worktrees/master-issue-67
- 分支: issue-67

## PRD 摘要
- 目标: 配置 WXT 的 Chrome/Firefox/Edge 差异化 manifest,迁移 chrome.*->browser.*,补全 Edge 脚本,提供 smoke 验证步骤
- 不含: GitHub Actions workflow、商店 API 发布、新功能/交互改版

## chrome.* 调用清单(运行时代码)
1. `entrypoints/content.ts:147` - `chrome.runtime.connect({ name: 'translate-stream' })` -> `browser.runtime.connect`
2. `entrypoints/background.ts:17` - `chrome.runtime.onMessage.addListener(...)` -> `browser.runtime.onMessage.addListener` (API 模式变化:polyfill 用 Promise 替代 return true + sendResponse)
3. `entrypoints/background.ts:58` - `chrome.runtime.onConnect.addListener(...)` -> `browser.runtime.onConnect.addListener`
4. `entrypoints/popup/App.vue:11` - `chrome.runtime.openOptionsPage()` -> `browser.runtime.openOptionsPage()`
5. `shared/storage.ts:16` - `chrome.storage.local.get(key)` -> `browser.storage.local.get(key)`
6. `shared/storage.ts:21` - `chrome.storage.local.set(...)` -> `browser.storage.local.set(...)`
7. `shared/ui/SourceConfigPanel.vue:97` - `chrome.runtime.sendMessage(message)` -> `browser.runtime.sendMessage(message)`

## 测试 mock(已迁移)
- `shared/__tests__/storage.test.ts`: 已从 `vi.stubGlobal('chrome', ...)` 迁移为 `vi.stubGlobal('browser', ...)` 以匹配运行时改动
- `shared/translator/__tests__/adapter.test.ts`: `vi.mock('@/shared/storage', ...)` - 不直接 mock chrome,无需改动

## WXT 跨浏览器能力(WXT 0.19)
- `manifest` 字段支持函数形式: `(env: ConfigEnv) => UserManifest`,env 含 `browser`/`manifestVersion`
- WXT 自动处理: manifest_version(Firefox=MV2,Chrome/Edge=MV3)、host_permissions->permissions(MV2)、action->browser_action(MV2)、background 脚本格式
- Firefox 需手动添加: `browser_specific_settings.gecko.id` (AMO 必需)
- `browser` 全局由 WXT 自动注入(webextension-polyfill),类型在 `.wxt/types/imports.d.ts` 声明

## 权限基线(上游 #64 清理后)
- `permissions: ['storage', 'activeTab']`
- `host_permissions: ['http://localhost/*','http://127.0.0.1/*','https://translate.googleapis.com/*','https://edge.microsoft.com/*','https://api.cognitive.microsofttranslator.com/*','https://*/*']`

## 构建命令与产物路径契约(为 #68)
| 浏览器 | 构建命令 | 产物目录 | zip 命令 | zip 产物 |
|--------|---------|---------|---------|---------|
| Chrome | `wxt build` | `.output/chrome-mv3/` | `wxt zip` | `.output/llm-translator-0.1.0-chrome.zip` |
| Firefox | `wxt build -b firefox` | `.output/firefox-mv2/` | `wxt zip -b firefox` | `.output/llm-translator-0.1.0-firefox.zip` |
| Edge | `wxt build -b edge` | `.output/edge-mv3/` | `wxt zip -b edge` | `.output/llm-translator-0.1.0-edge.zip` |

## 并发安全
- #66 可能改 wxt.config.ts(加 manifest icons);本任务用 manifest 函数做差异化,不碰 icons 字段
- 优先改 package.json scripts 与运行时代码,不与 #66 冲突

## 待沉淀知识
- WXT 跨浏览器 manifest 差异化模式(manifest 函数 + WXT 自动 MV2 降级):适合 ADR 沉淀,记录 WXT 如何自动处理 manifest_version/host_permissions 归并/action 转换/background 格式,以及开发者只需手动添加 browser_specific_settings.gecko.id
- chrome.*->browser.* 迁移约定(webextension-polyfill API 差异):适合 context 沉淀,记录 onMessage 从 `return true + sendResponse` 回调模式到 `async/return Promise` 模式的重写约定,以及 browser.* 全局由 WXT 自动注入的类型来源
- 知识沉淀:待补
