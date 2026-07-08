# 设计系统 — LLM Translator

> v0.3 #57 起，项目使用最终 sunlit teal 明亮主题。UI 基座来自 #56: tailwindcss + shadcn-vue 风格本地组件 + CSS 变量 token。

## 技术基座

- UI 技术栈：WXT + Vue 3 + TypeScript + tailwindcss + shadcn-vue 风格本地组件。
- Tailwind 入口：`shared/styles/app.css`，由 popup/options main 入口导入。
- App token 定义：`shared/styles/tokens.css`。
- Content token 定义：`assets/content.css`，继续通过 `content.css?inline` 注入 `about:blank` iframe。
- Tailwind 配置：`tailwind.config.ts`。
- shadcn-vue 配置：`components.json`。
- 本地基础组件目录：`shared/ui/components/`。

## Token 命名

### App / shadcn 语义 token

| Token | HSL | 用途 |
|---|---|---|
| `--background` | `36 100% 98%` | popup/options 温暖页面背景 |
| `--foreground` | `224 38% 16%` | 正文主文字 |
| `--card` / `--card-foreground` | `0 0% 100%` / `224 38% 16%` | 卡片容器与卡片文字 |
| `--popover` / `--popover-foreground` | `0 0% 100%` / `224 38% 16%` | 弹出层预留 token |
| `--primary` / `--primary-foreground` | `174 84% 27%` / `0 0% 100%` | 主操作、popup header、启用态 |
| `--secondary` / `--secondary-foreground` | `47 96% 90%` / `224 38% 16%` | 次级按钮与弱强调背景 |
| `--muted` / `--muted-foreground` | `37 43% 94%` / `225 16% 39%` | 辅助区域与说明文字 |
| `--accent` / `--accent-foreground` | `18 100% 94%` / `224 38% 16%` | hover 和轻量强调 |
| `--destructive` / `--destructive-foreground` | `356 74% 46%` / `0 0% 100%` | 错误状态 |
| `--success` / `--success-foreground` | `155 64% 30%` / `0 0% 100%` | 成功状态 |
| `--warning` / `--warning-foreground` | `38 92% 44%` / `224 38% 16%` | 警告状态 |
| `--info` / `--info-foreground` | `203 77% 37%` / `0 0% 100%` | 信息状态 |
| `--border` | `34 45% 84%` | 卡片与分隔线 |
| `--input` | `34 38% 76%` | 输入框边框 |
| `--ring` | `174 84% 33%` | focus-visible ring |
| `--radius` | `8px` | 卡片、按钮、输入框圆角基准 |

### Content 扩展 token

| Token | HSL / Value | 用途 |
|---|---|---|
| `--translator-panel-background` | `195 62% 16%` | iframe 翻译浮层背景 |
| `--translator-panel-foreground` | `40 100% 97%` | 浮层主文字 |
| `--translator-panel-muted` | `39 30% 82%` | 浮层次级错误引导、引用文字 |
| `--translator-panel-code` | `194 42% 24%` | Markdown code/pre 背景 |
| `--translator-panel-quote` | `174 48% 48%` | Markdown blockquote 边线 |
| `--translator-panel-link` | `42 100% 72%` | Markdown 链接 |
| `--translator-trigger-background` | `174 84% 27%` | 划词触发按钮背景 |
| `--translator-trigger-foreground` | `0 0% 100%` | 触发按钮文字 |
| `--translator-trigger-hover` | `174 88% 22%` | 触发按钮 hover 背景 |
| `--translator-shadow` | `0 18px 44px hsl(196 72% 12% / 0.28)` | 浮层 iframe 阴影 |
| `--translator-trigger-shadow` | `0 8px 20px hsl(174 84% 20% / 0.32)` | 触发按钮阴影 |
| `--translator-radius` | `8px` | content 浮层圆角 |

## 色彩策略

v0.3 采用“sunlit teal”主题：深青绿色作为主操作色，暖白背景承载内容，珊瑚浅色用于 hover/轻强调，成功/错误/警告/信息均有独立语义色。该主题比 #56 冷色迁移基座更明亮鲜艳，但 content 浮层仍使用深色不透明背景，避免覆盖网页正文时影响译文阅读。

#57 visual-theme 应优先替换 `shared/styles/tokens.css` 与 `assets/content.css` token 值；组件内不得重新散落硬编码色值。若新增状态表现，优先扩展 Tailwind 语义 token 或基础组件 variant。

## 状态映射

| 状态 | 推荐 token | 说明 |
|---|---|---|
| idle | `background` / `card` / `foreground` | 默认内容承载 |
| hover | `accent`、`primary/90` | 轻量反馈，不改变布局 |
| active | `primary`、`ring` | 主操作和聚焦状态 |
| disabled | opacity + `muted-foreground` | 不只依赖颜色 |
| error | `destructive` + 文案 / `❌` | 错误状态 |
| success | `success` + 文案 / `✅` | 成功状态 |
| warning | `warning` + 文案 / `⚠` | 警告状态 |
| info | `info` + 文案 | 信息状态 |

## WCAG AA 对比度验证

| 组合 | 对比度 | 结论 |
|---|---:|---|
| `foreground` / `background` | 15.35:1 | 正文满足 AA |
| `muted-foreground` / `background` | 6.53:1 | 辅助文字满足 AA |
| `primary-foreground` / `primary` | 4.89:1 | 主按钮文字满足 AA |
| `success-foreground` / `success` | 5.10:1 | 成功状态文字满足 AA |
| `destructive-foreground` / `destructive` | 5.55:1 | 错误状态文字满足 AA |
| `info-foreground` / `info` | 5.43:1 | 信息状态文字满足 AA |
| `warning-foreground` / `warning` | 5.76:1 | 警告状态文字满足 AA |
| `translator-panel-foreground` / `translator-panel-background` | 12.54:1 | 浮层正文满足 AA |
| `translator-panel-muted` / `translator-panel-background` | 8.97:1 | 浮层辅助文字满足 AA |
| `translator-trigger-foreground` / `translator-trigger-background` | 4.89:1 | 触发按钮文字满足 AA |

## 字体

- 系统字体栈：`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`。
- 正文默认 14px / line-height 1.5。
- 紧凑面板内辅助文字使用 12px 或 Tailwind `text-xs`。
- 标题按容器密度使用 `text-base`、`text-[22px]` 等固定尺寸，不随 viewport 缩放。

## 间距

- 基准间距为 4px，对应 Tailwind spacing scale。
- popup/options 常用 8px / 12px / 24px。
- 浮层内边距保持 10px 12px。
- provider 卡片内部使用 8px-12px 紧凑间距，避免 popup 400x600 内信息密度下降。

## 圆角

- Token 基准：`--radius: 8px`。
- 卡片 / 浮层：8px。
- 输入框 / 按钮：4px-6px，跟随 shadcn-vue 组件的 `rounded-md`。
- 触发按钮：圆形 24x24。

## 组件

### shadcn-vue 基础组件

当前本地组件目录：

- `Button`：主按钮、次级、outline、dashed、ghost、link、destructive、success、warning、info。
- `Card`：provider 卡片、当前生效源横幅。
- `Input`：名称、baseUrl、模型名、API Key、region、目标语言。
- `Select`：provider 类型下拉，保留原生 select 语义以兼容 e2e。
- `Label`：输入说明。
- `Badge`：连通性测试结果、成功/失败/警告/信息 inline 状态。
- `ScrollArea`：popup 主体滚动容器。

### 翻译浮层（content）

- 绝对定位，z-index 2147483647。
- `about:blank` iframe 隔离，宿主 CSS 不影响浮层语义标签与 Markdown 渲染。
- 最大宽度 360px，自动换行。
- `role="status"` + `aria-live="polite"`。

### 触发按钮（content）

- 圆形 24x24px，显示「译」字。
- `aria-label="翻译选中文本"`。
- 背景、hover、文字、阴影使用 `--translator-trigger-*` token。

### 提供方卡片（popup/options）

- 基于 `Card` 组件。
- 启用态使用 `ring-primary`，不改变数据结构。
- popup 变体保留折叠非活跃卡片；options 变体默认展开。

## 响应式与尺寸约束

- popup 固定 400x600。
- options 最大 720px 居中。
- 浮层最大宽 360px，不依赖宿主页面 CSS。
- 关键控件尺寸稳定，hover/focus/loading 状态不得引发布局跳动。

## 可访问性

- popup/options 所有可操作控件可通过 Tab 聚焦。
- focus ring 使用 `--ring`，必须可见。
- 错误/成功/警告/信息不只依赖颜色，应保留文字或符号。
- 浮层继续以鼠标划词为主，本轮不新增键盘触发；语义通告不退化。
- `prefers-reduced-motion: reduce` 下禁用非必要动画和 transition。
