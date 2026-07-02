# DESIGN — 配置页翻译源选择 UI 改造（#16）

## 1. 背景与目标

v0.1 `entrypoints/options/App.vue` 仅面向 LLM（标题「LLM 提供方」、2 类源下拉、单条共享测试消息、`activate` 经 `setSettings` 写 activeProviderId）。v0.2 后端契约（#10/#14）已就绪：`get-active-sources`/`set-active-source`/`test-provider` 三通道在 `background.ts` 已 wire。本任务把配置页升级为多类源统一管理界面，复用既有契约，不改后端。

目标：单文件改造 `App.vue`，满足 Issue #16 全部验收，不破坏 e2e 回归选择器。

## 2. 技术选型与方案对比

| 方案 | 描述 | 取舍 |
|---|---|---|
| A. 单文件改造 App.vue，复用既有契约消息 | 横幅读 `get-active-sources`、写 `set-active-source`；卡片编辑仍用 `getProviders/setProviders`；测试用 `test-provider` | ✅ 选定：最小改动、复用就绪契约、不引入新模块、可回归 |
| B. 抽取 source-picker 子组件 | 把横幅+卡片拆为子组件 | 放弃：v0.1 单文件结构，拆组件超范围、增加回归面 |
| C. 直接读 storage 不走消息 | 横幅直接 `getSettings`/`getProviders` | 放弃：Issue 明确要求切换到新契约 `get-active-sources`/`set-active-source` |

**选定方案 A**。回滚方式：单文件 git revert `App.vue`。

## 3. 架构与数据流

```
App.vue (options)
  ├─ onMounted → sendMessage('get-active-sources') → { sources, activeSourceId }
  │              + getProviders() → 用户源卡片列表（编辑用）
  │              + getSettings() → defaultTargetLang
  ├─ 横幅 effective banner
  │    ├─ activeSourceId.startsWith('builtin:') → 兜底态
  │    │     value="免 Key 兜底" / note=隐私提示+外传去向 / action="配置自有源→" / [测试连通]
  │    └─ else → 自有源态
  │        value=<源名称> / note="翻译请求将发送到该源。"
  ├─ 源卡片 v-for providers（.provider-card）
  │    ├─ 类型下拉 4 项 → onTypeChange 切换 baseUrl 默认 + 显隐 model 行
  │    ├─ LLM 行: baseUrl[data-testid=base-url] + model[placeholder=模型名]
  │    ├─ 传统行: baseUrl（无 model）
  │    ├─ apiKey 行: placeholder 按类型 + [测试连通] → 每卡 inline 结果
  │    └─ [启用/已启用] → set-active-source(id) / 回兜底
  └─ + 添加提供方 → setProviders
```

- 横幅读：`get-active-sources`（合并内置源+用户源 + 解析后的 activeSourceId）。
- 横幅写（切源）：`set-active-source`。
- 卡片编辑：`setProviders`（沿用）。
- 目标语言保存：read-merge `setSettings({...await getSettings(), defaultTargetLang})`，避免覆盖 activeProviderId。
- 测试：`test-provider`（testWithAdapter，对任意类型生效）。

## 4. 关键设计点

### 4.1 横幅状态判定
- `isFallback = activeSourceId.startsWith('builtin:')`
- 兜底态：从 `sources` 找到 activeSourceId 对应内置源配置（供横幅测试连通用）。
- 自有源态：从 `providers` 找到 activeSourceId 对应源名称。

### 4.2 条件字段渲染
- `isLlmType(t) = t==='openai-compatible' || t==='ollama'`
- LLM：显示 model 行；传统：隐藏 model 行（`v-if="isLlmType(p.type)"`）。
- 类型切换 `onTypeChange`：若 baseUrl 命中已知默认值集合，替换为新类型默认值（沿用 v0.1 逻辑，扩展 4 类型）。

### 4.3 每卡 inline 测试结果
- `testMsgs = ref<Record<string, string>>({})`，按 provider id 存「测试中…/✅…/❌…」。
- 横幅兜底测试结果 `bannerTestMsg = ref('')`。

### 4.4 启用/toggle 回兜底
- `activate(id)`：若 id 已是当前 activeSourceId 且为自有源 → 改调 `set-active-source('builtin:microsoft')`（回兜底）；否则 `set-active-source(id)`。完成后 reload `get-active-sources`。
- e2e 点击「启用」一次 → 正常 set-active-source，行为不变。

### 4.5 默认 baseUrl（4 类型）
- openai-compatible: `https://api.openai.com/v1/chat/completions`
- ollama: `http://localhost:11434/api/chat`
- google: `https://translation.googleapis.com`
- microsoft: `https://api.cognitive.microsofttranslator.com/translate`
- 已知默认值集合含历史 host 形式 + 上述 4 项，切换类型时命中则替换。

### 4.6 占位符
- 名称：`名称`（不变，e2e 依赖）
- baseUrl：LLM 沿用 `baseUrlPlaceholder(type)`；传统 `默认官方端点，可改`
- model：`模型名`（LLM 显示，e2e 依赖）
- apiKey：传统 `留空使用免 Key 兜底；填入则走官方 API`；LLM `API Key（Ollama 可留空）`
- 目标语言：`留空则使用浏览器首选语言`（不变，e2e 依赖）

## 5. 兼容性与风险

- **向后兼容**：既有 `activeProviderId`（用户 provider id）经 `getActiveSources` 在 providers 命中；既有 LLM 配置卡片可见可编辑；无数据迁移。
- **传统源后端缺口**：`createTraditionalProvider` 忽略 baseUrl/apiKey，本轮传统源测试走免 Key 端点；UI 已就绪，PRD #3 启用「有 Key 走官方 API」时 UI 无需再改。
- **e2e 回归**：保持 `+ 添加提供方`/`.provider-card`/`名称`/`base-url` testid/`模型名`/`启用`/`留空则使用浏览器首选语言` 选择器不变。
- **可访问性**：横幅 `data-state` 语义标签 + 文字（非纯颜色）；隐私提示文字 `#4b5563`（gray-600，在 `#f3f4f6` 上对比度≈6.9:1，满足 WCAG AA 正文）。

## 6. 测试策略

- `pnpm typecheck`（vue-tsc）必须通过。
- `pnpm build`（wxt build）必须通过。
- `pnpm test`（vitest 单测）回归通过（适配层单测不受影响）。
- e2e（playwright）选择器未破坏；本轮环境无浏览器时以 typecheck+build+单测为准，e2e 由后续 CI/手动验收。
- 手动用例场景：兜底态横幅可见+隐私提示+测试连通；添加 google 源→字段无 model→测试连通；启用自有源→横幅切换；点已启用→回兜底；v0.1 LLM 卡片可见可编辑。
