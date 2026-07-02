# PRD — Issue #5

## 背景

LLM Translator 通过 `shared/llm.ts` 适配层调用用户配置的 LLM 提供方。当前 `callOpenAICompatible` 与 `callOllama` 在用户配置的 `baseUrl` 之后硬拼接固定 path(`/v1/chat/completions`、`/api/chat`),当用户填写的是**完整接口 URL**(如火山方舟 `https://ark.cn-beijing.volces.com/api/coding/v3/v1/chat/completions`)时,最终请求 URL 变成 `.../v1/chat/completions/v1/chat/completions`,接口返回 404,翻译与连通性测试失败。

同时,设置页 BaseURL 默认值 `https://api.openai.com` 与 placeholder `BaseURL` 表述歧义,用户难以分辨应填 host 还是完整路径。

## 目标

让用户填写**完整接口路径**,代码不再追加任何固定 path,仅去除末尾多余斜杠后直接使用。同步消除配置 UI 的歧义。

## 类型
bug(Issue #5)

## 验收标准

1. `shared/llm.ts` 中 `callOpenAICompatible` 与 `callOllama` 两处均不再追加固定 path(`/v1/chat/completions`、`/api/chat`),直接使用用户配置的完整 URL(仅去除末尾多余斜杠)。
2. 用户填完整路径(如火山方舟示例)可正常翻译并通过连通性测试。
3. 用户填纯 host(如 `https://api.openai.com`)时,设置页 UI/文案明确「需填完整接口路径」,避免歧义。
4. `ProviderConfig` 类型与设置页 UI(placeholder/说明文案)相应更新;默认示例值同步调整为完整路径。
5. 既有 OpenAI 与 Ollama 场景回归通过(typecheck + lint + e2e)。

## 明确不做

- 不新增 anthropic 响应风格支持(独立 Issue #6 处理)。
- 不重构翻译源适配层(v0.2 路线图事项,另行处理)。
- 不改变请求 body 结构、headers、响应解析逻辑。

## 关联
- 所属迭代:v0.2
- 关联 Issue:#6(anthropic 响应风格,依赖本 Issue 的完整 URL 假设)
