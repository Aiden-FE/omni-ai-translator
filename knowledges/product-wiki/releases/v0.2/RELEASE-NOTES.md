# 发版说明 v0.2.0

| 项 | 内容 |
|---|---|
| **版本号** | v0.2.0 |
| **发布日期** | 2026-07-07 |
| **关联迭代** | v0.2 - 翻译源配置闭环 |
| **里程碑** | https://github.com/Aiden-FE/llm-translator/milestone/1 |
| **类型** | release |
| **目标分支** | master |

> 本轮为 LLM Translator 首个正式发版。v0.1(划词翻译 MVP)已在代码层实现但未走 releases 落档流程,其能力随本版首次正式发布。

## ✨ 新增功能

- **统一翻译源适配层**:抽象统一翻译源接口,将现有 LLM 适配迁移为 provider 之一,新增传统翻译 provider 抽象,对上层暴露一致接口 (#10 · PR #12)
- **划词浮层四类错误差异化反馈**:对接统一适配层错误模型 (#11 · PR #13)
- **内置免 Key 免费翻译源**:内置 Google + 微软免 Key 公共端点,作为用户可选免费源;全新安装默认选中 microsoft,可随时切换;无隐式自动回退 (#14 · PR #15)
- **传统翻译源 API Key 配置**:支持填入自有 Key/端点,启用后覆盖免 Key 源走官方 API;ProviderConfig 新增 region 字段 (#18 · PR #20)
- **microsoft region 输入框与官方端点联调**:配置页新增 region 输入框,e2e 联调回归 (#19 · PR #21)
- **配置页翻译源管理 UI**:源类型选择、生效源提示行、四类源连通性测试 (#16 · PR #17)
- **LLM anthropic 响应风格**:LLM 适配层新增 anthropic 风格(默认 openai,向后兼容),支持原生 Anthropic 端点 (#22 · PR #23)
- **LLM 流式响应**:译文逐步呈现,避免干等;仅 LLM 源流式,传统源非流式 (#25 · PR #26)
- **popup 设置入口**:点击 icon 弹出设置界面,现代化重构配置入口,抽取共享组件 (#35 · PR #38)
- **译文 markdown 渲染**:浮层按 markdown 可读渲染,流式感知 + prompt 保留格式 + XSS 过滤 (#36 · PR #39)
- **LLM 类型统一为响应风格**:取消 type 子分组,responseStyle 扩展为 openai/anthropic/ollama;配置收敛为 baseUrl+model+apiKey+responseStyle;存量无感迁移 (#43 · PR #44)

## 🐛 Bug 修复

- BaseURL 改用用户完整接口路径,不再追加固定 path (#5 · PR #7)
- 划词翻译默认目标语言配置生效,优先读 settings.defaultTargetLang (#8 · PR #9)
- manifest host_permissions 增补 https://*/* 覆盖云端 LLM 端点 (#29 · PR #32)
- 配置自有源点击即触发 addProvider 并聚焦名称输入 (#27 · PR #33)
- LLM 源下拉分组为「LLM 接口配置/传统翻译」并去除云端/本地后缀 (#28 · PR #34)

## ⚠️ 破坏性变更

- 调整 v0.1「不内置任何模型接口」原则:内置传统翻译免 Key 公共端点作为可选免费源(非隐式兜底,源失败不自动切换) (#14 · PR #15)
- LLM 配置数据模型变更:type 子分组(openai-compatible/ollama)收敛为 responseStyle 字段(openai/anthropic/ollama);存量配置无感迁移(on-read storage migration),用户无需手动操作 (#43 · PR #44)
- 浏览器扩展权限变更:manifest 新增 host_permissions `https://*/*`,用户安装/升级时可能见到权限确认提示 (#29 · PR #32)

## 🔌 API 变更

- 新增统一翻译源适配层接口与 provider 注册/路由机制;四类错误模型(errorType);LLM 适配层改为 provider 注册接入 (#10 · PR #12)
- ProviderConfig 新增 region 字段,有 Key 场景按官方端点路由 (#18 · PR #20)
- provider 契约扩展流式能力;background↔content 消息层(port)支持流式传输;浮层渐进渲染 (#25 · PR #26)
- responseStyle 作为 LLM 协议区分器,路由三路分发(openai/anthropic/ollama) (#43 · PR #44)

## 🚀 部署说明

- **隐私声明已更新**:全新安装默认选中微软翻译,文本默认外传给微软;用户可在配置页切换到 Google 免费源或自有源(如本地 Ollama,文本仅本机流转)。LLM 提供方扩展到原生 Anthropic 端点。详见 [PRIVACY-POLICY.md](../../privacy/PRIVACY-POLICY.md) (#14 · PR #15、#22 · PR #23)
- **存量配置无感迁移**:LLM 配置 type 子分组自动迁移为 responseStyle,无需用户操作;详见 [on-read-storage-migration](../../../context/development/on-read-storage-migration.md) (#43 · PR #44)
- **扩展权限**:新增 host_permissions `https://*/*`,安装/升级时用户可能见到权限确认 (#29 · PR #32)
- **浮层 iframe 隔离**:划词翻译浮层改用 iframe 隔离宿主样式(PR #47,随本版发布)
- **部署钩子**:项目未配置 `deploy.yml`,浏览器扩展商店发布流水线已延后到 v0.3,本版需自行打包部署

## 📦 关联交付

- PRD 清单:
  - `releases/v0.2/1-unified-adapter/PRD.md`
  - `releases/v0.2/2-builtin-fallback/PRD.md`
  - `releases/v0.2/3-traditional-apikey-config/PRD.md`
  - `releases/v0.2/4-source-picker-ui/PRD.md`
  - `releases/v0.2/5-llm-anthropic-style/PRD.md`
  - `releases/v0.2/6-llm-streaming/PRD.md`
  - `releases/v0.2/7-popup-settings/PRD.md`
  - `releases/v0.2/8-md-render/PRD.md`
  - `releases/v0.2/9-llm-type-unify/PRD.md`
- 知识沉淀:
  - adr: `knowledges/adr/001-unified-translator-adapter-layer.md`、`002-llm-streaming-port-and-readablestream.md`、`003-markdown-render-sanitize.md`、`004-shared-component-variant.md`、`005-response-style-as-llm-protocol-discriminator.md`
  - feature: `knowledges/feature/translator/unified-adapter.md`、`streaming.md`、`popup-settings.md`、`markdown-render.md`、`llm-type-unify.md`
  - context: `knowledges/context/development/dompurify-lazy-init.md`、`on-read-storage-migration.md`、`coding-standard.md`、`knowledges/context/system/plugin-architecture.md`、`tech-stack.md`
  - runbook: `knowledges/runbook/e2e-and-build/index.md`

## 🤝 致谢

- 本轮迭代由 Prodflow 工作流驱动,所有功能事项与独立快修均已通过代码审查并合并到主干。
