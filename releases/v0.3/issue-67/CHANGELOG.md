# CHANGELOG: #67 跨浏览器兼容 - Firefox/Edge 构建与运行时适配

> Issue #67 · 版本 v0.3 · 创建日期 2026-07-10

## 变更摘要

将 LLM Translator 扩展从仅 Chrome 验证扩展为 Chrome/Firefox/Edge 三浏览器构建与运行时兼容:

1. **WXT manifest 差异化**: `wxt.config.ts` manifest 从静态对象改为函数形式,按 `browser` 目标差异化;Firefox 添加 `browser_specific_settings.gecko.id`(AMO 上架必需);WXT 自动处理 MV2/MV3 差异(host_permissions 归并、action->browser_action、background 脚本格式)
2. **chrome.* -> browser.* 全量迁移**: 7 处运行时调用点迁移到 WXT 统一 `browser.*` API(webextension-polyfill);background.ts onMessage 监听器从 `return true + sendResponse` 回调模式重写为 `async/return Promise` 模式
3. **Edge 脚本补全**: `package.json` 添加 `dev:edge`/`build:edge`/`zip:edge` 脚本
4. **测试 mock 适配**: storage 测试 mock 从 `chrome` 全局改为 `browser` 全局

## 验证结果

- `pnpm build` (Chrome MV3) 通过,产物: `.output/chrome-mv3/`
- `pnpm build:firefox` (Firefox MV2) 通过,产物: `.output/firefox-mv2/`
- `pnpm build:edge` (Edge MV3) 通过,产物: `.output/edge-mv3/`
- `pnpm typecheck` 通过
- `pnpm test` 通过 (149 tests passed)
- `pnpm lint` 通过
- 三浏览器 zip 命令均通过,产物路径稳定
- 运行时代码无 `chrome.*` 直接调用残留

## 下游 #68 契约:三浏览器构建命令与产物路径

| 浏览器 | 构建命令 | 产物目录 | zip 命令 | zip 产物路径 |
|--------|---------|---------|---------|-------------|
| Chrome | `pnpm build` | `.output/chrome-mv3/` | `pnpm zip` | `.output/llm-translator-0.1.0-chrome.zip` |
| Firefox | `pnpm build:firefox` | `.output/firefox-mv2/` | `pnpm zip:firefox` | `.output/llm-translator-0.1.0-firefox.zip` (+ `llm-translator-0.1.0-sources.zip`) |
| Edge | `pnpm build:edge` | `.output/edge-mv3/` | `pnpm zip:edge` | `.output/llm-translator-0.1.0-edge.zip` |

### manifest 差异字段

| 字段 | Chrome (MV3) | Firefox (MV2) | Edge (MV3) |
|------|-------------|---------------|------------|
| `manifest_version` | 3 | 2 | 3 |
| `host_permissions` | 独立字段 | 归并入 `permissions`(WXT 自动) | 独立字段 |
| `browser_specific_settings` | 无 | `{ gecko: { id: 'omni-ai-translator@aiden-fe.dev' } }` | 无 |
| `background` | `{ service_worker: 'background.js' }` | `{ scripts: ['background.js'] }` | `{ service_worker: 'background.js' }` |
| `action` / `browser_action` | `action` | `browser_action`(WXT 自动转换) | `action` |

### 权限基线(三浏览器一致,上游 #64 清理后)

`permissions: ['storage', 'activeTab']`
`host_permissions: ['http://localhost/*','http://127.0.0.1/*','https://translate.googleapis.com/*','https://edge.microsoft.com/*','https://api.cognitive.microsofttranslator.com/*','https://*/*']`

## Smoke 验证步骤(三浏览器)

1. **加载扩展**: Chrome `chrome://extensions`(开发者模式->加载已解压); Firefox `about:debugging#/runtime/this-firefox`(临时加载附加组件); Edge `edge://extensions`(开发者模式->加载已解压)
2. **划词触发**: 在任意网页选中文本 -> 出现"译"触发按钮
3. **翻译执行**: 点击触发按钮 -> 浮层显示"翻译中…" -> 流式译文渐进渲染
4. **结果展示**: 翻译完成 -> 浮层展示最终译文(markdown 渲染)
5. **配置验证**: 打开 popup -> 切换翻译源 -> 保存 -> 打开设置页(openOptionsPage)
