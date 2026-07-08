# 设计系统 — LLM Translator

> v0.3 #56 起，项目 UI 基座迁移到 tailwindcss + shadcn-vue，本文件记录可被 #57 visual-theme 继续替换的 design token 体系。#56 阶段只迁移表达方式，token 值沿用 v0.2 冷色调，避免行为和视觉语义一起变化。

## 技术基座

- UI 技术栈：WXT + Vue 3 + TypeScript + tailwindcss + shadcn-vue 风格本地组件。
- Tailwind 入口：`shared/styles/app.css`，由 popup/options main 入口导入。
- Token 定义：`shared/styles/tokens.css`。
- Tailwind 配置：`tailwind.config.ts`。
- shadcn-vue 配置：`components.json`。
- 本地基础组件目录：`shared/ui/components/`。
- content 浮层样式：`assets/content.css`，继续通过 `content.css?inline` 注入 `about:blank` iframe。

## Token 命名

### App / shadcn 语义 token

| Token | 用途 | #56 初始语义 |
|---|---|---|
| `--background` | popup/options 页面背景 | 浅背景 |
| `--foreground` | 正文主文字 | 深色文字 |
| `--card` / `--card-foreground` | 卡片容器与卡片文字 | 白色卡片 / 深色文字 |
| `--primary` / `--primary-foreground` | 主操作、popup header、启用态 | 深色主按钮 / 浅色文字 |
| `--secondary` / `--secondary-foreground` | 次级按钮与弱背景 | 浅灰背景 / 深色文字 |
| `--muted` / `--muted-foreground` | 辅助区域与说明文字 | 弱背景 / 次级文字 |
| `--accent` / `--accent-foreground` | hover 和轻量强调 | 弱背景 / 深色文字 |
| `--border` | 卡片与分隔线 | 浅边框 |
| `--input` | 输入框边框 | 中性边框 |
| `--ring` | focus ring | 主色 |
| `--destructive` / `--destructive-foreground` | 错误状态 | 错误色 / 浅色文字 |
| `--success` / `--success-foreground` | 成功状态 | 成功色 / 浅色文字 |
| `--radius` | 卡片、按钮、输入框圆角基准 | 8px |

### Content 扩展 token

| Token | 用途 |
|---|---|
| `--translator-panel-background` | iframe 翻译浮层背景 |
| `--translator-panel-foreground` | 浮层主文字 |
| `--translator-panel-muted` | 浮层次级错误引导、引用文字 |
| `--translator-panel-code` | Markdown code/pre 背景 |
| `--translator-panel-quote` | Markdown blockquote 边线 |
| `--translator-panel-link` | Markdown 链接 |
| `--translator-trigger-background` | 划词触发按钮背景 |
| `--translator-trigger-foreground` | 触发按钮文字 |
| `--translator-trigger-hover` | 触发按钮 hover 背景 |
| `--translator-shadow` | 浮层 iframe 阴影 |
| `--translator-trigger-shadow` | 触发按钮阴影 |
| `--translator-radius` | content 浮层圆角 |

## 色彩策略

- #56 阶段使用 HSL token，语义沿用旧冷色调，避免 UI 重构和主题改色耦合。
- #57 visual-theme 只应替换 `shared/styles/tokens.css` 与 `assets/content.css` 的 token 值，不应逐组件搜索改色。
- 成功/失败状态必须同时有文字或符号，例如 `✅` / `❌` + 文案；颜色只作为辅助。

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

- `Button`：主按钮、次级、outline、dashed、ghost、link、destructive、success。
- `Card`：provider 卡片、当前生效源横幅。
- `Input`：名称、baseUrl、模型名、API Key、region、目标语言。
- `Select`：provider 类型下拉，保留原生 select 语义以兼容 e2e。
- `Label`：输入说明。
- `Badge`：连通性测试结果、成功/失败 inline 状态。
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
- 错误/成功不只依赖颜色。
- 浮层继续以鼠标划词为主，本轮不新增键盘触发；语义通告不退化。
- `prefers-reduced-motion: reduce` 下禁用非必要动画和 transition。
