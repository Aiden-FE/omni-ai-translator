# CHANGELOG — 配置页翻译源选择 UI 改造（#16）

## 新增功能

- **翻译源管理分区**（#16）：配置页分区标题由「LLM 提供方」升级为「翻译源管理」，移除旧「本插件不内置任何模型接口」提示，改为「未配置时使用免 Key 兜底翻译；配置自有源后覆盖兜底」兜底关系说明。
- **4 类源类型选择**（#16）：源类型下拉扩展为 openai-compatible / ollama / google / microsoft 四项；按类型条件渲染字段——LLM 类型（openai-compatible/ollama）显示 name/baseUrl/model/apiKey，传统类型（google/microsoft）显示 name/baseUrl/apiKey（不显示 model）。
- **当前生效源提示行**（#16）：顶部新增生效源提示行，经新契约 `get-active-sources` / `set-active-source` 读写，区分兜底态与自有源态：
  - 兜底态：明示「免 Key 兜底」，标注「待翻译文本将外传到 Google / 微软完成翻译」+ 隐私提示 + 「配置自有源 →」引导，并提供「测试连通」对当前内置免 Key 源测试。
  - 自有源态：显示生效源名称，兜底提示消失。
- **连通性测试扩展**（#16）：「测试连通」对 LLM、传统 API Key、免 Key 兜底源均生效，复用 `test-provider` 通道，结果 inline 展示（✅ 译文 / ❌ 错误，每卡独立）。
- **apiKey 占位符语义化**（#16）：传统源 apiKey placeholder 为「留空使用免 Key 兜底；填入则走官方 API」；LLM 源保持「API Key（Ollama 可留空）」。
- **可访问性增强**（#16）：生效源提示行用文字 + `data-state` 语义标签 + `role="status"`/`aria-label` 表达状态（非纯颜色）；兜底态隐私提示文字用 `#4b5563`（gray-600），在 `#f3f4f6` 底上对比度≈6.8:1，满足 WCAG AA；支持 `prefers-reduced-motion`。

## Bug 修复

- 修复删除当前生效源时横幅短暂停留在已删除源的时序问题：`removeProvider` 改为先回退到默认兜底源再过滤保存。
- 源类型切换时清除该卡旧测试结果，避免展示失效结果。

## API 变更

- 配置页生效源读写由直接 `getSettings`/`setSettings`（activeProviderId）切换为新契约消息 `get-active-sources` / `set-active-source`，与后端 #10/#14 适配层对齐。
- 目标语言保存改为 read-merge `setSettings`，避免覆盖 `activeProviderId`。

## 破坏性变更

无。v0.1 既有 LLM 配置可见可编辑；既有 `activeProviderId`（用户 provider id）经 `getActiveSources` 自动解析命中，无数据迁移。e2e 选择器（`+ 添加提供方`/`.provider-card`/`名称`/`base-url` testid/`模型名`/`启用`/`留空则使用浏览器首选语言`）保持不变。

## 部署注意事项

- 依赖后端契约 #10/#14（已合并）：`get-active-sources` / `set-active-source` / `test-provider` 通道在 `background.ts` 已就绪。
- 传统 API Key 源「有 Key 走官方 API」后端实现属 PRD #3 范围（未实现）：本轮传统源 baseUrl/apiKey 字段为 UI 信息展示，连通性测试实际走免 Key 端点（`createTraditionalProvider` 忽略 baseUrl/apiKey）。PRD #3 启用后端能力时 UI 无需再改。
- 已知限制：`saveTargetLang`（read-merge 写 settings）与 `set-active-source`（后端 read-merge 写 settings）在极小概率下存在 whole-object 写入竞争；需后端提供字段级 settings 写入方可彻底消除，超出本 UI 任务范围。低概率、不影响 e2e。
