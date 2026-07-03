# LLM 翻译流式响应

## 功能目标

LLM 翻译采用流式响应，译文 token 边产生边渲染到划词浮层，用户即时看到翻译进展，不再干等完整响应；传统源保持非流式一次性返回，行为不变。

## 业务规则

- 仅 LLM 源（openai-compatible / anthropic / ollama）流式；传统源（google / microsoft）经适配层「一次性流」回退，浮层一次显示完整译文。
- `TranslationProvider.translateStream` 为可选方法：LLM provider 实现，传统 provider 不实现（`undefined`）。
- 适配层 `translateWithAdapterStream(req, onChunk)`：provider 支持 → 调流式方法逐 chunk 上抛；不支持 → 回退 `translate()`，完整译文作单 chunk 推送一次。
- 既有 `translate()` / `translateWithAdapter()` / `test()` / `testWithAdapter()` 非流式契约保留不变。
- 流式中断错误经 `classifyError` 归入四类 `errorType`（no-config / network / rate-limit / unreachable），复用统一适配层错误模型。
- 流式中断时默认保留已渲染译文 + 追加错误提示行（「❌」前缀，不依赖颜色）。

## 状态流转

浮层在 v0.2 基础上细化加载态：

- **待触发**：圆形「译」按钮（沿用）。
- **加载-流式**（LLM 源）：译文逐 chunk 追加 + 闪烁光标 `▋`。
- **加载-非流式**（传统源）：「翻译中…」（沿用 v0.2）。
- **成功**：完整译文文本，光标移除。
- **流式中断**：已渲染译文 + 错误提示行。
- **失败**（配置缺失/网络/限流/源不可达）：四类 errorType 差异化文案 + 引导。

## 权限控制

- content-script 不直接 fetch 第三方接口；流式 fetch 在 background 内进行，chunk 经 port 推送到 content。
- 跨域请求沿用既有 manifest `host_permissions`，流式不改变域名范围。

## UI 或交互要点

- translate 流程经 `chrome.runtime.Port`（name: `translate-stream`）长连接，替代 `sendMessage` 请求-响应。
- port 协议：content→background `{type:'request', text, targetLang, sourceLang}`；background→content `{type:'chunk', deltaText}` / `{type:'done', result}` / `{type:'error', result}`；完成或出错时 background `port.disconnect()`。
- chunk 追加用 `requestAnimationFrame` 合批，一帧内多个 chunk 合并为一次 DOM 更新，避免高频重排。
- 流式光标 `▋`（CSS animation）为辅助视觉，非唯一状态指示；浮层容器 `aria-live="polite"` 通告译文进展。
- `port.onDisconnect` → 浮层清理（SW 回收等异常路径归入 network 错误）。

## 相关文件

- `shared/types.ts` — `TranslateChunk` / `StreamPortMessage` 类型
- `shared/translator/types.ts` — `TranslationProvider.translateStream` 可选方法
- `shared/translator/llm-provider.ts` — 三源流式实现（`callOpenAICompatibleStream` / `callAnthropicStream` / `callOllamaStream`）+ `readLines` 行缓冲
- `shared/translator/index.ts` — `translateWithAdapterStream`（含传统源回退）
- `entrypoints/background.ts` — `onConnect` 监听 `translate-stream` port
- `entrypoints/content.ts` — port 建连 + 渐进渲染 + 光标 + rAF 节流 + onDisconnect 清理
- `assets/content.css` — 流式光标动画
- `knowledges/adr/002-llm-streaming-port-and-readablestream.md` — 架构决策

## 相关模块

- [统一翻译源适配层](unified-adapter.md) — `TranslationProvider` 契约、四类 errorType 错误模型基础
