# DESIGN — Issue #8

## 背景与目标

见 `PRD.md`。目标:让 content.ts 的 `getTargetLang` 优先读取用户配置的 `settings.defaultTargetLang`,留空时回退到 `navigator.language` 映射值。

## 方案选型(自动批准,记录取舍)

### 方案 A:content.ts 的 `getTargetLang()` 改为 async,内部读 settings(推荐)
- 改动:`getTargetLang` 由同步改 async,先 `await getSettings()`,返回 `settings.defaultTargetLang?.trim() || <navigator.language 映射>`;`doTranslate` 内调用处加 `await`。import `getSettings` from `@/shared/storage`。
- 优点:最小改动(单文件),逻辑收敛在 content.ts,与 options 页 `defaultTargetLang()` 的回退语义一致;chrome.storage 在 content script 可用;不改动 background/payload 协议。
- 缺点:`getTargetLang` 由同步变 async,调用点需 await(仅 doTranslate 一处)。
- 风险:低。映射表仍与 options 页重复(Issue 已明确抽离作为后续改进)。

### 方案 B:在 background.ts 读取 settings 后覆盖 payload.targetLang
- 改动:background.ts 的 translate 分支读取 settings 后,用 `settings.defaultTargetLang` 覆盖 `message.payload.targetLang`。
- 优点:改动也较小。
- 缺点:**破坏语义** —— content.ts 已传 targetLang(浏览器语言),background 覆盖会让「用户配置」与「浏览器语言」决策点分裂,且 testProvider 也走 background(虽硬编码中文),易误伤;决策应在数据来源(content)而非中间层。
- 否决理由:决策点不该在 background;且会改变现有 payload 契约语义。

### 方案 C:content.ts 把 settings 整个读出,在 doTranslate 内组装 targetLang
- 与方案 A 等价,只是写法不同(不封装进 getTargetLang)。可读性略差。
- 否决理由:方案 A 封装更清晰。

**最终选择:方案 A**。最小改动、可测试、可回滚,符合无人值守默认决策策略。

## 技术设计

### 改动文件
- `entrypoints/content.ts`
  - 顶部 import:`import { getSettings } from '@/shared/storage';`
  - `getTargetLang()` 改为 `async function getTargetLang(): Promise<string>`:
    - `const settings = await getSettings();`
    - `const configured = settings.defaultTargetLang?.trim();`
    - `if (configured) return configured;`
    - 否则走原有 `navigator.language` 映射逻辑(不变)。
  - `doTranslate` 内:`const targetLang = await getTargetLang();` 然后在 sendMessage payload 中使用。

### 不变项
- `shared/storage.ts`、`shared/types.ts`、`shared/llm.ts`、`background.ts`:无改动。
- `entrypoints/options/App.vue`:无改动(其 `defaultTargetLang()` 与 content.ts 映射表重复的问题本 Issue 不处理)。
- 语言映射表:保留 content.ts 内现有表,不抽离。

### 兼容性
- `defaultTargetLang` 默认值 `''`(DEFAULT_SETTINGS),trim 后为空 → 回退 navigator.language,与改动前行为完全一致,无破坏性。
- testProvider 不经过 content.ts,行为不变。

### 风险与回滚
- 风险:getSettings 在 content script 读取 chrome.storage.local,异步开销可忽略(划词翻译本就异步)。
- 回滚:还原 content.ts 单文件即可。

## 测试设计

- **typecheck + lint**:直接调 `./node_modules/.bin/vue-tsc --noEmit` 与 `./node_modules/.bin/eslint`(绕过 pnpm deps check,见 MEMORY 踩坑)。
- **e2e**:既有 `e2e/translate.spec.ts` 验证划词全链路 mock 译文「你好,世界」。本 bug 修复不改变 e2e 默认场景(未配置 defaultTargetLang → 回退 navigator.language,e2e 浏览器语言映射后为 English/中文,mock 固定返回「你好,世界」不依赖 prompt 内容,故 e2e 应仍通过)。
- **e2e 增强(可选,提升回归信心)**:利用 `getLastRequestBody()` 断言请求体 prompt 包含配置的目标语言。但需在 options 页填入 defaultTargetLang。考虑最小改动原则,本 Issue 在 e2e 中新增一条用例:配置 defaultTargetLang 为「简体中文」后划词,断言 mock server 收到的 prompt 含 `into 简体中文`。
