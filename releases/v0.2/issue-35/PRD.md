# PRD:popup 设置入口 - 翻译源配置迁移与现代化(Issue #35)

> 关联 PRD Issue:#30 [v0.2-7] 设置入口 popup 化与现代化
> 迭代版本:v0.2 · 里程碑:v0.2 - 翻译源配置闭环
> 创建日期:2026-07-04

## 1. 需求概述

将翻译源配置从 options 页迁移到点击工具栏 icon 弹出的 popup 面板,抽取共享组件消除 popup 与 options 的双份维护。popup 成为配置主入口,options 保留为兜底全功能页。

## 2. 功能需求

### 2.1 popup 升级为配置主入口

将 options 页的翻译源管理能力迁移到 popup(约 400x600):
- 生效源横幅(兜底态/自有源态,`role="status"`)
- 源卡片增删改、4 类源下拉(optgroup 分组)
- 连通性测试(inline 结果)
- 目标语言设置
- 底部「+ 添加提供方」与「打开全部设置」入口

### 2.2 共享组件抽取

从 `entrypoints/options/App.vue`(~18KB)抽取源配置逻辑(状态 + 方法 + 模板)为共享组件 `shared/ui/SourceConfigPanel.vue`,popup 与 options 共用,消除双份维护。

### 2.3 配置自有源语义修复(bug #27 在 popup 生效)

兜底态「配置自有源」由纯锚点改为触发 `addProvider()` 并聚焦新卡片名称输入。经共享组件复用,options 已有的修复带到 popup。

### 2.4 LLM 源类目归并(bug #28 在 popup 生效)

源类型下拉 `<optgroup>` 分组:「LLM 接口配置」(openai-compatible/ollama)、「传统翻译」(google/microsoft);移除「云端/本地」后缀。经共享组件复用带到 popup。

### 2.5 options/popup 互通

- popup 底部「打开全部设置」→ `chrome.runtime.openOptionsPage()`
- 两者共享 `chrome.storage.local`,实时同步生效源

## 3. 不包含

- 后端契约调整(ProviderType 枚举、Message 通道、shared/storage 均不变)
- bug #29 host_permissions 动态端点通配(已单独 CLOSED,PR #34 合并)
- 自由输入翻译入口(v0.3,仅预留 popup 容器,本期不实现)

## 4. 验收标准

- [ ] 点击工具栏 icon 弹出 popup 面板(尺寸约 400x600,无溢出)
- [ ] popup 内可完成:添加/编辑/删除提供方、切换生效源、连通性测试、设置目标语言(无需打开 options)
- [ ] 默认配置下点击「配置自有源」可真正发起配置(新建并聚焦卡片),bug #27 在 popup 修复
- [ ] 源类型下拉 `<optgroup>` 分组为「LLM 接口配置」/「传统翻译」,无「云端/本地」误导后缀,bug #28 在 popup 修复
- [ ] popup 与 options 配置实时同步(同一 chrome.storage.local)
- [ ] UI 现代化达标(设计系统对齐、可访问性 AA、首屏可读性)
- [ ] popup 打开即聚焦首个可交互项;横幅 `role="status"`;「打开全部设置」可跳转 options
- [ ] 既有划词翻译链路 e2e 回归通过(不退化)

## 5. 技术参考

- PRD 文档:`releases/v0.2/7-popup-settings/PRD.md`
- UX 设计系统:`knowledges/ux/design-system.md`、`interaction-patterns.md`、`accessibility.md`
- 视觉原型:`knowledges/ux/prototypes/v0.2-popup-settings.html`
- 复用消息通道:get-active-sources / set-active-source / test-provider
- 复用存储:shared/storage.ts(getProviders/setProviders/getSettings/setSettings)
- 复用常量:shared/translator/builtin-sources.ts(DEFAULT_ACTIVE_SOURCE_ID)
