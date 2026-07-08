# 需求文档

## 基础信息

| 项目 | 内容 |
|------|------|
| ISSUE ID | #56 |
| PRD Issue | #49 |
| 标题 | UI 设计系统重构 - tailwind/shadcn 基座与全界面迁移 |
| 版本号 | v0.3 |
| 基础分支 | master |
| 模式 | 无人值守，常规确认自动批准并留痕 |

## 需求来源

本任务引用官方 PRD `releases/v0.3/1-ui-rewrite/PRD.md`，不重写上游 PRD，只补充 #56 的研发边界和执行澄清。#56 是 #49 的唯一研发任务，需为后续 #57 提供已合并的 design token 与 UI 基座。

## 需求内容

### 背景

当前 UI 样式散落在 `assets/content.css`、`entrypoints/popup/App.vue`、`entrypoints/options/App.vue` 和 `shared/ui/SourceConfigPanel.vue` 中，色值、圆角、间距和字体多处硬编码。v0.3 需要先完成 tailwindcss + shadcn-vue 设计系统基座，再由 #57 在 token 层替换主题色板。

### 目标

- 引入 tailwindcss + shadcn-vue，并打通 WXT/Vite 构建。
- 建立 design token / CSS 变量体系，首版 token 值沿用当前冷色调。
- 迁移 content 划词触发按钮、iframe 翻译浮层、popup、options、`SourceConfigPanel` 到 token + tailwind + shadcn-vue 风格。
- 更新 `knowledges/ux/design-system.md`，落档 token 命名、色彩、间距、圆角和字体使用规范。
- 保持既有行为、状态、文案、消息契约、存储契约和尺寸约束不变。

### 需求范围

涉及文件范围包括但不限于：

- `package.json`、`pnpm-lock.yaml`
- `wxt.config.ts`
- `tailwind.config.ts`、全局样式入口
- `assets/content.css`
- `entrypoints/content.ts`
- `entrypoints/popup/App.vue`
- `entrypoints/options/App.vue`
- `shared/ui/SourceConfigPanel.vue`
- shadcn-vue 基础 UI 组件目录
- `knowledges/ux/design-system.md`
- 必要的 Vitest / e2e 测试

### 业务规则

- 不新增交互，不改变 provider/storage/message/translator 契约。
- popup 保持 400x600；options 最大宽度保持 720px；浮层最大宽度保持 360px。
- 浮层继续使用 `about:blank` iframe + `content.css?inline` 注入模式。
- 触发按钮仍在宿主 DOM 渲染，空选区或超过 5000 字符不出现。
- 成功/失败状态继续使用文字和符号双重反馈，不只依赖颜色。
- API Key 不进入日志、文档样例、commit 信息或错误上报。

### 交互说明

本轮沿用 `releases/v0.3/1-ui-rewrite/PRD.md` 的 `## UX 设计`：

- 划词释放后出现圆形「译」按钮，点击后按钮消失并展示浮层。
- 浮层状态保持 loading -> streaming -> done/error，done 阶段继续 Markdown sanitize 渲染。
- popup/options 的添加、编辑、删除、启用、回兜底、连通性测试、目标语言保存流程不变。
- shadcn-vue 迁移只替换渲染组件和样式表达，不改变业务状态机。

## 非功能需求

### 性能要求

- 按需引入 UI 组件，不引入与当前交互无关的复杂组件。
- content iframe 样式注入保持字符串注入，不依赖宿主页面全局 CSS。

### 兼容性要求

- 兼容 WXT 0.19 + Vue 3 + TypeScript 严格模式。
- 如 tailwind v4 Vite 插件与 WXT 不兼容，回退 tailwind v3 + PostCSS 方案。

### 安全性要求

- Markdown 渲染继续走现有 `renderMarkdown` + DOMPurify sanitize。
- 不改 API Key 存储与传输规则。

### 边界场景与异常处理

| 场景 | 处理方式 |
|------|----------|
| tailwind v4 构建不兼容 WXT | 降级 tailwind v3 + PostCSS，并记录在 DESIGN/MEMORY |
| e2e 运行环境缺少浏览器 | 执行 `pnpm e2e:install` 或在结果中说明不可运行原因 |
| shadcn-vue 组件依赖过重 | 只保留当前必需基础组件，避免新增无用交互 |
| 宿主页面 CSS 污染 content UI | 保留 `.llm-translator-*` 前缀与 iframe 样式隔离 |

## 需求歧义处

| 编号 | 疑问点 | 影响范围 | 决策 |
|------|--------|----------|------|
| 1 | 是否同步落地 #57 的新色板 | token 色值 | 不做，#56 只建立基座并沿用旧冷色调 |
| 2 | 是否重做交互和文案 | popup/options/content | 不做，保持 v0.2 行为零变化 |
| 3 | 是否更新迭代主文档 | `releases/v0.3/index.md` | 不更新，用户指定子 agent 模式由协调器统一处理 |

## 自动批准记录

无人值守模式下，本 PRD 整理基于 Issue #56、PRD #49、UX 规范和代码现状自动批准。采用范围最小、可回滚方案：只迁移 UI 表现层和 token，保持业务契约不变；如验证失败，可回滚 #56 分支改动并恢复原 scoped CSS/content.css。

## 参考资料

- `releases/v0.3/1-ui-rewrite/PRD.md`
- `knowledges/ux/design-system.md`
- `knowledges/ux/interaction-patterns.md`
- `knowledges/ux/accessibility.md`
- `knowledges/ux/prototypes/index.md`
