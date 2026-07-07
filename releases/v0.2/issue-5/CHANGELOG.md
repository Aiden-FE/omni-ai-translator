# CHANGELOG — Issue #5

## Bug 修复

- **修复 LLM 适配层 BaseURL 追加固定 path 导致请求 URL 错误**(#5):`shared/llm.ts` 中 `callOpenAICompatible` 与 `callOllama` 不再在用户配置的 `baseUrl` 后硬拼接 `/v1/chat/completions`、`/api/chat`,改为直接使用用户填写的完整接口路径(仅去除末尾多余斜杠)。修复填完整 URL(如火山方舟端点)时请求路径重复导致 404 的问题。

## 配置 UI 变更

- `entrypoints/options/App.vue`:新增提供方默认 BaseURL 改为完整路径(openai-compatible: `https://api.openai.com/v1/chat/completions`;ollama: `http://localhost:11434/api/chat`),按类型区分。
- BaseURL 输入框 placeholder 改为按提供方类型动态显示完整路径示例,并新增 `data-testid="base-url"` 稳定定位。
- 新增 `onTypeChange`:切换提供方类型时,若当前 BaseURL 为已知默认值(含历史 host 形式 `https://api.openai.com`、`http://localhost:11434`),自动替换为新类型的完整路径默认值。
- 设置页 hint 文案明确「BaseURL 需填写完整接口路径,代码不再自动追加路径」。
- `shared/types.ts`:`ProviderConfig.baseUrl` 注释补充「完整接口路径」语义。

## 测试变更

- `e2e/translate.spec.ts`:BaseURL 选择器由 `input[placeholder="BaseURL"]` 改为 `getByTestId('base-url')`(解耦动态 placeholder),填入值由纯 host 改为完整路径 `${mockUrl}/v1/chat/completions`,与新契约一致。

## 破坏性变更

- **BaseURL 语义变更**:由「host」改为「完整接口路径」。存量仅填 host 的配置将失效(请求打到 host 根路径),需用户补全完整路径。当前处于 v0.1/v0.2 早期阶段,用户基数极小,UI 文案与默认值已同步引导。切换提供方类型可自动迁移已知默认值;未切换类型的存量自定义 host 需手动修正。

## API 变更
无(请求/响应结构、headers、解析逻辑均未变)。

## 部署注意事项
- 无需数据迁移脚本;存量配置需用户在设置页补全完整接口路径。
- 本 Issue 不涉及 anthropic 响应风格支持(独立 Issue #6 处理)。
