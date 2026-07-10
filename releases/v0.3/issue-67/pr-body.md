## 变更摘要

将 LLM Translator 扩展从仅 Chrome 验证扩展为 Chrome/Firefox/Edge 三浏览器构建与运行时兼容:

1. **WXT manifest 差异化**: `wxt.config.ts` manifest 从静态对象改为函数形式,按 `browser` 目标差异化;Firefox 添加 `browser_specific_settings.gecko.id`(AMO 上架必需);WXT 自动处理 MV2/MV3 差异(host_permissions 归并、action->browser_action、background 脚本格式)
2. **chrome.* -> browser.* 全量迁移**: 7 处运行时调用点迁移到 WXT 统一 `browser.*` API;`background.ts` onMessage 监听器从 `return true + sendResponse` 回调模式重写为 `async/return Promise` 模式
3. **Edge 脚本补全**: `package.json` 添加 `dev:edge`/`build:edge`/`zip:edge` 脚本
4. **测试 mock 适配**: storage 测试 mock 从 `chrome` 全局改为 `browser` 全局

### 影响面

- `wxt.config.ts`: manifest 配置结构变更(静态对象 -> 函数),共享字段不变
- `entrypoints/background.ts`: onMessage 监听器模式变更(Promise 替代回调)
- `entrypoints/content.ts`: `chrome.runtime.connect` -> `browser.runtime.connect`
- `entrypoints/popup/App.vue`: `chrome.runtime.openOptionsPage` -> `browser.runtime.openOptionsPage`
- `shared/storage.ts`: `chrome.storage.local` -> `browser.storage.local`
- `shared/ui/SourceConfigPanel.vue`: `chrome.runtime.sendMessage` -> `browser.runtime.sendMessage`
- `package.json`: 新增 3 个 Edge 脚本
- `shared/__tests__/storage.test.ts`: mock 全局从 `chrome` 改为 `browser`

### 回滚方案

`git revert` 本 commit 即可恢复到 chrome.* + 静态 manifest 的单 Chrome 构建状态。无数据迁移、无存储格式变更,回滚无副作用。

---

## 审查上下文

| 项目 | 值 |
|------|-----|
| PRD Issue | #55 |
| PRD 文档路径 | `releases/v0.3/7-cross-browser-build/PRD.md` |
| 版本 | v0.3 |
| 里程碑 | v0.3 - 商店首发与 UI 美化 |
| DESIGN 路径 | `releases/v0.3/issue-67/DESIGN.md` |
| PLAN 路径 | `releases/v0.3/issue-67/PLAN.md` |
| CHANGELOG 路径 | `releases/v0.3/issue-67/CHANGELOG.md` |
| 验收标准 | 三浏览器构建/zip 通过;运行时无 chrome.* 残留;typecheck/test/lint 通过;manifest 字段正确 |
| UX 规范 | 无新增界面,沿用三浏览器浮层/popup/options 一致 |
| 知识沉淀清单 | WXT 跨浏览器 manifest 差异化模式(ADR);chrome.*->browser.* 迁移约定(context) |
| 并发安全 | blocked-by-upstream |
| MR 基线 | after-upstream-merged(上游 #64 已合并,本 PR 基于 master) |
| 上游 Issue/MR | #64(PR #70 已合并) |
| 基线分支 | master |
| 推荐合并顺序 | 先于 #68 |
| Stacked MR | 否 |
| 依赖契约 | 为 #68 提供三浏览器构建命令/产物路径/manifest 契约 |

### 下游 #68 契约:三浏览器构建命令与产物路径

| 浏览器 | 构建命令 | 产物目录 | zip 命令 | zip 产物路径 |
|--------|---------|---------|---------|-------------|
| Chrome | `pnpm build` | `.output/chrome-mv3/` | `pnpm zip` | `.output/llm-translator-0.1.0-chrome.zip` |
| Firefox | `pnpm build:firefox` | `.output/firefox-mv2/` | `pnpm zip:firefox` | `.output/llm-translator-0.1.0-firefox.zip` (+ sources.zip) |
| Edge | `pnpm build:edge` | `.output/edge-mv3/` | `pnpm zip:edge` | `.output/llm-translator-0.1.0-edge.zip` |

### 测试结果

- `pnpm build` (Chrome MV3): 通过
- `pnpm build:firefox` (Firefox MV2): 通过
- `pnpm build:edge` (Edge MV3): 通过
- `pnpm typecheck`: 通过
- `pnpm test`: 149 tests passed
- `pnpm lint`: 通过

Closes #67
