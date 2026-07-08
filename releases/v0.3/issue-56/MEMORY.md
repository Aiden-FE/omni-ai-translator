# 任务记忆文档

本文档记录 Issue #56 在 v0.3 迭代中的关键信息，供当前 worker 后续 Step3-Step6 持续更新。只记录需求、约束、决策、依赖和踩坑，不复制完整代码实现。

## 任务基础信息

| 项 | 说明 |
|----|------|
| 版本号 | `v0.3` |
| ISSUE_ID | `#56` |
| PRD Issue | `#49` |
| 基础分支 | `master` |
| 任务分支 | `issue-56` |
| 任务 worktree | `C:\Users\aiden\dev\prodflow\ai-projects\llm-translator\.worktrees\master-issue-56` |
| 迭代文档目录 | `releases/v0.3/issue-56/` |

## PRD 摘要

- #56 对应 PRD #49 的唯一研发任务，PRD 文档为 `releases/v0.3/1-ui-rewrite/PRD.md`。
- 目标是在不改变功能行为的前提下，引入 tailwindcss + shadcn-vue，建立 design token / CSS 变量体系，并迁移 content 触发按钮、iframe 翻译浮层、popup、options、`shared/ui/SourceConfigPanel.vue` 到新设计系统。
- 本任务是 #50 visual-theme 的上游基座，token 值首版沿用当前冷色调，后续 #50 只替换 token 色板。
- 不包含视觉主题色板定稿、provider/storage/message/translator 契约改动、新功能入口、数据模型或权限变更。
- 验收要求包括 `pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm e2e`，若 e2e 因环境不可运行需说明原因。

## 业务规则与约束

- 纯 UI 重构，四类组件的交互流程、状态流转、反馈文案和尺寸约束必须与 v0.2 对齐。
- content 浮层继续使用 `about:blank` iframe 隔离和 `content.css?inline` 注入模式；宿主页面 CSS 不得污染浮层。
- 触发按钮继续在宿主 DOM 中渲染，保留 `.llm-translator-*` 前缀策略和可读 label。
- popup 尺寸保持 400x600，options 最大宽度 720px 居中，浮层最大宽度 360px 且不溢出视口。
- provider、storage、typed message、translator adapter 契约不变；content-script 不直接 fetch 第三方接口。
- API Key 不得出现在日志、commit、错误上报或文档样例中。

## UX 约束

- 原 PRD `## UX 设计` 要求本轮不新增交互，仅迁移渲染层。
- 交互模式来源：`knowledges/ux/interaction-patterns.md`。划词释放后出现圆形「译」按钮，点击后浮层 loading -> streaming -> done/error；空选区或超过 5000 字符不出现。
- 可访问性来源：`knowledges/ux/accessibility.md`。popup/options 所有可操作控件需可 Tab 聚焦；浮层保留 `role="status"`/`aria-live` 语义；成功/失败不只依赖颜色。
- 设计系统来源：`knowledges/ux/design-system.md`。当前冷色调包括浮层背景 `#1F2937`、文字 `#F9FAFB`、边框 `#E5E7EB`/`#D1D5DB`、成功 `#16A34A`、错误 `#DC2626`，本任务需迁移到 token。
- 视觉原型参考：`knowledges/ux/prototypes/index.md` 中 v0.2 source picker、popup settings、markdown render、LLM type unify 原型；本轮不新增高保真原型。

## 技术约束

- 项目形态：Chrome MV3 + WXT + Vue 3 + TypeScript。
- TypeScript 严格模式，禁止新增 `any`；确需动态数据时使用 `unknown` + 类型守卫。
- 配置读写统一走 `shared/storage.ts`，消息走 `shared/types.ts` 的 typed message，LLM 调用走 `shared/translator/` 适配层。
- WXT 0.19 需与 tailwindcss / shadcn-vue 构建集成；若 tailwind v4 Vite 插件不兼容，可回退到 tailwind v3 + PostCSS，并在 DESIGN/PLAN 记录回滚路径。
- `.codegraph/` 存在，后续结构性代码定位优先使用 CodeGraph。

## 依赖关系

- 并发安全等级：`parallel-safe`。
- MR 基线策略：`base-branch`。
- 上游依赖：无。
- 上游 Issue/MR：无。
- Stacked MR：否。
- 推荐合并顺序：先 #56，再 #57；#57 必须在 #56 合并后执行。
- 依赖契约或接口文档：`releases/v0.3/1-ui-rewrite/PRD.md`、`knowledges/ux/design-system.md`、`knowledges/ux/interaction-patterns.md`、`knowledges/ux/accessibility.md`。

## 自动决策记录

| 决策点 | 采用值 | 依据 | 风险 | 回滚方式 |
|---|---|---|---|---|
| 执行模式 | 无人值守默认推进 | 用户明确要求默认无人值守，且 Issue/PRD/版本/分支信息完整 | 可能缺少人工偏好输入 | 后续 PR 审查中调整 DESIGN/PLAN 或回滚 commit |
| 基础分支 | `master` | 用户上下文指定当前允许 base 分支为 `master`，Issue 基线策略为 `base-branch` | master 最新变化可能影响 UI 重构 | 从 master 重新同步后重跑验证 |
| 任务文档目录 | `releases/v0.3/issue-56/` | workspace-rule 对 `#56` 的 ISSUE_ID_FS 规则为 `issue-56` | 无 | 删除/重建任务 worktree 后由工具重新创建 |
| 知识沉淀模式 | 子 agent 模式仅收集要点 | 用户硬性要求 Step5b 不调用 `prodflow-knowledge-*`，写入 MEMORY 并回传 | 知识库不会在本 worker 内直接更新 | 协调器在主会话统一沉淀 |
| 迭代主文档 | 不更新 `releases/v0.3/index.md` | 用户声明本任务为子 agent 模式且主工作区已有未提交 index.md 改动 | 迭代主文档状态需后续协调器更新 | #56 合并后由协调器统一更新 |
| shadcn-vue 引入策略 | 按需复制/实现基础 UI 组件 | PRD 要求 shadcn-vue，且需控制扩展包体积和 MV3 兼容性 | 第三方组件依赖可能增加构建复杂度 | 保留 token + tailwind，必要时回退为本地轻量组件 |

## 知识检索结果

- L4 知识检索已执行，涉及产品与 UX。高相关知识包括插件架构、编码规范、UX 设计系统、交互模式、可访问性、v0.2 视觉原型索引和 PRD #49。
- 插件架构确认 content/background/popup/options 分工；本任务只改 UI 表现层，不改变 background、storage、translator 业务契约。
- 产品启动摘要确认核心链路为划词 -> 触发按钮 -> LLM 翻译 -> 浮层译文，交互模型是不自动翻译，点击触发，需保持不打扰阅读流。
- UX 规范目前仍记录旧冷色调，#56 需要更新 `knowledges/ux/design-system.md` 落档 token 命名与使用规则。

## 踩坑记录

- `pnpm install --frozen-lockfile` 在沙箱内 postinstall 执行 `wxt prepare` 时出现 `spawn EPERM`；已按规则请求非沙箱执行。
- 非沙箱第二次安装因 pnpm 无 TTY 清理提示失败，使用 `CI=true` 后成功恢复依赖并完成 `wxt prepare`。
- pnpm v11 不再读取 `package.json` 中的 `pnpm.onlyBuiltDependencies`，需在 `pnpm-workspace.yaml` 中配置 `onlyBuiltDependencies` 与 `allowBuilds.vue-demi: true`，否则 `vue-demi` build script 会被拦截。
- `pnpm e2e` 首次失败是 Playwright Chromium 缺失；第一次 `pnpm e2e:install` 超时留下 `C:\Users\aiden\AppData\Local\ms-playwright\__dirlock`，删除陈旧锁后执行 `pnpm exec playwright install chromium` 成功，再跑 e2e 通过。
- 当前环境没有可派发子 agent 的 Task 类工具；Step4 子 agent 驱动开发要求降级为当前会话分段执行，并通过测试、e2e 与后续审查补足质量门禁。

## 实现阶段记录

- 引入 `tailwindcss`、`@tailwindcss/vite`、`shadcn-vue`，并在 `wxt.config.ts` 注册 tailwind Vite 插件。tailwind v4 与 WXT 0.19 构建验证通过，未触发 v3 回退。
- 新增 `shared/styles/tokens.css` 和 `shared/styles/app.css`，popup/options 从 main 入口导入全局 token 与 tailwind。
- 新增 `components.json`、`tailwind.config.ts`、`shared/lib/utils.ts`，并新增 Button、Card、Input、Label、Select、Badge、ScrollArea 基础组件。组件使用 token/tailwind class，无新增业务状态。
- `assets/content.css` 顶部声明 content iframe token fallback；trigger、panel、markdown、错误、光标样式均改为 CSS 变量驱动，保留 `.llm-translator-trigger`、`.llm-translator-panel-frame`、`.llm-translator-panel` 等 e2e 选择器。
- `entrypoints/content.ts` 补齐浮层 `role="status"` 与 trigger `aria-label="翻译选中文本"`，不改变 Port 流式通信、Markdown sanitize 和 iframe 尺寸同步逻辑。
- popup 根容器保持 `400x600`，options 根容器保持 `max-w-[720px]`；`SourceConfigPanel.vue` 迁移到 Card/Input/Select/Button/Badge，但 `focusFirst()`、`addProvider()`、折叠逻辑、provider/storage/message 契约保持不变。
- `knowledges/ux/design-system.md` 已落档 v0.3 token 命名、content 扩展 token、shadcn-vue 组件目录和 #57 visual-theme 的替换边界。

## 验证记录

- `pnpm test shared/ui/__tests__/design-system.test.ts`：先 RED，4 项断言因缺少 token/组件/硬编码色值失败；实现后 GREEN，4 tests passed。
- `pnpm test`：9 个测试文件、147 tests passed。
- `pnpm typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm build`：通过，WXT chrome-mv3 extension built successfully。
- `pnpm e2e`：最终通过，7 tests passed。首次失败原因是 Playwright Chromium 未安装；安装后重跑通过。

## 待沉淀知识

知识沉淀：待补。当前为子 agent 模式，仅收集要点写入本节，不调用 `prodflow-knowledge-*` 技能。

### context - v0.3 UI design token 基座

- Issue ID：#56。
- 概念名：LLM Translator v0.3 UI design token 基座。
- 定义：popup、options、content trigger、content iframe panel 统一通过 tailwindcss、shadcn-vue 风格本地基础组件与 CSS 变量 token 表达视觉样式。
- 影响范围：扩展 UI 表现层；不改变 storage、typed message、translator adapter、provider schema 或权限。
- 相关文件：`tailwind.config.ts`、`components.json`、`shared/styles/tokens.css`、`shared/styles/app.css`、`shared/ui/components/`、`assets/content.css`、`entrypoints/popup/App.vue`、`entrypoints/options/App.vue`、`shared/ui/SourceConfigPanel.vue`。
- 建议沉淀路径：`knowledges/context/development/ui-design-system.md` 或补充到现有 UX 规范索引。

### adr - 采用 tailwindcss v4 + @tailwindcss/vite + 本地 shadcn-vue 组件

- Issue ID：#56。
- 决策标题：采用 tailwindcss v4 与 `@tailwindcss/vite` 接入 WXT，使用本地 shadcn-vue 风格组件承载当前 UI。
- 背景：#49 要求为 v0.3 UI rewrite 建立可替换主题基座，#57 依赖 #56 合并后复用 token 更换视觉主题。
- 方案与取舍：优先 tailwind v4 Vite 插件，避免额外 PostCSS 配置；shadcn-vue 采用本地组件落地，降低 MV3 扩展对第三方运行时组件封装的耦合。
- 风险与回滚：若后续 WXT/tailwind 兼容性变化，可回退到 tailwind v3 + PostCSS；业务组件只依赖 token 与本地基础组件，回滚边界清晰。
- 相关文件：`wxt.config.ts`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tailwind.config.ts`、`components.json`、`shared/ui/components/`。
- 建议沉淀路径：`knowledges/adr/00x-ui-design-system-token-layer.md`。

### feature - UI 设计系统与配置界面迁移

- Issue ID：#56。
- 功能名：UI design system and settings panel migration。
- 目标：迁移 content trigger、iframe panel、popup、options、SourceConfigPanel 到 token 驱动的设计系统，同时保持现有行为、尺寸和 e2e 定位方式。
- 交互与状态：content 翻译浮层继续保持 loading、streaming、done、error；provider 配置继续保持新增、测试、激活、删除、折叠与焦点管理。
- 权限约束：不新增浏览器权限，不在 content-script 中直连第三方 LLM，不记录真实 API Key。
- 相关文件：`assets/content.css`、`entrypoints/content.ts`、`entrypoints/popup/App.vue`、`entrypoints/options/App.vue`、`shared/ui/SourceConfigPanel.vue`、`shared/ui/__tests__/design-system.test.ts`。
- 建议沉淀路径：`knowledges/feature/ui/design-system.md`。

### runbook - pnpm 与 Playwright e2e 环境处理

- Issue ID：#56。
- 场景：在 Windows + pnpm v11 + WXT 项目中恢复依赖和运行 e2e 时，可能遇到无 TTY 清理提示、build script 拦截、Playwright Chromium 缺失或 stale `__dirlock`。
- 操作步骤：
  1. 使用 `CI=true pnpm install --frozen-lockfile` 恢复依赖，避免无 TTY prompt。
  2. 在 `pnpm-workspace.yaml` 中维护 `onlyBuiltDependencies` 与 `allowBuilds.vue-demi: true`。
  3. 如果 `pnpm e2e` 提示 Chromium 缺失，运行 `pnpm exec playwright install chromium` 或 `pnpm e2e:install`。
  4. 如果 Playwright 安装超时留下 `C:\Users\aiden\AppData\Local\ms-playwright\__dirlock`，确认无安装进程后删除 stale lock 再重跑安装。
- 相关文件：`pnpm-workspace.yaml`、`package.json`、`e2e/translate.spec.ts`。
- 建议沉淀路径：`knowledges/runbook/testing/playwright-e2e-setup.md`。
