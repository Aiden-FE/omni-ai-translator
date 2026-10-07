# ADR-0004: 加速覆盖全部三条翻译路径，命中不模拟流式

- **Status**: Accepted
- **Date**: 2026-10-07
- **Scope**: `entrypoints/background.ts` + `shared/translator/*` + `shared/fullpage/*`

## Context

插件有三条翻译路径，形态互不相同：划词翻译与 popup 文本翻译是单条流式；全文翻译对 LLM 源走批量流式 chunk（`translateBatchWithAdapterStream`），对传统源走并发池逐条翻译。若只挑其中一条接入加速，会出现"划词秒出、全文照旧等 LLM"的割裂体验，而全文翻译恰恰是请求量最大、重复率最高、最该被加速的那条。

反向的风险是"命中也要模拟流式"：缓存里只有完整译文，要伪造 chunk 序列既无必要，也会让命中路径比未命中路径更慢。

## Decision

三条路径全部接入加速，接入点统一在 background 的适配层之上，不侵入各 provider 实现。

- **划词 / popup 文本**：翻译前单条 lookup；命中则直接把缓存译文作为最终结果一次性呈现，未命中则照常流式翻译，done 后异步 commit。
- **全文 LLM 批量流**：每批请求发出前对该批所有 parts 做 lookup；命中 parts 直接渲染、不进 LLM 请求；未命中 parts 重组为缩减后的批次发给 LLM；按实际翻译结果逐条 commit。
- **全文传统源**：并发池每条翻译前 lookup，同上。

配套决策：

- **命中不模拟流式**，一次性呈现完整译文（缓存的作用是消除等待，不是复刻流式体验）。
- **查缓存超时 3 秒（可配），任何异常一律按全未命中处理**（fail-open），用户界面不出现任何加速相关错误；存缓存为 fire-and-forget，失败即丢弃。加速节点是性能层，任何情况下不得阻断翻译。

## Consequences

- 三种能力在开启加速后的行为一致，用户不需要理解插件内部有几条翻译路径。
- 全文翻译的批次会在 lookup 之后被重排：原本 200 段的批次，命中 150 段时实际只发 50 段给 LLM。批次的重新分组、`missingChunkIds` 的重试语义、以及三槽 `batchRequestGate` 的容量计算都必须以"重排后的实际请求"为准。

> **实现偏离（2026-10-07）**：grilling 时写的是「未命中 parts 回原 packer 重新分组」。落地时发现两处约束使其不可行 / 不必要：
>
> 1. **池侧要求整块齐全**：`shared/fullpage/batch-pool.ts:validateTranslatedChunk` 要求返回 chunk 的 `translatedParts.length` 与请求完全一致，部分命中若只回部分 parts 会被判为非法并丢弃，该段将永不 settle（直到超时）。因此**只有 chunk 的全部 part 都命中才整块短路**；chunk 内部分命中仍整块发 LLM。
> 2. **接缝位置**：加速层插在适配层（`translateBatchWithAdapterStream`），此处只有 chunks、没有段元数据，无法调用 packer 的 token 预算重组。若把加速层上移到编排器即可重组，但会让接入点从 1 处扩散到 4 处（initial / viewport / dynamic / retry），与「单接缝」的设计价值冲突。
>
> 实际效果：缓存身份仍是 ADR 规定的「单条原文 + 语言」，按 part 逐条查缓存；重复的导航 / 页脚 / 按钮等整段文本（多数段落是单 part chunk）照常命中。仅超长段落的切片在部分命中时无法短路——代价可接受。
>
> `missingChunkIds` 语义不变：只反映 LLM 实际缺失；命中块不会被算作缺失。
- 加速节点不可用时，用户最多多等 3 秒（且只在配置了加速端点时），不会看到错误。
- 熔断（连续失败后跳过一段时间）暂不实现；若实测中 3 秒超时的累积成本显著，再作为后续优化引入。
