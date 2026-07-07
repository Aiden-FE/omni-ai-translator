# MEMORY — Issue #5

## 任务概要
- **Issue**: #5 【AI】【bug】LLM 适配层 - 配置 baseUrl 后追加固定 path 导致请求 URL 错误
- **类型**: BUG(标签 `AI` + `bug`)
- **迭代版本**: v0.2(里程碑:v0.2 - 翻译源配置闭环 #1)
- **基础分支**: master → 任务分支 `#5`
- **仓库**: git@github.com:Aiden-FE/llm-translator.git
- **平台**: GitHub Aiden-FE/llm-translator

## 需求摘要(来自 Issue 描述)
配置 OpenAI 兼容提供方时,用户填入完整接口 URL(如火山方舟
`https://ark.cn-beijing.volces.com/api/coding/v3/v1/chat/completions`),
代码在 `baseUrl` 后又硬拼接固定 path,导致请求 URL 重复(`/v1/chat/completions/v1/chat/completions`)→ 404。

期望:不应由代码追加 path,由用户提供完整路径;代码仅去除末尾斜杠后直接使用。

## 关键代码位置
- `shared/llm.ts:18` — `callOpenAICompatible`:`${baseUrl}/v1/chat/completions` 硬拼接
- `shared/llm.ts:46` — `callOllama`:`${baseUrl}/api/chat` 硬拼接
- `shared/types.ts:11` — `ProviderConfig.baseUrl`
- `entrypoints/options/App.vue:44` — 默认值 `'https://api.openai.com'`(需改为完整路径)
- `entrypoints/options/App.vue:131-133` — BaseURL 输入框 placeholder `"BaseURL"`(需明确「完整接口路径」)
- `entrypoints/background.ts` — 调用 translate/testProvider(无需改)

## 验收标准(来自 Issue)
1. `shared/llm.ts` OpenAI 兼容与 Ollama 两处均不再追加固定 path,直接用用户完整 URL(仅去末尾斜杠)。
2. 用户填完整路径(火山方舟示例)可正常翻译与连通性测试。
3. 用户填纯 host 时,文档/UI 明确「需填完整接口路径」或连通性测试给清晰错误提示。
4. `ProviderConfig` 类型与设置页 UI(placeholder/文案)相应更新;默认示例值改为完整路径。
5. 既有 OpenAI 与 Ollama 场景回归通过(连通性测试 + 划词翻译 e2e)。

## 关联任务
- #6(improvement):新增 anthropic 响应风格支持。本 Issue 仅修 URL 拼接,**不**做 anthropic 风格。
  #6 假设本 Issue 已修复 URL 拼接;两者协同但范围分离。

## 依赖链元数据
- 并发安全等级: `parallel-safe`(无上游代码依赖,#6 与本 Issue 范围分离)
- MR 基线策略: `base-branch`(从基础分支 master 创建 PR)
- 上游依赖: 无
- 推荐合并顺序: #5 先于 #6 合并(#6 依赖完整 URL 假设)

## 环境踩坑(自动决策记录)
- **决策点**: 依赖恢复 — `pnpm install` 的 `postinstall: wxt prepare` 在任务 worktree 失败。
- **现象**: worktree 路径含 `#`(`master-#5`),wxt 内部 vite-node 将 `#` 按 URL fragment 编码为 `%235`,导致 `Failed to load url .../master-%235/entrypoints/background.ts`,prepare 中断,`.wxt/types` 未完整生成。
- **采用值**: ① 从主仓库 `/home/admin/dev/prodflow/ai-projects/llm-translator/.wxt` 复制到 worktree(entrypoints 一致,类型可复用;`.wxt` 在 .gitignore 中,不影响 git);② 后续校验直接调用 `./node_modules/.bin/vue-tsc --noEmit` 与 `./node_modules/.bin/eslint`,绕过 `pnpm <script>` 前置的 deps status check(该 check 会重跑失败的 install)。
- **依据**: 依赖已实际安装(node_modules 完整),仅 wxt prepare 这一步受路径编码影响;typecheck 直接调二进制可正常通过(已验证 exit 0)。
- **风险**: `.wxt` 类型为复制快照,若 entrypoints 结构变更需重新生成(本 bug 不改 entrypoints 结构,无影响);e2e/build 依赖 `wxt build`,若需跑需在主仓库或修复路径编码后进行。
- **回滚**: 删除 worktree 内复制的 `.wxt` 目录即可,无副作用。

## 技术约束
- Chrome MV3 + WXT + Vue 3 + TS,Node ≥ 22,pnpm 11。
- 不内置任何模型接口;API Key 仅存本地。
- commit 规范:`<type>(#5): <description> [AICODING]`。
