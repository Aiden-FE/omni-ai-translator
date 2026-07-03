# MEMORY — Issue #29 host_permissions 未覆盖云端 LLM 端点

## 任务元数据

| 项 | 内容 |
|---|---|
| Issue | #29 【AI】【bug】manifest - host_permissions 未覆盖云端 LLM 端点,非 CORS 友好 provider 请求失败 |
| 类型 | BUG;严重程度:严重 |
| 迭代版本 | v0.2 |
| 仓库 | Aiden-FE/llm-translator |
| 基础分支 | master |
| 任务分支 | issue-29 |
| 关联 PRD Issue | #1 (unified-adapter) |
| 里程碑 | v0.2 - 翻译源配置闭环 |
| 并发安全 | parallel-safe(与 #27 并行,不同文件) |
| MR 基线 | base-branch;推荐合并顺序: #29 可独立先合并 |
| 上游 Issue/MR | 无 |

## BUG 摘要

`wxt.config.ts` 的 `manifest.host_permissions` 仅含 `http://localhost/*`、`http://127.0.0.1/*` 与三个内置传统源端点(googleapis/edge/microsofttranslator),无通配 HTTPS。用户配置的云端 LLM 端点(`https://*`,如 openai-compatible 云端/anthropic 原生/ARK 等)不在权限内,background SW fetch 仅靠 CORS:CORS 友好端点(如 ARK)可请求;非 CORS 友好 provider(部分 OpenAI 兼容网关/自建反代)被跨域拦截,划词翻译报"翻译请求失败请检查网络或源地址"。

## 技术约束

- **MV3 host_permissions / SW 绕过 CORS**:Chrome MV3 中,声明在 `host_permissions` 的域名,background Service Worker 的 `fetch` 具备跨域特权(绕过 CORS)。未声明则仅靠目标端点 CORS 头决定是否放行。
- **构建产物 vs 源**:`.output/chrome-mv3/manifest.json` 是 `wxt build` 构建产物(通常 gitignore),只改源文件 `wxt.config.ts`,不提交构建产物。
- **store 审核平衡**:`https://*/*` 较 `<all_urls>` 更平衡——只放行 HTTPS,不覆盖所有协议;但仍是宽泛权限,store 审核可能询问用途,需在 CHANGELOG/PR 说明(用户自配云端 LLM 端点跨域 fetch,绕过 CORS)。
- **ollama 本地端点**:已由 `localhost`/`127.0.0.1` 覆盖,无需额外处理。

## 修复方案

在 `wxt.config.ts` 的 `host_permissions` 数组增补 `'https://*/*'`。放置位置:数组末尾(localhost 与传统源之后),注释说明用途。

## 依赖链元数据

- 无上下游 PR 依赖;#29 可独立先合并。
- 与 #27 并行安全(不同文件)。

## 自动决策记录

- 无人值守模式:采用 Issue 建议的 `https://*/*`(而非 `<all_urls>`),因 Issue 明确指出 store 审核平衡考虑,且无用户额外输入推翻此默认。留痕于 DESIGN.md。
- 无前端界面,无 UX 实现要求(BUG 为网络层 manifest 权限修复)。

## 执行状态

- 代码改动:`wxt.config.ts` host_permissions 增补 `'https://*/*'`(commit c1bf216)。
- 依赖恢复:pnpm install 完成(postinstall wxt prepare 通过)。
- 构建验证:`pnpm build` 通过,`.output/chrome-mv3/manifest.json` host_permissions 已含 `https://*/*`。
- 构建产物 `.output/` 已确认 gitignore,不提交。

## 待沉淀知识

知识沉淀: 待补(context 要点清单)

- **context**: MV3 host_permissions 权限模型 — background Service Worker 对声明在 `manifest.host_permissions` 的域名具备跨域 fetch 特权(绕过 CORS);未声明域名仅靠目标端点 CORS 头放行。用户自配动态域名(如云端 LLM 端点)需通配 `https://*/*` 覆盖,而非逐个枚举。
- **context**: store 审核权衡 — `https://*/*` 较 `<all_urls>` 更平衡(仅 HTTPS),但仍属宽泛权限,审核会询问用途;需说明"用户自配云端 LLM 端点跨域 fetch 绕过 CORS"。
- 沉淀判断:改动仅 1 行,但涉及 MV3 网络权限模型决策,有 context 沉淀价值;由协调器主会话通过 prodflow-knowledge-* 落库。
