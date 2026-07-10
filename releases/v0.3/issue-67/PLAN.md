# PLAN: #67 跨浏览器兼容 - Firefox/Edge 构建与运行时适配

> Issue #67 · 版本 v0.3 · 创建日期 2026-07-10

## 执行清单

### A. WXT manifest 差异化配置
- [x] A1. 将 `wxt.config.ts` manifest 改为函数形式,按 `browser` 目标差异化(Firefox 添加 `browser_specific_settings.gecko.id`)

### B. chrome.* -> browser.* 运行时迁移
- [x] B1. `entrypoints/background.ts`: `chrome.runtime.onMessage` -> `browser.runtime.onMessage`(Promise 模式重写)
- [x] B2. `entrypoints/background.ts`: `chrome.runtime.onConnect` -> `browser.runtime.onConnect`
- [x] B3. `entrypoints/content.ts`: `chrome.runtime.connect` -> `browser.runtime.connect`
- [x] B4. `entrypoints/popup/App.vue`: `chrome.runtime.openOptionsPage` -> `browser.runtime.openOptionsPage`
- [x] B5. `shared/storage.ts`: `chrome.storage.local.get/set` -> `browser.storage.local.get/set`
- [x] B6. `shared/ui/SourceConfigPanel.vue`: `chrome.runtime.sendMessage` -> `browser.runtime.sendMessage`

### C. Edge 脚本补全
- [x] C1. `package.json` 添加 `dev:edge`、`build:edge`、`zip:edge` 脚本

### D. 测试 mock 适配
- [x] D1. `shared/__tests__/storage.test.ts`: `vi.stubGlobal('chrome', ...)` -> `vi.stubGlobal('browser', ...)`

### E. 构建与测试验证
- [x] E1. `pnpm build` (Chrome) 通过
- [x] E2. `pnpm build:firefox` 通过
- [x] E3. `pnpm build:edge` 通过
- [x] E4. `pnpm typecheck` 通过
- [x] E5. `pnpm test` 通过 (149 tests passed)
- [x] E6. `pnpm lint` 通过
- [x] E7. 核对三浏览器产物 manifest 字段正确性

### F. 文档与收尾
- [x] F1. 写 CHANGELOG.md(含下游 #68 契约)
- [x] F2. 更新 MEMORY.md(待沉淀知识)
- [x] F3. commit + push + 创建 PR
