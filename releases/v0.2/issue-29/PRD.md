# PRD — Issue #29 host_permissions 未覆盖云端 LLM 端点

## 任务信息

| 项 | 内容 |
|---|---|
| Issue | #29 【AI】【bug】manifest - host_permissions 未覆盖云端 LLM 端点,非 CORS 友好 provider 请求失败 |
| 类型 | BUG;严重程度:严重 |
| 迭代版本 | v0.2 |
| 关联 PRD Issue | #1 (unified-adapter) |
| 代码位置 | `wxt.config.ts` → manifest.host_permissions |

## 问题

`wxt.config.ts` 的 `manifest.host_permissions` 仅含 `http://localhost/*`、`http://127.0.0.1/*` 与三个内置传统源端点(`translate.googleapis.com`、`edge.microsoft.com`、`api.cognitive.microsofttranslator.com`),无通配 HTTPS。

用户配置的云端 LLM 端点(`https://*`,如 openai-compatible 云端 / anthropic 原生 / ARK 等)不在 host_permissions 内,background Service Worker 的 `fetch` 不具备跨域特权,仅靠目标端点 CORS 头决定是否放行。结果:

- CORS 友好端点(如 ARK)可请求,未普遍暴露问题。
- 非 CORS 友好 provider(部分 OpenAI 兼容网关 / 自建反代)被跨域拦截,划词翻译报"翻译请求失败请检查网络或源地址"。

## 期望行为

用户配置的任意云端 LLM 端点均可可靠 fetch,不受 CORS 限制。

## 验收标准

1. `wxt.config.ts` 的 `host_permissions` 数组包含 `'https://*/*'`。
2. 构建产物 `.output/chrome-mv3/manifest.json` 的 `host_permissions` 含 `https://*/*`(构建产物不提交,仅验证)。
3. 配置非 CORS 友好的云端 LLM 端点为生效源,划词翻译不再被 CORS 拦截。
4. 现有 localhost(ollama)与传统源端点行为不退化。
5. 本地 localhost / 127.0.0.1 端点仍由既有条目覆盖,无需重复声明。
