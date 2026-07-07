# PRD — Issue #8

> BUG Issue(标签 `AI` + `bug`),无独立 PRD Issue。本 PRD 由 Issue #8 描述整理而成。

## 背景与问题描述

LLM Translator 的设置页提供「默认目标语言」配置项(`settings.defaultTargetLang`),用户可填入期望的翻译目标语言(如「简体中文」),hint 承诺「留空则使用浏览器首选语言」。但实际划词翻译时,该配置完全不生效:prompt 始终使用浏览器首选语言(`navigator.language`)作为目标语言,与用户配置相悖。

**复现场景**:浏览器首选语言为 `en-US`,设置页配置目标语言为「简体中文」;选中英文文本划词翻译,实际请求 prompt 为 `Translate the following text into English...`,把英文译成了英文。

**根因**:`entrypoints/content.ts:14` 的 `getTargetLang()` 只读 `navigator.language`,完全没有读取 storage 中用户配置的 `settings.defaultTargetLang`。设置页 `entrypoints/options/App.vue` 写入的 `defaultTargetLang` 仅在 options 页自身使用,划词翻译链路(content.ts → background.ts → llm.ts)全程未读取该值,配置被彻底绕过。

## 目标

让用户配置的「默认目标语言」在划词翻译链路真正生效,同时保持「留空回退浏览器首选语言」的既有承诺。

## 验收标准

1. 划词翻译时,content.ts 优先读取 storage 的 `settings.defaultTargetLang` 作为目标语言。
2. `defaultTargetLang` 非空(且非空白)时,使用用户配置值(trim 后非空)。
3. `defaultTargetLang` 为空(或仅空白)时,回退到 `navigator.language` 经语言映射后的值(保持现有回退逻辑不变)。
4. 设置页 hint「留空则使用浏览器首选语言」的承诺在划词翻译链路真正生效。
5. 既有场景回归:typecheck + lint + e2e(划词翻译全链路 mock 译文)通过。
6. 连通性测试 `testProvider` 不受影响(它硬编码 `targetLang='中文'`,不经过 content.ts 的 `getTargetLang`)。

## 范围边界

- **本 Issue 做**:让 content.ts 的 `getTargetLang` 读取并优先使用 `settings.defaultTargetLang`。
- **本 Issue 不做**:语言映射表抽离到 shared( Issue 明确指出「映射抽离可作为后续改进」);UI 改动;新增语言选项。
- **影响模块**:`entrypoints/content.ts`。`background.ts`、`shared/llm.ts`、`shared/storage.ts`、`shared/types.ts` 无需改动(它们已正确透传 `payload.targetLang`)。

## 严重程度

严重 —— 目标语言是翻译的核心参数,配置不生效导致翻译结果错误(把源语言译成源语言,或译成非预期语言),用户配置形同虚设。
