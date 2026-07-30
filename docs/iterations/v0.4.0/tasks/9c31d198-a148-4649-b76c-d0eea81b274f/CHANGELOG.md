# CHANGELOG: 搭建上下文菜单入口与全文翻译消息通道

> 版本: v0.4.0 | 任务: 9c31d198-a148-4649-b76c-d0eea81b274f

## 变更内容

### 新增

- `shared/target-lang.ts`：自 `entrypoints/content.ts` 机械提取 `getTargetLang()`（用户配置 `settings.defaultTargetLang` 优先，trim 非空生效；否则回退 `navigator.language` 映射）。划词与后续全文翻译共用，行为不变。
- `shared/__tests__/target-lang.test.ts`：9 个用例锁定行为契约（配置优先/trim/空白回退、zh-CN/zh-TW/zh-HK、区域后缀 split('-') 回退、未知语言原样返回、空 navigator.language 回退 en）。
- `shared/types.ts`：
  - `DisplayMode = 'replace' | 'bilingual'`（全文翻译显示模式）。
  - `BackgroundCommand = { type: 'fullpage-translate'; mode: DisplayMode }`（background → content 命令通道，与 content → background 的 `Message` 联合显式分离）。

### 修改

- `wxt.config.ts`：baseManifest `permissions` 追加 `'contextMenus'`（chrome-mv3 / firefox-mv2 共用，WXT 自动处理 MV2 降级）。
- `entrypoints/background.ts`：
  - 顶层同步注册 `browser.contextMenus.onClicked`（MV3 SW 约束：异步回调中注册会丢事件）；按 menuItemId 映射 mode（`fullpage-replace` → `replace`，`fullpage-bilingual` → `bilingual`），`tab?.id` 空值守卫后经 `browser.tabs.sendMessage` 下发 `BackgroundCommand`，`.catch` 消化无接收端 reject。
  - `browser.runtime.onInstalled` 内创建菜单：父项「全文翻译」(id: `fullpage`) + 子项「翻译此页（替换）」(id: `fullpage-replace`) /「翻译此页（双语对照）」(id: `fullpage-bilingual`)，`contexts: ['page']`。onInstalled 内创建避免 SW 重启 duplicate id 报错。
- `entrypoints/content.ts`：删除本地 `getTargetLang` 实现，改为 `import { getTargetLang } from '@/shared/target-lang'`；划词翻译其余逻辑零改动。

## 审查反馈修复（本轮）

- 移除误提交的两个沙箱工具链包装脚本 `node-wrapper.sh`、`scripts/run-tests.sh`（指向 worktree 内临时 Node，仅供沙箱自验，与本任务功能无关；原「环境备注」已注明此类临时工具「不进入提交」，属误加）。功能代码零改动。
- 移除后全量重跑验证（见下「验证」），划词翻译与全文翻译入口契约均无回归。

## 契约产出（供后续任务）

- 菜单 id：`fullpage-replace` / `fullpage-bilingual`（父项 `fullpage`）。
- background → content 命令：`{ type: 'fullpage-translate', mode }`，经 `tabs.sendMessage` 下发，content 侧以 `browser.runtime.onMessage` 消费（t5）。
- 逐段翻译仍复用 `Message` 的 `{ type: 'translate', payload }` 通道，翻译适配层未改动。

## 验证（实际运行，移除脚本后本轮重跑）

- 单元测试：`vitest run` → 10 文件 158 用例全过（含 9 个新增 target-lang 用例；既有 storage/translator/render 零回归）。
- 类型检查：`vue-tsc --noEmit` → exit 0，无错误。
- Lint：`eslint . --ext .ts,.vue` → exit 0，无告警。
- 构建：`wxt build`（chrome-mv3）与 `wxt build -b firefox`（firefox-mv2）均 exit 0。
- 产物断言：双端 manifest `permissions` 含 `contextMenus`（chrome-mv3 独立 permissions；firefox-mv2 并入 permissions）；background.js 含顶层同步 `contextMenus.onClicked`、mode 映射、`onInstalled` 内三项菜单创建（`fullpage`/`fullpage-replace`/`fullpage-bilingual` + 中文标题 + `contexts:["page"]`）、`tabs.sendMessage` 下发 `{type:"fullpage-translate",mode}`。
- e2e：`playwright test`（worktree 内 `.pw-browsers/` chromium）→ 7/7 通过，划词翻译全链路零回归（触发按钮、浮层、目标语言配置、OpenAI 流式、anthropic/ollama/microsoft 各协议风格）。

## 环境备注

沙箱 PATH 无 node/pnpm 且 node_modules 符号链接缺 darwin-x64/arm64 平台原生包：验证经 worktree 内临时 Node v22.12.0 + `run-bin.mjs` 解析钩子运行（不进入提交）；playwright 浏览器装于 worktree 内 `.pw-browsers/`（未 gitignore，勿提交）。
