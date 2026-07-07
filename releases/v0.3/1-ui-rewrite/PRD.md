# PRD:UI 设计系统重构（1-ui-rewrite）
> 版本:v0.3 第 1 项 · 优先级 P0 · 关联 Issue #49 · 创建日期 2026-07-07 · 状态 draft

## 1. 摘要

本项引入 tailwindcss + shadcn/ui（shadcn-vue）建立统一的组件设计系统，将翻译浮层、划词触发按钮、options 配置页、popup 四类组件全部迁移到新系统渲染。这是纯重构——不增删任何功能、保持现有行为不变——目的是消除散落各组件的硬编码色值，为第 2 项 visual-theme 主题色板改造提供集中管理的设计 token 基座，使 v0.3 商店首发的视觉焕新有地基可站。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求与验收 |
| 前端 | 待分配 | tailwindcss/shadcn-vue 引入、四类组件迁移、token 体系搭建 |
| 设计 | 待分配 | shadcn-vue 组件选型与 token 命名（衔接第 2 项 visual-theme） |

## 3. 背景

v0.3 是增长优先阶段的关键一轮，战略明确「产品美观是增长抓手」「v0.3 上线前全面美化」。商店首发要在一众中小翻译插件里靠视觉吸引力突围，而当前 UI 还停留在 v0.1/v0.2 时期的灰白黑冷色调——浮层背景 `#1F2937`、按钮 `#1F2937`、边框 `#E5E7EB`/`#D1D5DB`（见 `knowledges/ux/design-system.md`）。

更根本的问题是**没有设计系统**：样式散落在各组件的 scoped `<style>` 块和 `assets/content.css` 中，色值、间距、圆角全是硬编码。以 `entrypoints/popup/App.vue` 为例，`#1f2937`、`#f9fafb`、`#e5e7eb`、`#d1d5db`、`#6b7280` 等色值直接写在选择器里；`assets/content.css` 同样硬编码了 `#1f2937`、`#374151`、`#93c5fd` 等十余处色值；`shared/ui/SourceConfigPanel.vue`（21KB，popup 与 options 共用）承载了大量内联样式。改一个颜色要逐文件搜索替换，无法统一管理。

变化点：

1. **引入工具链**：项目当前无 tailwindcss（`package.json` 仅 `vue` + `dompurify` 依赖），需新增 tailwindcss（Vite 插件）+ shadcn-vue 组件库，与 WXT 构建管线打通。
2. **设计 token 集中化**：色彩、间距、圆角、字体从硬编码迁移到 tailwind 配置的 CSS 变量（token），为第 2 项 visual-theme 替换色板预留接缝——届时只需改 token 定义，全应用联动。
3. **content script 特殊性**：翻译浮层渲染在 `about:blank` iframe 内（样式隔离，防宿主页面 CSS 穿透），`content.css` 以字符串注入 iframe 文档（`?inline` 导入）；触发按钮在宿主 DOM。两者都需适配 tailwind 体系，但 iframe 注入方式不能简单依赖宿主全局 CSS。

v0.2 已稳定的契约（provider 契约、storage 契约、消息层、流式 Port 通信）全部不变，本次只动 UI 表现层。

## 4. 目标

**目标**：将全应用四类组件（翻译浮层、划词触发按钮、options 配置页、popup）迁移到 tailwindcss + shadcn/ui 新设计系统，消除散乱硬编码，建立集中管理的设计 token 体系，保持现有功能行为完全不变。

**为什么重要**：没有统一设计系统，第 2 项 visual-theme 的色板改造无从落地——硬编码散落各处，改色意味着逐文件搜索替换，极易遗漏且无法验证完整性。本项是 visual-theme 的前置地基，也是商店首发视觉焕新的第一步。战略对齐：strategy「产品美观是增长抓手」、roadmap v0.3「引入 shadcn/ui + tailwindcss 重构 UI」。

**关键结果（SMART OKR）**：

- O：全应用统一到 tailwindcss + shadcn/ui 新设计系统
  - KR1：浮层、触发按钮、options 配置页、popup 4 类组件 100% 基于 tailwind + shadcn/ui 渲染（无遗留 scoped 硬编码样式块）
  - KR2：划词翻译 e2e 回归全绿，功能行为零退化（翻译流程、流式渲染、错误反馈、Markdown 渲染与 v0.2 一致）
  - KR3：组件样式无散乱硬编码色值，全部由 tailwind 配置的 design token（CSS 变量）驱动；`assets/content.css` 色值迁移到 token 或由 tailwind 工具类替代
  - KR4：design token 体系就绪并落档（色彩/间距/圆角/字体命名规范），第 2 项 visual-theme 可直接在此基础上替换色板

## 5. 细分市场

按待完成任务定义用户：

- **网页阅读用户（划词翻译）**：在任意网页选中文本 → 看到触发按钮 → 点击 → 浮层显示译文。任务约束：浮层和触发按钮渲染在宿主页面（content script），必须与宿主页面样式隔离；浮层在 iframe 内，触发按钮在宿主 DOM；不同网站背景色差异大，新设计系统需保证浮层/按钮在任何页面上视觉一致、不被宿主样式污染。
- **配置翻译源用户（popup/options）**：点击工具栏 icon → popup 弹出配置面板 → 添加/编辑/切换翻译源、连通性测试、设目标语言；或进 options 全功能页。任务约束：popup 固定 400×600 尺寸（MV3 限制），需在窄空间内保持可读；options 最大宽 720px 居中。

两类用户在本次重构中**不感知功能变化**——交互流程、操作路径、反馈行为与 v0.2 完全一致，唯一变化是视觉表现层换了一套统一的设计系统。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| 划词看译文 | 浮层/触发按钮样式硬编码在 content.css，各网站表现可能不一致 | 基于 tailwind 工具类 + token 驱动，视觉统一且可维护 |
| 配置翻译源（popup） | popup 样式散落在 App.vue scoped 块，色值硬编码 | shadcn-vue 组件（Button/Card/Input/Select 等），token 驱动、一致性好 |
| 配置翻译源（options） | options 页样式简陋，与 popup 各自维护 | 复用 SourceConfigPanel + shadcn-vue 组件，一套设计系统两处通用 |
| 后续主题切换（第 2 项） | 硬编码散落，改色需逐文件替换 | token 集中管理，改 token 全应用联动 |

比竞品更优：多数中小翻译插件 UI 粗糙、样式零散维护。本项目通过引入业界成熟的 shadcn/ui 设计系统，以工程化方式保证视觉一致性与可维护性，为商店首发的视觉吸引力提供系统级保障——这不是一次性美化，而是可持续演进的设计系统基座。

## 7. 解决方案

### 7.1 UX / 原型（高层流程）

用户流程不变，仅视觉表现层切换到新设计系统：

- **划词链路**：选中网页文本 → 宿主 DOM 出现触发按钮（tailwind 工具类 + token 驱动样式）→ 点击 → iframe 内浮层出现，显示"翻译中…" → 流式渐进渲染译文 + 光标 → done 阶段 Markdown 渲染 → 错误态显示 ❌ + 引导文案。浮层/按钮视觉风格由新设计系统统一，但交互逻辑（选区检测、位置计算、iframe 隔离、Port 流式通信）完全不变。
- **配置链路**：点击工具栏 icon → popup 弹出（shadcn-vue 组件渲染标题栏、源配置面板、底部操作栏）→ 源卡片增删改/切换/连通性测试/目标语言 → 底部「打开全部设置」跳 options。options 页同样基于 shadcn-vue 组件渲染。

详细交互、视觉规格、可访问性由 prodflow-ux-evaluate 补全（见「## UX 设计」章节）。

### 7.2 核心功能

1. **tailwindcss 引入与 WXT 打通**：安装 tailwindcss + `@tailwindcss/vite` 插件，在 WXT 的 Vite 配置中注册；创建 `tailwind.config.ts` 定义 design token（色彩、间距、圆角、字体映射为 CSS 变量）；入口 CSS 引入 `@tailwind` 指令。popup/options 的 Vue SFC 可直接使用 tailwind 工具类。
2. **shadcn-vue 组件库引入**：安装 shadcn-vue（Vue 3 移植版），初始化组件目录（`components/ui/`），按需引入项目所需组件（Button、Card、Input、Select、Label、Badge、ScrollArea 等）。shadcn-vue 组件源码直接复制到项目内（非 npm 黑盒），可自由定制。
3. **翻译浮层重构（content script · iframe）**：浮层渲染在 `about:blank` iframe 文档内，当前 `content.css` 以 `?inline` 字符串注入。重构方案：将浮层样式从硬编码 CSS 迁移到 tailwind 工具类或 token 引用——iframe 文档内无法直接使用宿主 tailwind 全局 CSS，需将 tailwind 编译产物（或 token CSS 变量定义）注入 iframe 文档 `<head>`。触发按钮（宿主 DOM）使用带项目前缀的 tailwind 工具类或内联 token 引用，保持与宿主页面样式隔离（现有 `.llm-translator-trigger` 前缀策略保留，改用 token 驱动色值）。
4. **options 配置页重构**：`entrypoints/options/App.vue` 的 scoped 样式替换为 tailwind 工具类；`shared/ui/SourceConfigPanel.vue` 内部样式迁移到 shadcn-vue 组件 + tailwind 工具类（源卡片用 Card、输入用 Input、源类型下拉用 Select、按钮用 Button、连通性测试结果用 Badge）。
5. **popup 重构**：`entrypoints/popup/App.vue` 的 scoped 样式块（标题栏、主体、底部操作栏）替换为 tailwind 工具类 + shadcn-vue 组件；`SourceConfigPanel` 共享组件迁移后 popup 自动受益。popup 固定 400×600 尺寸约束不变。
6. **design token 体系搭建**：在 `tailwind.config.ts` 中定义语义化 token（如 `background`、`foreground`、`primary`、`muted`、`border`、`destructive` 等，参照 shadcn 惯例），映射到 CSS 变量。v0.3 第 1 阶段 token 值暂沿用当前冷色调（保持视觉不变），第 2 项 visual-theme 只需替换 token 值即可全应用换色。token 命名规范落档到 `knowledges/ux/design-system.md`。

### 7.3 技术

- **入口**：
  - `entrypoints/popup/*`（WXT popup entrypoint，Vue 3 SFC）
  - `entrypoints/options/*`（WXT options entrypoint，Vue 3 SFC）
  - `entrypoints/content.ts`（content script：触发按钮 + 浮层 iframe）
  - `shared/ui/SourceConfigPanel.vue`（popup/options 共享源配置面板）
  - `assets/content.css`（浮层/触发按钮样式，注入 iframe 文档）
- **复用**：v0.2 已抽取的 `SourceConfigPanel.vue` 共享组件结构保留，内部样式迁移到新系统；provider/storage/message 契约（`shared/types.ts`、`shared/storage.ts`、`shared/translator/*`）完全不动；content script 的 iframe 隔离策略、流式渲染逻辑、Markdown 渲染管线不动。
- **类型**：`shared/types.ts`（ProviderConfig/ProviderType/Message/StreamPortMessage/TranslateResult 等）不变；shadcn-vue 组件自带 TS 类型。
- **存储**：`chrome.storage.local` 读写契约不变；tailwind/shadcn 引入不涉及存储层。
- **兼容**：
  - WXT 0.19 + Vite：tailwindcss 通过 `@tailwindcss/vite` 插件集成，WXT 的 `wxt.config.ts` 暴露 Vite 配置入口。
  - content script iframe：tailwind 编译产物需注入 iframe 文档（当前 `content.css?inline` 注入模式保留，内容替换为 token 驱动的样式或 tailwind 编译片段）。
  - 触发按钮宿主 DOM 隔离：保留 `.llm-translator-*` 前缀策略，避免与宿主页面 CSS 冲突。
  - e2e 回归：v0.2 的 Playwright e2e 用例（划词→触发→浮层→译文）须全绿，保证行为零退化。

### 7.4 假设

- 假设 tailwindcss v4（`@tailwindcss/vite`）与 WXT 0.19 + Vite 兼容，无需降级到 tailwind v3 PostCSS 方案。若不兼容，降级到 tailwind v3 + PostCSS 插件。
- 假设 shadcn-vue（radix-vue 基础）在 Chrome MV3 content script / popup / options 环境下正常工作（均为标准 DOM 环境，无特殊限制）。
- 假设浮层 iframe 文档注入 tailwind 编译产物（或 token CSS 变量）的方案可行——iframe 是 `about:blank` 同源，`contentDocument.write` 可注入任意 `<style>`，当前已用此模式注入 `content.css`。
- 假设第 1 阶段 token 值沿用当前冷色调不会引入视觉差异（纯迁移、值不变），e2e 不受影响。
- 假设 shadcn-vue 组件按需引入（仅引入项目用到的组件）不会显著增加打包体积，不影响商店审核与加载性能。

## 8. 发布

**时间范围**：约 1-1.5 周（前端为主，无后端改动，契约不变）。

**第一版（v0.3-1）包含**：
- tailwindcss + shadcn-vue 引入，WXT/Vite 配置打通，design token 体系搭建
- 翻译浮层（iframe 内）样式迁移到 token 驱动
- 划词触发按钮（宿主 DOM）样式迁移到 token 驱动
- options 配置页 + SourceConfigPanel 迁移到 shadcn-vue 组件 + tailwind 工具类
- popup 迁移到 shadcn-vue 组件 + tailwind 工具类
- design token 命名规范落档（`knowledges/ux/design-system.md` 更新）

**未来版本（v0.3-2）依赖本项**：
- 第 2 项 visual-theme：替换 token 色值为适度明亮鲜艳主题，全应用视觉焕新（直接基于本项的 token 体系）

**验收标准**：
- [ ] tailwindcss + shadcn-vue 引入完成，`wxt build` 打包通过，`typecheck` 无错误
- [ ] 翻译浮层（iframe 内）样式由 token 驱动，无硬编码色值
- [ ] 划词触发按钮样式由 token 驱动，无硬编码色值
- [ ] options 配置页基于 shadcn-vue 组件渲染，无遗留 scoped 硬编码样式块
- [ ] popup 基于 shadcn-vue 组件渲染，无遗留 scoped 硬编码样式块
- [ ] SourceConfigPanel 内部样式迁移到 shadcn-vue + tailwind 工具类
- [ ] design token 体系落档（色彩/间距/圆角/字体命名规范）
- [ ] `assets/content.css` 色值迁移到 token 或 tailwind 工具类替代
- [ ] 划词翻译 e2e 回归全绿（翻译流程、流式渲染、错误反馈、Markdown 渲染不退化）
- [ ] popup 配置操作回归正常（添加/编辑/删除/切换源、连通性测试、目标语言）
- [ ] options 页配置操作回归正常
- [ ] 功能行为零变化（纯重构，无增删功能）

## UX 设计

本项为纯重构，UX 章节聚焦「交互行为不变 + 设计系统基座就位 + 可访问性不退化」，不涉及新交互设计。交互模式详见 `knowledges/ux/interaction-patterns.md`，可访问性约束见 `knowledges/ux/accessibility.md`，色板与设计 token 方向见 `knowledges/ux/design-system.md`。

**差异性交互**

本轮不引入任何新交互，四类组件迁移到 tailwind + shadcn/ui 后行为与 v0.2 逐一对齐：

- 翻译浮层：选区右下方出现 → 点击触发按钮后浮层替换显示「翻译中…」→ 流式渐进渲染 → done 阶段 Markdown 渲染 → 错误态显示 ❌ + 引导文案；点击浮层外 / 新选区触发 / 选区清空 → 移除。显示/隐藏时机与位置计算（`pageX+8, pageY+8`、最大宽 360px、z-index 2147483647）不变。
- 划词触发按钮：圆形「译」字按钮，划词释放后出现、点击后消失；`mouseup` 触发、空选区 / 超 5000 字符不出现。仅样式由硬编码迁到 token 驱动。
- popup 弹出：点击工具栏 icon 弹出（固定 400×600），内含生效源横幅、源卡片（可折叠）、连通性测试、目标语言、底部「打开全部设置」跳 options。交互流沿用 v0.2-7。
- options 配置流：源卡片增删改 / 启用切换（自有源再次点击回兜底）/ 4 类源类型下拉（LLM 类显示模型名、传统类不显示、切换类型自动替换默认 baseUrl）/ 连通性测试 inline 展示 / 目标语言自由填写。全部复用 v0.2 既有交互，仅渲染组件换为 shadcn-vue。

**状态流转**

沿用 v0.2 状态机，仅视觉表现随新设计系统：

- 触发按钮：`idle`（圆形「译」字，token 驱动底色）→ `hover`（token 驱动 hover 色，替代硬编码 `#374151`）→ `active`（点击后消失，浮层接管）。
- 浮层：`loading`（「翻译中…」）→ `streaming`（流式渐进渲染译文 + 光标，Port 通信逻辑不变）→ `done`（Markdown 渲染完成）→ `error`（❌ + 错误文案）。
- 连通性测试：`idle` → `testing`（按钮置 loading）→ `success`（✅ 译文 inline，`ok` 着色）/ `error`（❌ 错误，`err` 着色）。
- 生效源横幅：`builtin`（免 Key 兜底态 + 隐私提示 + 引导锚点）↔ `custom`（自有源态 + 源名称），`role="status"` + `data-state` 两态切换不变。

**反馈**

- 翻译中：浮层「翻译中…」文案 + 流式光标，反馈形式不变。
- 成功：浮层流式渲染译文 + done 阶段 Markdown 渲染，与 v0.2 一致。
- 失败：沿用 v0.2 四类 `errorType` 差异化反馈（未配置提供方 / 网络错误 / HTTP 错误码 / 其他），文案与引导不变；错误色由 token `destructive` 驱动（替代硬编码 `#DC2626`）。
- 连通性测试：✅/❌ + 译文或错误信息 inline 展示，按 `ok`/`err` 着色（token 驱动 success/destructive）。
- 视觉表现（色值、圆角、阴影、间距）随新设计系统 token 统一，但反馈语义与时机零变化。

**可访问性**

依据 `knowledges/ux/accessibility.md`，重构后须保持或提升现有可达性，不得退化：

- 色彩对比度：浮层深色背景配浅色文字、错误/成功色不作为唯一区分手段（同时有 ❌/✅ 文字），迁移到 token 后对比度仍须满足 WCAG AA；token 值在第 1 阶段沿用当前冷色调（值不变），第 2 项 visual-theme 替换色板时须重新校验对比度。
- 键盘可达：options / popup 所有可操作元素（Input、Button、Select、源卡片操作）通过 Tab 聚焦与操作；shadcn-vue 组件（基于 radix-vue）自带键盘语义，迁移后可达性不低于 v0.2。浮层为鼠标交互产物，本轮不强求键盘可达（与 v0.2 一致）。
- 浮层 aria 属性：浮层容器保留 `role="status"`（流式更新通告）与错误态 `aria-live`；触发按钮补齐 `aria-label`（「翻译选中文本」）。
- 焦点管理：popup/options 内 shadcn-vue Select / Dialog 等组件自带焦点陷阱与还原；连通性测试按钮 loading 态禁用并保留焦点。
- `prefers-reduced-motion`：流式光标、hover 过渡等动效须响应 `prefers-reduced-motion: reduce` 降级（shadcn-vue / tailwind 默认支持，迁移时显式确认）。
- 文字：不依赖纯图标传达关键状态，输入框保留 placeholder 说明用途（与 v0.2 一致）。

**业务约束**

- 纯重构，不增删任何功能：四类组件交互流程、操作路径、反馈语义与 v0.2 完全一致，仅渲染层换为 tailwind + shadcn/ui。
- provider / storage / message 契约不变：`shared/types.ts`、`shared/storage.ts`、`shared/translator/*`、流式 Port 通信、`test-provider` / `get-active-sources` / `set-active-source` 消息通道全部不动。
- v0.2 e2e 全绿不退化：划词翻译 e2e（翻译流程、流式渲染、错误反馈、Markdown 渲染）、popup / options 配置操作回归均须通过，行为零退化。
- 组件样式统一 token 驱动，消除硬编码：`assets/content.css`、`entrypoints/popup/App.vue`、`entrypoints/options/App.vue`、`shared/ui/SourceConfigPanel.vue` 中的 `#1F2937`/`#F9FAFB`/`#E5E7EB`/`#D1D5DB`/`#6B7280`/`#374151`/`#93C5FD` 等色值全部迁移到 tailwind 配置的 design token（CSS 变量）或工具类。
- iframe 隔离策略不变：浮层 `about:blank` iframe + `content.css?inline` 注入模式保留，tailwind 编译产物 / token CSS 变量注入 iframe 文档；触发按钮保留 `.llm-translator-*` 前缀策略防宿主样式污染。
- popup 固定 400×600（MV3 限制）、options 最大 720px 居中、浮层最大宽 360px——尺寸约束不变。

**视觉原型**

视觉原型与色板 token 待 `prodflow-ux-spec` / `web-design-engineer` 阶段产出（见 `knowledges/ux/design-system.md` 顶部「v0.3 主题改造方向」）。本轮（第 1 项 1-ui-rewrite）聚焦设计系统基座搭建：tailwind 配置的 design token 体系就位、四类组件迁移到 token 驱动渲染、token 值暂沿用当前冷色调（保持视觉不变）。主题色板（适度明亮鲜艳、弃用纯灰白黑冷色、引入有彩色主色 / 强调色）属第 2 项 visual-theme，直接基于本项 token 体系替换色值即可全应用联动。
