# WXT 跨浏览器 manifest 差异化策略

v0.3 将扩展从 Chrome 单浏览器扩展到 Chrome/Firefox/Edge 三浏览器。三浏览器对 Manifest 规范要求不同：Firefox 要求 MV2（`manifest_version=2`、`host_permissions` 归入 `permissions`、`browser_specific_settings.gecko.id`、`browser_action`、`background.scripts`），Chrome/Edge 要求 MV3（`manifest_version=3`、`host_permissions` 独立、`action`、`background.service_worker`）。我们决定用 WXT `manifest` 函数按目标浏览器 emit 差异化 manifest，借助 WXT 自动 MV2 降级能力，而非手动维护多份 manifest。运行时统一使用 WXT 提供的 `browser.*` API（webextension-polyfill 语义，`onMessage` 返回 Promise），替代直接使用 `chrome.*` API。权限基线三浏览器一致：`permissions: ['storage']`（`contextMenus` 与 `activeTab` 均已确认未使用并移除）。

**状态**: accepted

**考虑过的选项**:

| 方案 | 描述 | 结论 |
|------|------|------|
| A. WXT manifest 函数差异化 | 用 WXT `manifest()` 按 `browser` 目标 emit 差异化字段，WXT 自动 MV2 降级 | 采用 - 单一配置源、WXT 处理 MV2/MV3 转换、运行时统一 `browser.*` API |
| B. 多份独立 manifest | 为每个浏览器维护独立 manifest.json | 否决 - 重复维护、易不一致、WXT 构建流程不原生支持 |
| C. 后处理脚本修改 manifest | 构建后用脚本 patch manifest 字段 | 否决 - hack 式、脆弱、难维护、WXT 已原生支持 manifest 函数 |

**后果**:

- Firefox 构建产物为 MV2：WXT 自动将 `action` 降级为 `browser_action`、`background.service_worker` 降级为 `background.scripts`、`host_permissions` 合并入 `permissions`；Firefox 专属的 `browser_specific_settings.gecko.id` 通过 manifest 函数条件 emit。
- Chrome/Edge 构建产物为 MV3：`host_permissions` 独立、`action` + `background.service_worker` 标准结构。
- 运行时代码统一使用 `browser.*` API（WXT 注入 webextension-polyfill 语义），`onMessage` 监听返回 Promise，不再直接使用 `chrome.*` 回调模式。
- 权限基线三浏览器一致：`permissions: ['storage']`。`contextMenus` 与 `activeTab` 权限均已确认未使用并移除(activeTab 于 v0.3.1 因 Chrome Web Store 审核反馈移除,content script 靠 `window.getSelection` 不需该权限),减少商店审核权限质询。
- 新增浏览器支持只需在 WXT `manifest` 函数中增加条件分支与对应构建命令，无需另起 manifest 文件。
- 相关文件：`wxt.config.ts`、`releases/v0.3/issue-67/DESIGN.md`。
