# PRD:设置入口 popup 化与现代化(popup-settings)

> 版本:v0.2 第 7 项 · 优先级 P1 · 关联 Issue #30 · 创建日期 2026-07-03

## 1. 摘要

本文档定义 LLM Translator 浏览器扩展的设置入口升级:将翻译源配置从深藏的 options 页迁移到点击工具栏 icon 即可弹出的现代化 popup 面板,并归并 LLM 源类目、修复「配置自有源」入口语义。目标是让用户一键即可完成翻译源配置与切换,提升首屏发现性与上手效率,同时为后续自由输入翻译预留统一入口。

## 2. 联系人

| 角色 | 负责人 | 备注 |
|---|---|---|
| 产品 | Prodflow | 需求与验收 |
| 前端 | 待分配 | popup UI 迁移与现代化(Vue 3 + WXT popup entrypoint) |
| 后端 | 待分配 | 契约不变,仅按需适配 popup 上下文 |

## 3. 背景

LLM Translator v0.2 完成了「翻译源配置闭环」:用户可在 options 页配置免 Key 兜底、传统 API Key、LLM 接口三类翻译源,划词翻译按配置路由。但实际运行暴露三个入口层问题:

1. **入口过深**:options 页需经「扩展详情 → 扩展选项」进入,发现性差,新用户难以找到配置入口。
2. **首屏入口失效**:options 页顶部「配置自有源 →」在默认配置(fresh install)下是纯锚点跳转,源区块本就在视口内,点击无可见反应(bug #27)。
3. **popup 形同虚设**:扩展虽声明了 `action.default_popup: popup.html`,但当前 popup 仅是「打开设置」按钮,不承载任何配置。

同时,源类型下拉把协议风格与部署位置混为一谈(「OpenAI 兼容(云端)」「Ollama(本地)」),误导用户(bug #28)。

变化点:Chrome MV3 popup 可承载完整交互;WXT 已具备 popup entrypoint;v0.2 后端契约(get-active-sources/set-active-source/test-provider)已稳定,可在不动后端的前提下迁移前端配置 UI。

## 4. 目标

**目标**:把 popup 升级为点击工具栏 icon 弹出的现代化设置面板,作为翻译源配置的主入口,使新用户「安装→点 icon→配源→划词翻译」即可跑通,无需进入 options 页。

**为什么重要**:配置入口是用户留存的第一道门槛;入口过深 + 首屏失效直接导致新用户放弃。统一 popup 入口也为 v0.3 自由输入翻译预留交互容器。

**关键结果(SMART OKR)**:
- O:设置入口发现性与配置完成率显著提升
  - KR1:100% 的翻译源配置操作可在 popup 内完成(含添加/编辑/删除/切换/连通性测试),无需打开 options 页
  - KR2:默认配置下点击 popup 内「配置自有源」可真正发起配置(新建并聚焦提供方卡片),bug #27 修复
  - KR3:LLM 源归入统一「LLM 接口配置」类目,「云端/本地」误导性后缀移除,bug #28 修复
  - KR4:popup UI 通过设计系统校验(现代化、可访问性达标),首屏可读性评分达标

## 5. 细分市场

面向两类待完成任务:
- **新用户(首次安装,未配置任何源)**:任务是「最快跑通划词翻译」——期望点 icon 即见配置入口,几步内启用自有源或接受免 Key 兜底。当前入口过深使其受挫。
- **已配置用户(需切换源或调整)**:任务是「快速切换生效源或改配置」——期望一键弹出、改完即走,不中断浏览。

约束:Chrome MV3 popup 尺寸受限(约 400×600,需滚动);用户可能同时配云端与本地源;部分用户对隐私敏感(云端外传 vs 本地)。

## 6. 价值主张

| 客户任务 | 现状痛点 | 升级后收益 |
|---|---|---|
| 找到配置入口 | options 深路径,发现不到 | 点工具栏 icon 即弹出,零路径 |
| 首次配置源 | 「配置自有源」无反应 | 点击即新建并聚焦,引导明确 |
| 理解源类型 | 「云端/本地」标签误导 | 「LLM 接口配置」统一类目,语义准确 |
| 快速切换源 | 需进 options | popup 内一键切换 |
| 后续输入翻译 | 无统一入口容器 | popup 作为复用入口(v0.3) |

比竞品(多数翻译扩展把设置藏在 options)更优:把高频配置动作提到工具栏首屏,符合「轻量不打扰、状态可见、配置友好」的项目 UX 原则。

## 7. 解决方案

### 7.1 UX / 原型(高层流程)

用户流程:点击工具栏 icon → popup 弹出(图标下方/右上区域,约 400×600)→ 顶部「当前生效源」横幅(兜底态/自有源态)→ 源列表区(卡片式,可折叠)→ 底部「+ 添加提供方」与「打开全部设置(options)」入口。

- 兜底态横幅含「配置自有源」按钮 → 点击新建一个 LLM 接口提供方卡片并聚焦名称输入(修复 bug #27)。
- 源类型下拉分组:「LLM 接口配置」(openai-compatible / ollama)+「传统翻译」(google / microsoft),去除「云端/本地」后缀(修复 bug #28)。

详细交互、状态流转、可访问性、视觉原型链接由 prodflow-ux-evaluate 补全(见「## UX 设计」章节)。

### 7.2 核心功能

1. **popup 入口承载配置**:将 options 页的翻译源管理能力(生效源横幅、源卡片增删改、4 类源下拉、连通性测试、目标语言)迁移到 popup,后端消息契约(get-active-sources/set-active-source/test-provider/get-settings/set-settings/get-providers)不变。
2. **配置自有源语义修复**:「配置自有源」由纯锚点改为触发 addProvider() 并聚焦新卡片名称输入;或显著滚动+高亮「添加提供方」。
3. **LLM 源类目归并**:源类型下拉分组为「LLM 接口配置」(openai-compatible/ollama)与「传统翻译」(google/microsoft);移除「(云端)」「(本地)」后缀,改用辅助说明(如 ollama 默认本地端点)。
4. **与 options 页关系**:popup 为主入口(高频配置),options 页保留为兜底全功能页(底部「打开全部设置」链接互通),避免功能重复维护(共用组件)。
5. **现代化 UI**:遵循项目设计系统(design-system.md),统一色彩/字体/间距/组件状态;popup 尺寸约束下采用卡片折叠、分区滚动、清晰层级。
6. **配置读写一致性**:所有配置经 chrome.storage.local(既有契约),popup 与 options 共享同一存储,实时同步生效源。

### 7.3 技术

- 入口:`entrypoints/popup/*`(WXT popup entrypoint,Vue 3 SFC),替换当前轻量实现。
- 复用:将 options 的源配置逻辑抽取为共享组件(`components/` 或 `shared/ui/`),popup 与 options 共用,避免双份维护。
- 类型:`shared/types.ts`(ProviderConfig/ProviderType/Message)不变;源类型下拉分组为 UI 层聚合,不改 ProviderType 枚举。
- 存储:`shared/storage.ts`(getProviders/setProviders/getSettings/setSettings)不变。
- 兼容:options 页保留,链接互通;不破坏 v0.2 既有契约与 e2e(除适配 popup)。

### 7.4 假设

- 假设 popup 尺寸(约 400×600)足以承载源卡片列表;若用户源数量多,靠卡片折叠+滚动解决。
- 假设「LLM 接口配置」类目归并不破坏存量配置(ProviderType 枚举不变,仅 UI 分组)。
- 假设 options 页保留可被 store 审核接受(无额外权限申请;host_permissions 由 bug #29 单独处理)。
- 假设新用户接受免 Key 兜底为默认,popup 首屏引导「配置自有源」为可选增强。

## 8. 发布

**时间范围**:约 1-1.5 周(前端为主,后端契约不变)。

**第一版(v0.2-7)包含**:
- popup 升级为配置主入口(生效源横幅、源卡片、连通性测试、目标语言)
- 「配置自有源」语义修复(默认下可发起配置)
- LLM 源类目归并(「LLM 接口配置」+ 移除「云端/本地」)
- options/popup 共享组件、互通链接
- 现代化 UI(设计系统对齐、可访问性)

**未来版本(v0.3+)**:自由输入翻译入口(复用 popup 容器)、划词浮层重译/复制/切语言、快捷键。

**验收标准**:
- [ ] 点击工具栏 icon 弹出 popup 面板(尺寸约 400×600,无溢出)
- [ ] popup 内可完成:添加/编辑/删除提供方、切换生效源、连通性测试、设置目标语言(无需打开 options)
- [ ] 默认配置下点击「配置自有源」可真正发起配置(新建并聚焦卡片),bug #27 修复
- [ ] 源类型下拉分组为「LLM 接口配置」/「传统翻译」,无「云端/本地」误导后缀,bug #28 修复
- [ ] popup 与 options 配置实时同步(同一 chrome.storage)
- [ ] UI 现代化达标(设计系统对齐、可访问性 AA、首屏可读性)
- [ ] 既有划词翻译链路 e2e 回归通过(不退化)

## UX 设计

### UX 依据
- Issue: #30
- 版本: v0.2
- 知识来源: `knowledges/ux/design-system.md`、`interaction-patterns.md`、`accessibility.md`;`knowledges/context/system/plugin-architecture.md`
- 设计假设: popup 尺寸约 400×600(宽 400、高 600,可纵向滚动);用户源数量通常 ≤5,超出靠折叠+滚动

### 视觉设计
> 设计系统与视觉原型由 `web-design-engineer` 产出,见 [prototypes/v0.2-popup-settings.html](../../../knowledges/ux/prototypes/v0.2-popup-settings.html)。
> 复用项目既有设计系统(深灰主色 #1F2937、系统字体栈、4/8/12 间距、8px/4px 圆角);popup 为独立窗口态,采用与 options 一致的卡片+横幅结构,但适配窄尺寸。

### 交互逻辑(差异)
- **入口**:点击工具栏 icon 弹出 popup(Chrome 行为:锚定 icon 下方);popup 打开时焦点移至首个可交互项(兜底态为「配置自有源」按钮,自有源态为源列表首卡)。
- **生效源横幅**(顶部,`role="status"`,`data-state` 两态):
  - 兜底态:显示「免 Key 兜底」+ 隐私提示(文本外传 Google/微软)+「配置自有源」按钮 → 点击触发 `addProvider()` 新建 LLM 接口卡片并聚焦名称输入(修复 bug #27,不再是无反应锚点)。
  - 自有源态:显示源名称 +「翻译请求将发送到该源」。
- **源类型下拉分组**(差异):`<optgroup>` 分两组——「LLM 接口配置」(openai-compatible / ollama)、「传统翻译」(google / microsoft);移除「(云端)」「(本地)」后缀;ollama 占位提示「默认本地端点,如 http://localhost:11434/api/chat」(修复 bug #28)。
- **源卡片**:增删改、启用/切换(已启用再点回兜底)、连通性测试(inline ✅/❌);卡片可折叠以节省纵向空间。
- **目标语言**:顶部或独立分区,留空取浏览器首选。
- **options 互通**:底部「打开全部设置」链接 → `chrome.runtime.openOptionsPage()`;popup 与 options 共享 `chrome.storage`,任一处改动实时同步。

### 业务约束
- 尺寸:popup 宽 400px、高 600px(WXT popup 配置);内容超出纵向滚动,卡片折叠降密度。
- 源类型分组为 UI 层聚合,不改 `ProviderType` 枚举与后端契约。
- 配置同步:popup 写入 `chrome.storage.local` 后,options 已打开则下次聚焦刷新;生效源切换即时反映到划词翻译。

### 设备适配(差异)
- popup 为固定尺寸独立窗口,不做响应式断点;仅在窄高下靠折叠+滚动。
- 通用断点引用 `knowledges/ux/design-system.md`。

### 可访问性(差异)
- popup 内所有可操作元素 Tab 可达、可见聚焦环(超出 `accessibility.md`「设置页 Tab 可达」基线,popup 需额外保证打开即聚焦首项)。
- 源类型下拉用 `<optgroup>` 语义分组,读屏可识别类目。
- 横幅 `role="status"` 让读屏播报生效源变化。
- 对比度沿用设计系统(#1F2937/#F9FAFB 满足 AA)。
- 「配置自有源」按钮需有可见文字(非纯图标),与 `accessibility.md`「不依赖纯图标」一致。

### 验收补充
- [ ] popup 打开即聚焦首个可交互项(键盘可达)
- [ ] 兜底态「配置自有源」点击新建卡片并聚焦名称输入
- [ ] 源类型下拉为 optgroup 分组,无「云端/本地」后缀
- [ ] 横幅 `role="status"`,读屏播报生效源
- [ ] 「打开全部设置」可跳转 options 页
- [ ] popup 与 options 配置双向同步
