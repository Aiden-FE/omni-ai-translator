# DESIGN - Issue #57 视觉主题改造

## 背景与目标

#57 的目标是在 #56 的 tailwindcss/shadcn/token 基座上完成最终 v0.3 视觉主题。当前代码已把 popup、options、`SourceConfigPanel`、基础组件和 content 样式迁移到语义 token，但 token 值仍是冷色迁移基座。设计目标是集中替换 token，并补足 warning/info 语义色，使全应用有统一、明亮、可访问的视觉主题。

## 方案比较

### 方案 A: 只改 `shared/styles/tokens.css` 和 `assets/content.css`

优点是改动最小、回滚简单。缺点是 Tailwind 目前没有 warning/info token，文档要求的语义色覆盖不完整，后续组件无法语义化引用 warning/info。

### 方案 B: 集中替换 token，并扩展 warning/info 语义映射

优点是仍以 token 为核心，覆盖 PRD 要求的完整语义色；只需小范围更新 `tailwind.config.ts`、基础组件 variant 和文档。缺点是比方案 A 多改少量组件类型定义，需要 typecheck 验证。

### 方案 C: 逐组件重新设计样式

优点是可精细控制每个表面。缺点是违背 #56 语义 token 基座，容易引入硬编码和视觉不一致，风险高且回滚成本大。

最终选择: 方案 B。它满足最小改动、可测试、可回滚，并完整覆盖 #57 的 token 与语义色验收。

## 技术设计

### Token 层

修改 `shared/styles/tokens.css`:

- 页面主题: `background`、`foreground`、`card`、`popover`、`primary`、`secondary`、`muted`、`accent`、`border`、`input`、`ring`。
- 语义色: `destructive`、`success`、新增 `warning`、新增 `info`，均带 foreground。
- content token: 同步 `--translator-panel-*`、`--translator-trigger-*`、阴影和 radius。

修改 `assets/content.css`:

- 保持 iframe 隔离和现有 class，不改 DOM/行为。
- 更新 content token 值、触发按钮 hover/focus、浮层阴影。
- 添加 `prefers-reduced-motion` 现有约束不退化。

修改 `tailwind.config.ts`:

- 新增 `warning`、`info` color namespace。
- 保持现有 token 引用形式 `hsl(var(--token))`。

### 组件层

基础组件仍复用 #56 的 shadcn-vue 风格。必要时扩展:

- `Button.vue`: 新增 `warning` / `info` variant，便于后续语义按钮使用。
- `Badge.vue`: 新增 `warning` / `info` variant，便于状态映射完整。

`SourceConfigPanel`、popup、options 当前主要使用 `primary`、`success`、`destructive`、`muted`、`accent` 等 token class，预期不需要逐组件改色。若 grep 发现硬编码冷色或旧语义色，则就地 token 化。

## UX 与视觉实现

主题方向: sunlit teal，明亮但不刺眼。

拟定 HSL token:

| Token | HSL | 用途 |
|---|---|---|
| `--background` | `36 100% 98%` | 温暖页面背景 |
| `--foreground` | `224 38% 16%` | 主文字 |
| `--card` | `0 0% 100%` | 卡片 |
| `--primary` | `174 84% 27%` | 主按钮、popup header、触发按钮 |
| `--secondary` | `47 96% 90%` | 次级背景 |
| `--muted` | `37 43% 94%` | 弱背景 |
| `--accent` | `18 100% 94%` | hover / 轻强调 |
| `--success` | `155 64% 30%` | 成功 |
| `--destructive` | `356 74% 46%` | 错误 |
| `--warning` | `38 92% 44%` | 警告 |
| `--info` | `203 77% 37%` | 信息 |
| `--border` | `34 45% 84%` | 边框 |
| `--input` | `34 38% 76%` | 输入框边框 |
| `--ring` | `174 84% 33%` | focus-visible |

content 浮层使用更深的青蓝背景 `195 62% 16%` 和暖白文字 `40 100% 97%`，保证叠在网页上时译文稳定可读；触发按钮复用主色，hover 使用更深青绿。错误、成功继续用文字和符号辅助，不只依赖颜色。

视觉原型路径: 当前无 v0.3 visual-theme 原型；参照 `knowledges/ux/prototypes/index.md` 中 v0.2 popup/settings/source-picker 原型的布局和交互，不改变结构。

## 数据结构与接口

无数据结构变更。无 `shared/types.ts` 变更。无 storage/message/translator API 变更。第三方请求和 API Key 处理不变。

## 验证设计

- 对比度: 用 HSL 转 RGB 后计算 WCAG contrast ratio，记录到 `knowledges/ux/design-system.md` 和 `knowledges/ux/accessibility.md`。
- 冷色残留: 使用 `rg` 检查旧 hex 与旧 HSL 片段，确认没有不合理残留。
- 构建验证: `pnpm typecheck`、`pnpm lint`、`pnpm build`。
- 回归验证: `pnpm e2e` 如环境可用；若 e2e 受浏览器安装限制失败，记录失败原因并用 build/typecheck/lint 加人工场景审查兜底。

## 风险与回滚

- 风险: 新色彩在真实网页叠层场景中可能过亮。缓解: content 浮层使用深色不透明背景，彩色主要用于 trigger、focus、链接和状态。
- 风险: 扩展 warning/info variant 引入类型错误。缓解: `pnpm typecheck` 验证。
- 风险: 旧冷色仍藏在文档或构建产物中。缓解: grep 仅针对源码/知识库有效路径，排除 `node_modules`、`.output` 等生成物。
- 回滚: 还原 `shared/styles/tokens.css`、`assets/content.css`、`tailwind.config.ts`、基础组件 variant 与 UX 文档改动即可恢复 #56 基座。

## 自动批准记录

无人值守采用方案 B。依据是 Issue #57 与 PRD 明确要求完整语义 token、全界面 token 应用、WCAG AA 和冷色残留检查；#56 已提供 token 基座，集中扩展 token 是最小可回滚实现。
