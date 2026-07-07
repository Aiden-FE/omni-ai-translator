# 发版说明 v0.2.0

| 项 | 内容 |
|---|---|
| **版本号** | v0.2.0 |
| **发布日期** | 2026-07-07 |
| **关联迭代** | v0.2 - 翻译源配置闭环 |
| **里程碑** | https://github.com/Aiden-FE/llm-translator/milestone/1 |
| **类型** | release |
| **目标分支** | master |

> 本轮为 LLM Translator 首个正式发版。v0.1(划词翻译 MVP)已在代码层实现但未走 releases 落档流程,其能力随本版首次正式发布。本说明由 16 份逐 Issue CHANGELOG 聚合而成。

## ✨ 新增功能

- **统一翻译源适配层**(#10 · PR #12):新增 `shared/translator/`,定义 `TranslationProvider` 接口(`id`/`type`/`translate`/`test`)、provider 注册表与路由、统一入口 `translateWithAdapter`/`testWithAdapter`;将现有 LLM 适配迁移为 provider 之一,新增传统翻译 provider 抽象;建立四类错误模型 `TranslateResult.errorType`(`no-config`/`network`/`rate-limit`/`unreachable`)。
- **划词浮层四类错误差异化反馈**(#11 · PR #13):浮层失败态从单一「❌ error」扩展为按 errorType 差异化反馈,每类含主文案 + 引导次要行;新增 `errorFeedback(errorType)` 返回 `{main, guidance}`;引导行对比度满足 WCAG AA。
- **内置免 Key 免费翻译源**(#14 · PR #15):在适配层接口上实现真实 Google 翻译(`translate.googleapis.com` 公共端点)与微软翻译(`edge.microsoft.com` auth + `api.cognitive.microsofttranslator.com`);新增 `builtin:microsoft`/`builtin:google` 内置源;全新安装默认选中 `builtin:microsoft`(显式默认值,非隐式回退,源失败不自动切换);暴露 `get-active-sources`/`set-active-source` 生效源切换契约。
- **传统翻译源 API Key 配置(后端)**(#18 · PR #20):`ProviderConfig` 新增可选 `region` 字段;provider 按 `apiKey` 是否存在切换调用——有 Key 走官方端点(google v2 / microsoft Azure + `Ocp-Apim-Subscription-Key` + Region header),无 Key 维持免 Key 公共端点。
- **传统 API Key 源前端联调**(#19 · PR #21):配置页 microsoft 有 Key 场景新增 region 输入框;新增 microsoft 有 Key 划词 e2e,断言请求携带 Key 与 `Region: eastus` header。
- **配置页翻译源管理 UI**(#16 · PR #17):分区升级为「翻译源管理」;源类型下拉扩展为 openai-compatible/ollama/google/microsoft 四类按类型条件渲染字段;顶部生效源提示行(兜底态/自有源态);连通性测试覆盖四类源;可访问性增强(语义标签 + `role="status"`,对比度满足 WCAG AA)。
- **LLM anthropic 响应风格**(#22 · PR #23):`ProviderConfig` 新增 `responseStyle` 字段(openai/anthropic,缺省 openai 向后兼容);新增 `callAnthropic` 支持原生 Anthropic Messages API 端点(`x-api-key` + `anthropic-version`);配置页响应风格单选 UI。
- **LLM 流式响应**(#25 · PR #26):三种 LLM 源翻译采用流式响应,译文 token 边产生边渲染;provider 契约新增 `translateStream(req, onChunk)`;translate 流程从 `sendMessage` 请求-响应改为 `chrome.runtime.Port` 长连接;浮层渐进渲染 + 闪烁光标 + `aria-live` 通告;requestAnimationFrame 节流合批。三源流式协议:OpenAI SSE `choices[0].delta.content` / Anthropic SSE `content_block_delta` / Ollama NDJSON `message.content`。
- **popup 设置入口**(#35 · PR #38):点击工具栏 icon 弹出 400×600 配置面板;抽取共享组件 `shared/ui/SourceConfigPanel.vue`,popup 与 options 共用;深色 header + 可滚动主体 + 底部操作栏;卡片折叠(默认展开活跃卡);打开即聚焦目标语言输入框;popup/options 经 `chrome.storage.local` 实时同步。
- **译文 markdown 可读渲染**(#36 · PR #39):浮层 done 阶段将译文从纯文本升级为 markdown 渲染(标题/列表/加粗/代码块/引用/链接);`buildPrompt` 追加 markdown 结构保留指示(三源统一);引入 DOMPurify sanitize 清除 script/onerror/javascript:/iframe 等恶意 payload,链接强制 `target="_blank" rel="noopener noreferrer"`。
- **LLM 类型统一为响应风格**(#43 · PR #44):取消 LLM 类 type 子分组(openai-compatible/ollama),`ProviderType` 收敛为 `'llm'|'google'|'microsoft'`,`responseStyle` 扩展为 openai/anthropic/ollama 统一区分协议;`createLLMProvider` 从 type 二级判断改为 responseStyle 三路分发;切换响应风格时 baseUrl 自动联动替换 + 测试结果复位;存量配置 on-read 无感迁移。

## 🐛 Bug 修复

- **BaseURL 追加固定 path 致 404**(#5 · PR #7):`callOpenAICompatible`/`callOllama` 不再在用户 `baseUrl` 后硬拼 `/v1/chat/completions`、`/api/chat`,改为直接用完整接口路径;修复填完整 URL(如火山方舟端点)时路径重复 404。
- **划词翻译默认目标语言不生效**(#8 · PR #9):`getTargetLang()` 此前只读 `navigator.language` 忽略 `settings.defaultTargetLang`;改为 async 优先读用户配置,为空回退浏览器首选语言。
- **manifest host_permissions 缺通配 HTTPS**(#29 · PR #32):`host_permissions` 仅含 localhost 与内置传统源端点,云端 LLM 端点被 CORS 拦截;增补 `https://*/*` 使 background SW 对任意 HTTPS 云端 LLM 端点具跨域 fetch 特权。
- **配置自有源点击无反应**(#27 · PR #33):fresh install 下「配置自有源」纯锚点点击无可见反应;改为 `@click.prevent` 触发 `addProvider()` + `nextTick` 后聚焦新卡片名称输入。
- **LLM 源下拉分组混乱**(#28 · PR #34):源类型下拉由 4 个平铺 option 改为 `<optgroup>` 分组(「LLM 接口配置」/「传统翻译」),去除误导性「云端/本地」后缀。

## ⚠️ 破坏性变更

- **BaseURL 语义变更**(#5 · PR #7):由「host」改为「完整接口路径」。存量仅填 host 的配置将失效,需用户在设置页补全完整路径;切换提供方类型可自动迁移已知默认值,未切换类型的存量自定义 host 需手动修正。(v0.1/v0.2 早期阶段,用户基数极小)
- **调整 v0.1「不内置任何模型接口」原则**(#14 · PR #15):内置传统翻译免 Key 公共端点作为用户可选免费源(非隐式兜底,源失败不自动切换,仅返回错误提示)。
- **LLM 配置数据模型变更**(#43 · PR #44):`type` 子分组(openai-compatible/ollama)收敛为 `responseStyle` 字段(openai/anthropic/ollama);存量配置 on-read 无感迁移(不回写存储),用户无需手动操作;回滚安全——还原代码后旧代码仍可读取原始旧 type 配置。
- **浏览器扩展权限变更**(#29 · PR #32):manifest 新增 `host_permissions 'https://*/*'`,用户安装/升级时可能见到权限确认提示(仅 HTTPS,非 `<all_urls>`,以平衡 Chrome Web Store 审核)。

## 🔌 API 变更

- **统一适配层接口**(#10 · PR #12):新增 `TranslationProvider` 接口、provider 注册/路由、`translateWithAdapter`/`testWithAdapter` 入口;`TranslateResult.errorType?: ErrorType`(可选,向后兼容);`ProviderConfig.category?` 字段;`ProviderType` 新增 `'google'|'microsoft'`;新增 `ProviderCategory`/`ErrorType` 类型。
- **生效源切换契约**(#14 · PR #15):`Message` 联合类型新增 `get-active-sources`/`set-active-source` 分支;新增 `ActiveSourcesResult` 接口;导出 `getActiveSources()`/`setActiveSource(id)`、`DEFAULT_ACTIVE_SOURCE_ID`/`BUILTIN_FREE_SOURCES` 等。
- **ProviderConfig.region**(#18 · PR #20):新增可选 `region?: string` 字段(向后兼容);`createTraditionalProvider` 有 Key 走官方端点、无 Key 行为不变。
- **ProviderConfig.responseStyle**(#22 · PR #23):新增可选 `responseStyle?: 'openai'|'anthropic'`(向后兼容);新增 `callAnthropic`。
- **流式契约**(#25 · PR #26):`TranslationProvider` 新增可选 `translateStream?(req, onChunk)`;新增 `TranslateChunk`/`StreamPortMessage` 类型与 `translateWithAdapterStream` 导出;既有 `translate()`/`test()` 路径不变。
- **renderMarkdown**(#36 · PR #39):`buildPrompt` 追加 markdown 保留指示(签名不变);新增 `shared/render/markdown.ts` 导出 `renderMarkdown(md)`。
- **ProviderType 收敛 + responseStyle 三路分发**(#43 · PR #44):`ProviderType` 由 `'openai-compatible'|'ollama'|'google'|'microsoft'` 改为 `'llm'|'google'|'microsoft'`;`responseStyle` 由 `'openai'|'anthropic'` 扩展为 `'openai'|'anthropic'|'ollama'`;`createLLMProvider` 路由改基于 `responseStyle`;`inferCategory` 参数改为 `string` 并新增 `'llm'` 识别,保留旧 type 兼容。

## 🚀 部署说明

- **隐私声明已更新**:全新安装默认选中微软翻译,文本默认外传给微软;用户可在配置页切换到 Google 免费源或自有源(如本地 Ollama,文本仅本机流转)。LLM 提供方扩展到原生 Anthropic Messages API 端点。详见 [PRIVACY-POLICY.md](../../knowledges/product-wiki/privacy/PRIVACY-POLICY.md)(#14 · PR #15、#22 · PR #23)。
- **存量配置无感迁移**:LLM 配置 `type` 子分组自动迁移为 `responseStyle`(on-read,不回写存储),无需用户操作;详见 [on-read-storage-migration](../../knowledges/context/development/on-read-storage-migration.md)(#43 · PR #44)。BaseURL 语义变更需存量 host 配置补全完整路径(#5 · PR #7)。
- **扩展权限**:新增 `host_permissions 'https://*/*'` 覆盖云端 LLM 端点,安装/升级时用户可能见到权限确认;Chrome Web Store 审核可能询问用途(#29 · PR #32)。
- **新增依赖**:`dompurify@3.4.11`(production)、`jsdom`(dev),content.js 体积增量 30.42KB + content.css 1.30KB,合计 31.72KB < 50KB 预算(#36 · PR #39)。
- **浮层 iframe 隔离**:划词翻译浮层改用 iframe 隔离宿主样式(PR #47,随本版发布)。
- **部署钩子**:项目未配置 `deploy.yml`,浏览器扩展商店发布流水线已延后到 v0.3,本版需自行打包部署。

## 📦 关联交付

- PRD 清单(官方 PRD,`releases/v0.2/<编号-标题>/PRD.md`):
  - `releases/v0.2/1-unified-adapter/PRD.md`
  - `releases/v0.2/2-builtin-fallback/PRD.md`
  - `releases/v0.2/3-traditional-apikey-config/PRD.md`
  - `releases/v0.2/4-source-picker-ui/PRD.md`
  - `releases/v0.2/5-llm-anthropic-style/PRD.md`
  - `releases/v0.2/6-llm-streaming/PRD.md`
  - `releases/v0.2/7-popup-settings/PRD.md`
  - `releases/v0.2/8-md-render/PRD.md`
  - `releases/v0.2/9-llm-type-unify/PRD.md`
- 逐 Issue 开发产物:`releases/v0.2/issue-{5,8,10,11,14,16,18,19,22,25,27,28,29,35,36,43}/`(PRD/DESIGN/PLAN/MEMORY/CHANGELOG)。
- 知识沉淀:
  - adr:`knowledges/adr/001-unified-translator-adapter-layer.md`、`002-llm-streaming-port-and-readablestream.md`、`003-markdown-render-sanitize.md`、`004-shared-component-variant.md`、`005-response-style-as-llm-protocol-discriminator.md`
  - feature:`knowledges/feature/translator/unified-adapter.md`、`streaming.md`、`popup-settings.md`、`markdown-render.md`、`llm-type-unify.md`
  - context:`knowledges/context/development/dompurify-lazy-init.md`、`on-read-storage-migration.md`、`coding-standard.md`、`knowledges/context/system/plugin-architecture.md`、`tech-stack.md`
  - runbook:`knowledges/runbook/e2e-and-build/index.md`

## 🤝 致谢

- 本轮迭代由 Prodflow 工作流驱动,所有功能事项与独立快修均已通过代码审查并合并到主干。
