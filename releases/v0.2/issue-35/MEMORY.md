# MEMORY — Issue #35

> 任务:#35 【AI】【前端】popup 设置入口 - 翻译源配置迁移与现代化(共享组件抽取)
> 迭代:v0.2 · 里程碑:v0.2 - 翻译源配置闭环 · 基础分支:master

## PRD 摘要

Issue #35 将翻译源配置从 options 页迁移到点击工具栏 icon 弹出的 popup 面板,并抽取共享组件消除双份维护。

核心目标:
1. popup 升级为配置主入口(生效源横幅、源卡片增删改、4 类源下拉、连通性测试、目标语言)
2. 抽取 `entrypoints/options/App.vue` 的源配置逻辑为共享组件,popup 与 options 共用
3. bug #27 在 popup 生效:配置自有源由纯锚点改为触发 addProvider() 并聚焦新卡片名称输入
4. bug #28 在 popup 生效:LLM 源类目归并,源类型下拉 optgroup 分组(「LLM 接口配置」/「传统翻译」),移除「云端/本地」后缀
5. 现代化 UI:对齐设计系统,适配 popup 400x600 尺寸
6. options/popup 互通:popup 底部「打开全部设置」→ chrome.runtime.openOptionsPage();共享 chrome.storage.local

## 关键业务规则

- 后端契约不变:ProviderType 枚举、Message 通道、shared/storage 均不变
- 源类型分组为 UI 层聚合,不改 ProviderType 枚举
- 配置同步:popup 写入 chrome.storage.local 后,options 已打开则下次聚焦刷新;生效源切换即时反映到划词翻译
- popup 尺寸:宽 400px、高 600px,内容超出纵向滚动,卡片折叠降密度

## 技术约束

- 框架:Vue 3 SFC + WXT popup entrypoint
- 改动范围:entrypoints/popup/*、entrypoints/options/App.vue、共享组件(shared/ui/)、shared/storage.ts(只读复用)
- 禁止触碰 #36 的文件:entrypoints/content.ts、assets/content.css、shared/translator/llm-provider.ts
- 复用消息通道:get-active-sources / set-active-source / test-provider
- 复用存储:getProviders/setProviders/getSettings/setSettings
- 复用常量:DEFAULT_ACTIVE_SOURCE_ID (builtin:microsoft)

## 依赖链元数据

- 并发安全等级:parallel-safe(从基础分支 master 独立开发,无上游代码/契约/迁移依赖)
- MR 基线策略:base-branch
- 上游依赖:无
- 关联研发任务:无(单任务,无前后端对端)
- 基线分支:master

## 自动决策记录

### ADR-001: 共享组件放置位置
- 决策点:共享源配置组件放 `components/` 还是 `shared/ui/`
- 采用值:`shared/ui/SourceConfigPanel.vue`
- 依据:项目已有 `shared/` 目录结构(storage.ts、types.ts、translator/),共享 UI 组件放 `shared/ui/` 与项目约定一致;`components/` 目录不存在,新建会增加目录层级
- 风险:低(路径清晰,import 用 `@/shared/ui/SourceConfigPanel`)
- 回滚:移动文件并更新 import 路径

### ADR-002: 共享组件变体控制
- 决策点:popup 和 options 布局差异如何处理
- 采用值:组件接受 `variant: 'popup' | 'options'` prop,内部按 variant 切换布局细节(如「配置自有源」按钮在 popup 为全宽主按钮,options 为横幅内锚点;popup 额外渲染「打开全部设置」入口)
- 依据:最小改动、可测试、可回滚;避免 slot 方案增加父组件复杂度
- 风险:variant 增多时组件内部条件分支增长(当前仅 2 个变体,可控)
- 回滚:拆分为两个独立组件

### ADR-003: 知识检索跳过
- 决策点:Step2.2 知识检索(prodflow-knowledge-retrieve)无法执行
- 采用值:跳过,从 PRD/代码/MEMORY 自行收集上下文
- 依据:子 agent 无 Skill 工具,无法调用 prodflow-knowledge-retrieve(协调器硬性覆盖 #4)
- 风险:可能遗漏项目知识库中的已有经验
- 回滚:无(非阻塞,知识沉淀在 Step5b 补)

## 待沉淀知识

> 知识沉淀:待补(子 agent 模式,由协调器统一沉淀)
> 1. 类型:feature — Issue #35 — popup 设置入口迁移与共享组件抽取 — 相关文件:shared/ui/SourceConfigPanel.vue, entrypoints/popup/App.vue, entrypoints/options/App.vue — 建议路径:knowledges/context/features/popup-settings.md
> 2. 类型:adr — Issue #35 — 共享组件变体设计(variant prop 控制 popup/options 差异) — 相关文件:shared/ui/SourceConfigPanel.vue — 建议路径:knowledges/context/decisions/shared-component-variant.md

## 踩坑记录

### 1. popup body margin 导致尺寸偏差
- 问题:popup index.html 的 body 有默认 8px margin,导致 popup 实际尺寸为 416x616 而非 400x600
- 修复:在 popup App.vue 添加非 scoped 的全局样式 `body { margin: 0; }`

### 2. 卡片头部 input 点击触发折叠
- 问题:popup 变体下,点击卡片头部的名称 input 会冒泡触发 toggleCollapse,导致编辑名称时卡片意外折叠
- 修复:在名称 input 上添加 `@click.stop` 阻止冒泡(与 activate/delete 按钮一致)

### 3. popup footer 与 component 的职责划分
- 问题:最初将 popup footer(添加提供方 + 打开全部设置)放在 SourceConfigPanel 内部,导致 footer 随 body 一起滚动
- 修复:将 footer 移到 popup App.vue(在 scrollable body 之外),通过 defineExpose 暴露 addProvider 方法供 footer 按钮调用

### 4. 测试结果
- pnpm lint:0 errors 0 warnings
- pnpm typecheck:通过
- pnpm build:通过(156.4 kB)
- pnpm test:103/103 passed
- pnpm e2e:6/6 passed(划词翻译链路不退化)
