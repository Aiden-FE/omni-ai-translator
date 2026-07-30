# PLAN: 搭建上下文菜单入口与全文翻译消息通道

> 版本: v0.4.0 | 任务: 9c31d198-a148-4649-b76c-d0eea81b274f

## 执行计划（有序，每步保持绿色边界）

- [x] 1. **RED 测试先行**：新增 `shared/__tests__/target-lang.test.ts`
  - 文件：`shared/__tests__/target-lang.test.ts`
  - 覆盖：配置值优先（含空白回退）、zh-CN/zh-TW/zh-HK 映射、en-US 经 split('-') 回退、未知语言原样返回、navigator.language 为空回退 'en'
  - 验证：`vitest run` 此时应失败（`shared/target-lang.ts` 不存在）
- [x] 2. **GREEN 提取函数**：新增 `shared/target-lang.ts`，`entrypoints/content.ts` 切换 import
  - 接口产出：`getTargetLang(): Promise<string>`
  - 验证：`vitest run` 全绿；`vue-tsc --noEmit` 通过（划词逻辑零改动）
- [x] 3. **类型契约**：`shared/types.ts` 新增 `DisplayMode`、`BackgroundCommand`
  - 与 `Message`（content→background）分离
  - 验证：`vue-tsc --noEmit` 通过
- [x] 4. **权限**：`wxt.config.ts` permissions 追加 `'contextMenus'`
  - 验证：构建产物 manifest.json（chrome-mv3 / firefox-mv2）permissions 含 contextMenus
- [x] 5. **background 菜单与命令下发**：`entrypoints/background.ts`
  - onInstalled：创建父项 `fullpage` + 子项 `fullpage-replace` / `fullpage-bilingual`（contexts: ['page']）
  - 顶层同步 onClicked：id→mode 映射 + tab?.id 守卫 + `browser.tabs.sendMessage` + catch 消化
  - 验证：`vue-tsc --noEmit`、`eslint`、`wxt build` 通过
- [x] 6. **回归验证**：`vitest run` 158 全过、`eslint` 净、`wxt build` 双端成功、e2e 7/7 通过（Chrome for Testing 149，worktree 内浏览器缓存）
- [x] 7. **任务文档**：CHANGELOG.md、index.md 更新

## 依赖与接口

- 消费：`shared/storage.ts#getSettings`（target-lang 复用）、`@/shared/types`（BackgroundCommand）
- 产出给后续任务：菜单 id 契约（`fullpage-replace`/`fullpage-bilingual`）、`BackgroundCommand` 通道（t5 在 content 侧以 `browser.runtime.onMessage` 消费）
- 不改：翻译适配层（`shared/translator`）、逐段翻译仍复用 `Message` 的 `{ type: 'translate' }` 通道

## 环境备注

沙箱 PATH 无 node/pnpm；已在 worktree 内放置官方 Node v22.12.0（nodejs.org darwin-x64 tarball，CI 同版本线 22），经相对 PATH 项以裸命令 `node` 运行项目工具（vitest/vue-tsc/eslint/wxt 的 JS 入口）。验证结束后清理该临时工具链。
