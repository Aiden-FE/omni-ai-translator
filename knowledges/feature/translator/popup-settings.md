# popup 设置入口与翻译源配置共享组件

## 功能目标

点击工具栏 icon 弹出 popup 作为翻译源配置主入口，用户无需打开 options 页即可完成源增删改、切换生效源、连通性测试与目标语言设置；popup 与 options 页共用同一份源配置组件，消除双份维护。

## 业务规则

- 后端契约不变：`ProviderType` 枚举、消息通道（`get-active-sources` / `set-active-source` / `test-provider`）、`shared/storage.ts` 均不变；源类型分组是 UI 层聚合，不改枚举。
- 源类型下拉用 `<optgroup>` 语义分组为「LLM 接口配置」（openai-compatible / ollama）与「传统翻译」（google / microsoft），移除「云端/本地」误导后缀（bug #28 在 popup 生效）。
- 兜底态「配置自有源」由纯锚点改为触发 `addProvider()` 并聚焦新卡片名称输入（bug #27 在 popup 生效）。
- 配置同步：popup 写入 `chrome.storage.local` 后生效源切换即时反映到划词翻译；options 页已打开则下次聚焦刷新。
- popup 固定尺寸 400×600，内容超出纵向滚动，卡片折叠降密度；popup 底部「打开全部设置」→ `chrome.runtime.openOptionsPage()`。

## 状态流转

生效源横幅两态（`role="status"`）：

- **兜底态**（`activeSourceId` 以 `builtin:` 开头）：显示「免 Key 兜底」+ 隐私提示 + 「配置自有源」入口（popup 为全宽主按钮，options 为横幅内锚点）+ 「测试连通」。
- **自有源态**：显示当前生效源名称 + 「翻译请求将发送到该翻译源」。

源卡片（popup 变体）：

- **展开/折叠**：卡片头部可点击切换；默认展开活跃卡、折叠非活跃卡；名称输入 `@click.stop` 阻止冒泡，避免编辑名称时意外折叠。
- **新建卡片**：popup 变体默认展开新建卡并滚动入视口、聚焦名称输入。

## 权限控制

- 无新增权限；复用既有 content/background 消息通道与 `chrome.storage.local`。
- popup 通过 `chrome.runtime.sendMessage` 调用与 options 相同的后端消息处理。

## UI 或交互要点

- 共享组件 `SourceConfigPanel.vue` 接受 `variant: 'popup' | 'options'` prop（默认 `options`），内部按 variant 切换布局细节；外部容器 class 为 `source-config--{variant}`。
- popup 打开即聚焦首个可交互项（兜底态为「配置自有源」按钮，自有源态为目标语言输入）。
- popup 布局：header + 可滚动 body + footer；footer（添加提供方 + 打开全部设置）放在 `popup/App.vue`（scrollable body 之外），通过 `defineExpose` 暴露 `addProvider` / `focusFirst` 供 footer 按钮调用，避免 footer 随 body 滚动。
- popup index.html 的 `body` 需置 `margin: 0`，否则默认 8px margin 使实际尺寸变为 416×616。
- 可访问性：横幅 `role="status"`；所有可操作元素 Tab 可达 + 可见聚焦环（`outline: 2px solid #1f2937`）；`<optgroup>` 分组供读屏识别类目；`@media (prefers-reduced-motion: reduce)` 关闭过渡。

## 相关文件

- `shared/ui/SourceConfigPanel.vue` — 共享源配置面板（variant prop 控制差异）
- `entrypoints/popup/App.vue` — popup 入口（400×600 容器 + footer）
- `entrypoints/options/App.vue` — options 页（复用共享组件，行为等价）
- `shared/storage.ts` — `getProviders` / `setProviders` / `getSettings` / `setSettings`（只读复用）
- `shared/translator/builtin-sources.ts` — `DEFAULT_ACTIVE_SOURCE_ID`（`builtin:microsoft`）

## 相关模块

- [统一翻译源适配层](unified-adapter.md) — 源类型枚举、消息通道、生效源切换基础
