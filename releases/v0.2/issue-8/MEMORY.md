# MEMORY — Issue #8

## 任务概要
- **Issue**: #8 【AI】【bug】划词翻译 - 配置的默认目标语言不生效,始终用浏览器首选语言
- **类型**: BUG(标签 `AI` + `bug`)
- **迭代版本**: v0.2(里程碑:v0.2 - 翻译源配置闭环 #1)
- **基础分支**: master → 任务分支 `#8`
- **仓库**: git@github.com:Aiden-FE/llm-translator.git
- **平台**: GitHub Aiden-FE/llm-translator

## 需求摘要(来自 Issue 描述,BUG Issue 无独立 PRD)
用户在设置页配置「默认目标语言」(如 zh-CN 浏览器下配置「简体中文」),但划词翻译时该配置完全不生效,prompt 始终用浏览器首选语言(navigator.language)作为目标语言。

**根因**:`entrypoints/content.ts:14` 的 `getTargetLang()` 只读 `navigator.language`,完全没有读取 storage 中用户配置的 `settings.defaultTargetLang`。设置页 `entrypoints/options/App.vue` 写入的 `defaultTargetLang` 仅在 options 页自身使用,划词翻译链路(content.ts → background.ts → llm.ts)全程未读取该值,配置被彻底绕过。

**期望**:
1. 划词翻译时,content.ts 优先读取 storage 的 `settings.defaultTargetLang` 作为目标语言。
2. `defaultTargetLang` 非空(且非空白)时,使用用户配置值。
3. `defaultTargetLang` 为空时,回退到 `navigator.language` 经语言映射后的值(保持现有回退逻辑)。
4. 设置页 hint「留空则使用浏览器首选语言」的承诺在划词翻译链路真正生效。
5. 既有场景回归:typecheck + lint + e2e(划词翻译全链路 mock 译文)通过。
6. 连通性测试(testProvider)不受影响(它硬编码 targetLang='中文')。

## 关键代码位置
- `entrypoints/content.ts:14-30` — `getTargetLang()`(bug 根因,只读 navigator.language)
- `entrypoints/content.ts:49-62` — `doTranslate()`(调用 getTargetLang 并 sendMessage)
- `entrypoints/background.ts:15-25` — translate 消息处理(读 settings 但仅用于找 provider,payload.targetLang 来自 content)
- `shared/storage.ts:9-13,35-37` — `DEFAULT_SETTINGS.defaultTargetLang=''`、`getSettings()`
- `shared/types.ts:31-35` — `Settings.defaultTargetLang`
- `entrypoints/options/App.vue:31-53` — options 页 `defaultTargetLang()` 映射 + onMounted 读取(与 content.ts 的映射表重复)
- `shared/llm.ts:6-9` — `buildPrompt`(消费 req.targetLang)
- `e2e/translate.spec.ts` — 划词翻译全链路 e2e(mock 译文固定「你好,世界」,未断言 prompt 中的 targetLang)
- `e2e/mock-server.ts:7-10` — `getLastRequestBody()` 已暴露最近请求体(可用于断言 prompt)

## 修复方案(最小改动)
- `content.ts` 的 `getTargetLang()` 改为 async:先 `await getSettings()`,返回 `settings.defaultTargetLang?.trim() || <navigator.language 映射>`。
- `doTranslate` 内 `getTargetLang()` 调用改为 `await`。
- 直接 import `@/shared/storage` 的 `getSettings`(chrome.storage 在 content script 可用)。
- 语言映射表保持现状(映射抽离到 shared 作为后续改进,本 bug 不做,符合 Issue「建议处理方向」)。

## 关联任务
- 关联 PRD Issue: 无(由 v0.1 划词翻译功能引入的 bug)。
- 与 #5(URL 拼接修复)、#6(anthropic 风格)范围分离,无代码依赖。

## 依赖链元数据
- 并发安全等级: `parallel-safe`(无上游代码依赖)
- MR 基线策略: `base-branch`(从基础分支 master 创建 PR)
- 上游依赖: 无
- 上游 Issue/MR: 无
- 推荐合并顺序: 无约束

## 环境踩坑(自动决策记录)
- **决策点**: 依赖恢复 — `pnpm install` 的 `postinstall: wxt prepare` 在任务 worktree 失败。
- **现象**: worktree 路径含 `#`(`master-#8`),wxt 内部 vite-node 将 `#` 按 URL fragment 编码为 `%238`,导致 `Failed to load url .../master-%238/entrypoints/background.ts`,prepare 中断,`.wxt/types` 未完整生成。
- **采用值**: ① 从主仓库 `/home/admin/dev/prodflow/ai-projects/llm-translator/.wxt` 复制到 worktree(entrypoints 一致,类型可复用;`.wxt` 在 .gitignore 中,不影响 git);② 后续校验直接调用 `./node_modules/.bin/vue-tsc --noEmit` 与 `./node_modules/.bin/eslint`,绕过 `pnpm <script>` 前置的 deps status check(该 check 会重跑失败的 install)。已验证两者 exit 0。
- **依据**: 依赖已实际安装(node_modules 完整),仅 wxt prepare 这一步受路径编码影响;typecheck/lint 直接调二进制可正常通过。与 #5 同款处理。
- **风险**: `.wxt` 类型为复制快照,若 entrypoints 结构变更需重新生成(本 bug 不改 entrypoints 结构,无影响);e2e 依赖 `wxt build`,同样受 `#` 路径影响,见下方 e2e 执行策略。
- **回滚**: 删除 worktree 内复制的 `.wxt` 目录即可,无副作用。

## e2e 执行策略(自动决策记录)
- **决策点**: 验收标准 #5 要求 e2e 通过,但 `pnpm e2e`(`wxt build && playwright test`)在 `#` 路径下 wxt build 失败。
- **采用值**: 在 `#`-free 临时路径构建运行。方案:将 worktree 源码 rsync 到 `/tmp/lt-#8-free`(或不含 `#` 的临时目录),复用 worktree 的 node_modules(符号链接)与 `.wxt`,在该临时目录执行 `wxt build` 生成 `.output`,再用 playwright 跑 e2e。若 rsync+symlink 方案因 vite realpath 仍失败,回退为「主仓库临时切到 #8 分支构建运行后切回 master」(主仓库路径无 `#`,wxt build 可用)。
- **依据**: e2e 必须在含本 bug 修复的代码上运行才有意义;主仓库路径无 `#` 是已验证可构建环境。
- **风险**: 临时目录构建可能因路径差异产生偏差,故优先在主仓库 #8 分支构建(代码与 worktree 同源)。
- **回滚**: 删除临时目录;主仓库切回 master 即可。

## 技术约束
- Chrome MV3 + WXT + Vue 3 + TS,Node ≥ 22,pnpm 11。
- content script 可直接 import shared/storage(chrome.storage 在 content script 可用)。
- commit 规范:`<type>(#8): <description> [AICODING]`。
