# 技术设计文档

## 任务信息

| 项 | 说明 |
|----|------|
| 版本号 | `v0.3` |
| ISSUE_ID | `#56` |
| PRD Issue | `#49` |
| 基础分支 | `master` |
| 设计状态 | `无人值守自动批准` |

## 一、需求背景

#56 需要把 LLM Translator 的 UI 表现层迁移到 tailwindcss + shadcn-vue 设计系统。当前 popup/options/content 样式由 scoped CSS 和 `assets/content.css` 硬编码维护，后续 #57 无法只改 token 完成主题替换。本任务必须建立 token 基座，同时保持划词翻译、配置面板和消息契约零退化。

## 二、技术选型

| 方案 | 内容 | 取舍 |
|------|------|------|
| 方案 A：tailwind v4 + `@tailwindcss/vite` + shadcn-vue 按需组件 | 在 WXT Vite 配置注册 tailwind 插件，使用 CSS 变量 token 和本地 shadcn-vue 风格组件 | 推荐。符合 PRD，改动集中，可被 #57 直接替换 token |
| 方案 B：tailwind v3 + PostCSS + shadcn-vue | 使用传统 PostCSS 集成，避免 v4 插件不兼容 | 作为回退。配置更多，但兼容性稳定 |
| 方案 C：只用 CSS 变量 + 自研组件 | 不引入 tailwind/shadcn-vue，只抽 token | 不采用。不能满足 #56 明确要求，后续组件体系仍不统一 |

最终选择方案 A。若 `pnpm build` 证明 tailwind v4 与 WXT 0.19 不兼容，则回退方案 B；回退只影响构建配置和依赖，不影响业务 UI 迁移路径。

## 三、整体设计

整体分为四层：

1. **Token 层**：新增全局 token CSS，定义 shadcn 语义变量（background、foreground、primary、border、muted、destructive、success、ring 等）和扩展变量（content panel、trigger、shadow）。
2. **Tailwind 集成层**：新增 tailwind 配置，扫描 entrypoints、shared、components 和 content 样式相关文件，WXT/Vite 注入 tailwind 插件。
3. **UI 组件层**：新增本地 shadcn-vue 基础组件，至少覆盖 Button、Card、Input、Label、Select、Badge、ScrollArea。组件使用 `cn()` 合并 class，基于 token 和 tailwind 工具类表达状态。
4. **业务界面层**：迁移 popup/options/SourceConfigPanel 的模板 class；迁移 content 触发按钮与 iframe panel CSS 到 token 变量；保留所有业务函数和消息通信。

主要原则：业务逻辑不搬家，先用组件和 class 替换样式表达；大文件 `SourceConfigPanel.vue` 只做必要模板与样式迁移，不拆分业务逻辑，避免扩大风险。

## 四、UX 与视觉实现

### 设计系统与设计 token

引用来源：

- `releases/v0.3/1-ui-rewrite/PRD.md` 的 `## UX 设计`
- `knowledges/ux/design-system.md`
- `knowledges/ux/interaction-patterns.md`
- `knowledges/ux/accessibility.md`
- 原型索引 `knowledges/ux/prototypes/index.md`

关键 token：

- `--background` / `--foreground`：页面背景与正文。
- `--card` / `--card-foreground`：配置卡片。
- `--primary` / `--primary-foreground`：主按钮、popup header、content trigger。
- `--muted` / `--muted-foreground`：辅助文案、次级背景。
- `--border` / `--input` / `--ring`：边框、输入框和 focus ring。
- `--destructive` / `--success`：错误和成功状态。
- `--translator-panel-*`、`--translator-trigger-*`：content iframe 与宿主 DOM 共享的扩展 token。

首版值沿用当前冷色调，保证 #56 是纯迁移；#57 可在 token 层替换主题色板。

### 视觉还原要点

- popup 仍是 400x600 的紧凑工具面板，header 深色、主体滚动、footer 固定。
- options 仍最大 720px 居中，配置面板与 popup 复用同一 `SourceConfigPanel`。
- provider 卡片用 Card 表达层级，启用/兜底/测试状态用 Badge 和 Button variants 表达。
- content trigger 保持 24x24 圆形「译」字，hover 色来自 token。
- iframe panel 保持暗底、8px 圆角、最大 360px、深色 code/pre/blockquote/md link 样式。

### 交互实现

- `loading`、`streaming`、`done`、`error` 状态机不变。
- 连通性测试按钮在测试中禁用或以视觉 loading 表达，结果仍 inline 展示。
- popup 打开后仍调用 `focusFirst()` 聚焦首个可交互项。
- `prefers-reduced-motion: reduce` 继续禁用非必要 transition/光标闪烁。

### 响应式与可访问性

- popup/options 所有 Button、Input、Select 均保留 keyboard focus ring。
- content panel 保留 `aria-live="polite"`，必要时补充 `role="status"`；trigger 保留或补齐 `aria-label="翻译选中文本"`。
- 成功/失败保留 ✅/❌ + 文本，颜色只是辅助。
- text 不随 viewport 缩放；容器使用固定尺寸和 max-width 约束避免布局抖动。

### 原型参照

视觉原型路径：

- `knowledges/ux/prototypes/v0.2-source-picker.html`
- `knowledges/ux/prototypes/v0.2-popup-settings.html`
- `knowledges/ux/prototypes/v0.2-md-render.html`
- `knowledges/ux/prototypes/v0.2-llm-type-unify.html`

本任务不新增高保真原型。

## 五、数据结构设计

无数据结构变更。`ProviderConfig`、`Message`、`StreamPortMessage`、`TranslateResult`、storage settings 均保持现状。

## 六、接口设计

无接口变更。`get-active-sources`、`set-active-source`、`test-provider`、`translate-stream` Port 通信保持现状。

## 七、主要变更点

- 新增 tailwind/shadcn 依赖与配置。
- 新增 token 样式入口与 UI 组件目录。
- 修改 popup/options 入口样式为 tailwind + shadcn-vue。
- 修改 `SourceConfigPanel.vue` 模板和样式表达，业务函数不改。
- 修改 `assets/content.css` 使用 token 变量并保留 iframe 注入。
- 必要时修改 `entrypoints/content.ts` 补充 role/aria class 或 token 注入顺序。
- 更新 `knowledges/ux/design-system.md`。
- 补充测试以覆盖 token 变量、content CSS 和关键配置面板行为。

## 八、兼容性考虑

- 保留 `content.css?inline`，iframe 不依赖宿主全局样式。
- 如果 tailwind 编译产物无法直接进入 content iframe，content CSS 使用同一 token 变量手写类，避免在 iframe 内运行 tailwind runtime。
- 组件库按需本地化，避免 MV3 扩展中引入无用动态逻辑。
- 不更新 `releases/v0.3/index.md`，避免与主工作区已有未提交流程改动冲突。

## 九、风险评估

| 风险 | 影响程度 | 概率 | 应对措施 |
|------|----------|------|----------|
| WXT 与 tailwind v4 Vite 插件不兼容 | 高 | 中 | 回退 tailwind v3 + PostCSS，保留 token 和组件迁移 |
| `SourceConfigPanel.vue` 大文件迁移引入行为退化 | 高 | 中 | 不拆业务逻辑，先替换模板 class 和基础控件，跑 e2e 回归 |
| content iframe 样式缺失 token | 中 | 中 | 在 `assets/content.css` 内声明 fallback token，并继续字符串注入 |
| shadcn-vue 组件依赖增加包体 | 中 | 低 | 只引入 Button/Card/Input/Label/Select/Badge/ScrollArea 等必需组件 |
| 硬编码色值遗漏 | 中 | 中 | 用 lint/rg 检查目标文件中的 `#[0-9a-fA-F]{3,8}`，允许极少数注释/文档旧值 |

## 自动批准记录

无人值守下自动批准方案 A，依据是 #56/PRD #49 已明确技术栈、范围和验收标准；该方案改动集中、可通过 build/typecheck/lint/e2e 验证，且可通过回退依赖配置与 UI 文件恢复原状。
