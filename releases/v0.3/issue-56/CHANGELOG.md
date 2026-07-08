# CHANGELOG - Issue #56

## 变更概览

Issue #56 完成 v0.3 UI 设计系统重构基座：引入 tailwindcss + shadcn-vue 相关依赖与配置，建立 CSS 变量 design token 体系，并将 content 划词触发按钮、iframe 翻译浮层、popup、options 与 `SourceConfigPanel` 迁移到 token 驱动的新 UI 表达。

## 新增功能

- 新增 `shared/styles/tokens.css` 与 `shared/styles/app.css`，统一声明 app UI token、content iframe token、tailwind 样式入口与 reduced-motion 基础策略。
- 新增 shadcn-vue 风格的本地基础组件：Button、Card、Input、Label、Select、Badge、ScrollArea，并新增 `shared/lib/utils.ts` 的 `cn()` class 合并工具。
- 新增 `components.json` 与 `tailwind.config.ts`，并在 `wxt.config.ts` 中接入 `@tailwindcss/vite`，为后续 #57 视觉主题替换提供 token 基座。
- 新增 `shared/ui/__tests__/design-system.test.ts`，覆盖 token 文件、content token 使用、基础组件存在性与目标 UI 表面硬编码色值约束。

## 行为保持

- 保持 popup 根容器 `400x600`、options 最大宽度 `720px`、content 浮层最大宽度 `360px` 等尺寸约束。
- 保持 provider/storage/message/translator 业务契约不变，`SourceConfigPanel` 的新增、测试、激活、删除与折叠逻辑不变。
- 保持 content iframe 隔离、markdown 渲染、loading/streaming/done/error 状态流转与现有 e2e 选择器不变。

## 文档更新

- 更新 `knowledges/ux/design-system.md`，补充 v0.3 token 命名、CSS 变量表、content iframe token 边界、shadcn-vue 组件目录与 #57 主题替换边界。
- 更新 `releases/v0.3/issue-56/PLAN.md` 与 `MEMORY.md`，记录 Step4 完成状态、验证结果、实现要点与环境踩坑。

## API Changes

无。Issue #56 不变更外部 API、storage schema、typed message、translator adapter 或权限配置。

## Breaking Changes

无。现有 popup、options、content 翻译浮层和 provider 配置行为保持兼容。

## 验证结果

以下结果均来自 `C:\Users\aiden\dev\prodflow\ai-projects\llm-translator\.worktrees\master-issue-56` 同一 worktree 的实际执行记录：

- `pnpm test shared/ui/__tests__/design-system.test.ts`：先 RED，缺少 token/组件/色值约束时 4 项失败；实现后 GREEN，4 tests passed。
- `pnpm test`：9 个测试文件，147 tests passed。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm build`：通过，WXT chrome-mv3 extension built successfully。
- `pnpm e2e`：首次因 Playwright Chromium 未安装失败；执行浏览器安装并清理 stale `__dirlock` 后重跑通过，7 tests passed。
- `git diff --check`：通过，仅提示既有/当前文件 CRLF 换行警告，无 whitespace error。
- 硬编码色值核对：目标 UI 表面 `assets/content.css`、popup、options、`SourceConfigPanel.vue` 未发现散落 `#RRGGBB` 主题色表达。

## 部署注意事项

- 依赖恢复需使用 pnpm lockfile；在当前环境中使用 `CI=true pnpm install --frozen-lockfile` 避免无 TTY 清理提示。
- pnpm v11 需要在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式声明允许执行 build script 的依赖；本任务允许 `esbuild`、`spawn-sync` 与 `vue-demi`。
- 首次运行 e2e 的机器若缺少 Playwright Chromium，需要先执行 `pnpm exec playwright install chromium` 或项目脚本 `pnpm e2e:install`。

## CI 修正记录

- PR #58 首轮 CI 在 `pnpm install --frozen-lockfile` 阶段失败，尚未进入 typecheck、lint 或 e2e。
- 失败原因是 pnpm 11 的 `strictDepBuilds` 不再使用旧的 `onlyBuiltDependencies` 白名单；`esbuild@0.21.3`、`esbuild@0.23.0`、`spawn-sync@1.0.15` 未出现在 `allowBuilds` 中，因此触发 `ERR_PNPM_IGNORED_BUILDS`。
- 已将 `pnpm-workspace.yaml` 调整为仅使用 `allowBuilds`，显式允许 `esbuild: true`、`spawn-sync: true`、`vue-demi: true`，并移除废弃的 `onlyBuiltDependencies`。
- 修正后重新验证：`CI=true pnpm install --frozen-lockfile` 通过；`CI=true pnpm typecheck` 通过；`CI=true pnpm lint` 通过；`CI=true pnpm e2e` 通过，7 tests passed。
