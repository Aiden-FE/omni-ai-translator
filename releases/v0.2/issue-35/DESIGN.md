# DESIGN:popup 设置入口 - 翻译源配置迁移与现代化(Issue #35)

> 关联 Issue:#35 · PRD Issue:#30 · 迭代:v0.2
> 创建日期:2026-07-04

## 1. 背景与目标

当前 options 页(~18KB App.vue)承载全部翻译源配置逻辑,popup 仅为 602 字节的「打开设置」按钮。需将 popup 升级为配置主入口,同时抽取共享组件消除 popup 与 options 的双份维护。

目标:用户「安装→点 icon→配源→划词翻译」即可跑通,无需进入 options 页。

## 2. 技术选型与理由

### 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 共享组件 + variant prop | 抽取 SourceConfigPanel.vue,接受 variant prop 控制布局差异 | 单一组件维护;逻辑零重复;改动最小 | variant 增多时条件分支增长(当前仅 2 变体,可控) |
| B. 独立 popup + options 组件 | 各自维护,共享 composable 抽逻辑 | 模板完全独立,灵活 | 模板重复维护;composable 与模板分离增加心智负担 |
| C. 完全复制 options 逻辑到 popup | 复制粘贴 | 最快 | 双份维护,违反 DRY,后续改动需同步两处 |

### 选定方案:A(共享组件 + variant prop)

理由:最小改动、可测试、可回滚;单一组件维护避免双份;variant prop 方式对 2 个变体足够清晰。

## 3. 架构方案

### 3.1 组件结构

```
entrypoints/popup/App.vue          ← popup 外壳(header + body + footer)
  └── shared/ui/SourceConfigPanel.vue  ← 共享源配置组件(variant="popup")

entrypoints/options/App.vue        ← options 外壳(h1 + sections)
  └── shared/ui/SourceConfigPanel.vue  ← 共享源配置组件(variant="options")
```

### 3.2 SourceConfigPanel.vue 设计

**Props:**
- `variant: 'popup' | 'options'` — 控制布局差异

**Emits:**
- `open-options` — popup 变体请求打开 options 页

**Expose:**
- `focusFirst()` — 聚焦首个可交互项(popup 打开时调用)

**内部状态与方法(从 options/App.vue 迁移):**
- providers, activeSourceId, allSources, targetLang, testMsgs, bannerTestMsg
- loadActiveSources, saveProviders, saveTargetLang, addProvider, configureOwnSource
- removeProvider, activate, onTypeChange, testProvider, testBuiltin
- onResponseStyleChange, responseStyleHint, isLlmType, baseUrlPlaceholder, apiKeyPlaceholder
- isFallback, activeSourceName (computed)
- DEFAULT_BASE_URL, KNOWN_DEFAULT_BASE_URLS, FALLBACK_SOURCE_ID (constants)

### 3.3 variant 差异

| 特性 | popup | options |
|------|-------|---------|
| 「配置自有源」入口 | 全宽 primary 按钮在横幅下方 | 横幅内锚点「配置自有源 →」 |
| 「打开全部设置」入口 | footer 区域,emit open-options | 不显示 |
| 卡片折叠 | 默认折叠(节省空间),data-collapsed | 不折叠(空间充裕) |
| 页面外壳 | header(logo+title) + scrollable body + footer | h1 + sections |
| 尺寸约束 | 400x600 固定,纵向滚动 | max-width 720px 居中 |
| 打开即聚焦首项 | 是(target lang input) | 否 |

### 3.4 数据流

```
SourceConfigPanel
  ├── onMounted → loadActiveSources() + getProviders() + getSettings()
  ├── 用户操作 → saveProviders() / saveTargetLang() / activate() / sendMessage()
  └── chrome.storage.local ←→ options/popup 共享
```

配置同步:popup 写入 chrome.storage.local 后,options 已打开则在下次 onMounted/focus 刷新;生效源切换经 set-active-source 消息即时生效。

## 4. UX 与视觉实现

### 4.1 设计 Token(严格沿用 design-system.md)

| Token | 值 | 用途 |
|-------|-----|------|
| --c-panel-bg | #1F2937 | popup header 深色背景 |
| --c-panel-text | #F9FAFB | header 文字 |
| --c-primary | #1F2937 | 主操作按钮/启用态 |
| --c-primary-hover | #374151 | hover 态 |
| --c-error | #DC2626 | 失败提示 |
| --c-success | #16A34A | 成功提示 |
| --c-border | #E5E7EB | 卡片边框 |
| --c-input-border | #D1D5DB | 输入框边框 |
| --c-hint | #6B7280 | 辅助文字 |
| --c-text | #111827 | 正文 |
| --c-popup-bg | #F9FAFB | popup 内部背景 |
| --font-stack | system-ui, -apple-system, sans-serif | 字体栈 |
| --r-card | 8px | 卡片圆角 |
| --r-input | 4px | 输入框圆角 |
| --sp-1/2/3/4 | 4/8/12/16px | 间距 |

### 4.2 popup 布局(对照原型 v0.2-popup-settings.html)

```
┌─────────────────────────────┐ 400px
│ [译] LLM Translator    [✕]  │ ← header(深色 #1F2937)
├─────────────────────────────┤
│  默认目标语言               │
│  [简体中文_______________]   │
│                             │
│  ● 当前生效                 │ ← role="status" 横幅
│    免 Key 兜底              │   data-state="fallback"|"active"
│    隐私提示...              │
│  ┌─────────────────────────┐ │
│  │ + 配置自有源 (primary)  │ │ ← 仅兜底态显示
│  └─────────────────────────┘ │
│                             │
│  ┌─────────────────────────┐ │
│  │ 我的 OpenAI  [启用][删除]│ │ ← 源卡片(可折叠)
│  │  ▸ 类型/URL/模型/Key     │ │   data-collapsed
│  └─────────────────────────┘ │
│                             │
├─────────────────────────────┤
│ [+ 添加提供方]  打开全部设置→│ ← footer
└─────────────────────────────┘ 600px
```

### 4.3 交互状态

- **生效源横幅** `role="status"` 两态:
  - 兜底态(`data-state="fallback"`):灰底 #f3f4f6,显示「免 Key 兜底」+ 隐私提示 +「配置自有源」按钮
  - 自有源态(`data-state="active"`):白底,显示源名称 +「翻译请求将发送到该源」
- **源卡片** 可折叠(`data-collapsed`),popup 默认折叠非活跃卡片;活跃卡片有 border 高亮
- **源类型下拉** `<optgroup>` 分组:LLM 接口配置 / 传统翻译;LLM 类显示模型名字段,传统类不显示
- **连通性测试** inline 结果(✅ 译文 / ❌ 错误),按 ok/err 着色

### 4.4 可访问性

- popup 打开即聚焦首个可交互项(target lang input)
- 所有可操作元素 Tab 可达 + 可见聚焦环(outline: 2px solid #1F2937)
- 横幅 `role="status"` 让读屏播报生效源变化
- 源类型下拉 `<optgroup>` 语义分组,读屏可识别类目
- 「配置自有源」按钮有可见文字(非纯图标)
- 对比度:#1F2937/#F9FAFB 满足 WCAG AA
- `prefers-reduced-motion: reduce` 时禁用过渡动画

### 4.5 视觉原型参照

`knowledges/ux/prototypes/v0.2-popup-settings.html`

关键样式从原型提取:
- popup 窗口:400x600, border-radius 8px, box-shadow, border 1px solid #e5e7eb
- header: padding 12px 16px, background #1F2937, color #F9FAFB
- body: flex 1, overflow-y auto, padding 12px 16px
- footer: border-top 1px solid #e5e7eb, padding 8px 16px, background #fff
- effective banner: padding 12px, border-radius 8px, border 1px solid #e5e7eb
- card: border 1px solid #e5e7eb, border-radius 8px, margin-bottom 8px
- add-btn: width 100%, border 1px dashed, background transparent

## 5. 数据结构/模型变更

无变更。复用既有 ProviderConfig、Settings、ActiveSourcesResult、Message 类型。

## 6. 接口设计

无新增接口。复用既有消息通道:
- `get-active-sources` → ActiveSourcesResult
- `set-active-source` → { id: string }
- `test-provider` → TranslateResult
- `get-providers` / `get-settings` (via shared/storage.ts)

## 7. 兼容性与风险评估

### 兼容性
- options 页行为不变(改为复用共享组件,功能等价)
- 后端契约不变(ProviderType、Message、storage 均不变)
- 既有 e2e 不退化(划词翻译链路不受影响)

### 风险
- **低风险**:options App.vue 重构后行为偏离 → 对照原型 + e2e 回归验证
- **低风险**:popup 400x600 尺寸不足 → 卡片折叠 + 滚动解决
- **低风险**:与 #36 合并冲突 → 改动范围隔离(entrypoints/popup/*、entrypoints/options/App.vue、shared/ui/),不触碰 #36 文件
