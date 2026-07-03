# DESIGN — LLM 翻译流式响应技术设计

| 项 | 内容 |
|---|---|
| Issue | #25 |
| PRD Issue | #24 |
| 版本 | v0.2 — 功能事项 6 |
| 状态 | approved（无人值守自动批准） |
| 日期 | 2026-07-03 |

## 1. 背景与目标

当前 LLM 翻译是非流式的：`callOpenAICompatible` / `callAnthropic` / `callOllama` 均 `await resp.json()` 等待完整响应，经 `chrome.runtime.sendMessage` 请求-响应单次传递，浮层在完整译文返回前只显示「翻译中…」。长文本翻译时用户需干等数秒无反馈。

**目标**：LLM 翻译采用流式响应，译文渐进渲染到浮层；非 LLM 源行为不退化。

## 2. 技术选型与理由

### 方案对比

| 方案 | 描述 | 优点 | 缺点 | 结论 |
|---|---|---|---|---|
| A. Port 长连接 + ReadableStream | content↔background 改 chrome.runtime.Port，background 用 fetch + response.body.getReader() 读流，逐 chunk 经 port 推送 | 原生 MV3 能力，无第三方依赖，支持双向通信与断连检测 | 需处理 SW 回收 | **采用** |
| B. 保留 sendMessage + 分块响应 | 多次 sendMessage 推送 chunk | 改动小 | sendMessage 是请求-响应模型，不适合持续推送；无法检测断连 | 否决 |
| C. content 直接 fetch 流式 | content-script 直接读流 | 省一层中转 | 违反架构约束（content 不直接 fetch 第三方接口），CORS 问题 | 否决 |

**最终选择**：方案 A。理由：符合 PRD 架构约束（content 不直接 fetch），利用 MV3 原生 Port + ReadableStream，支持断连检测与清理。

### 流式解析方案

三种 LLM 源的流式协议不同，但解析逻辑可统一为「按行读取 → JSON.parse → 提取 delta」模式：

| 源 | 请求变化 | 流格式 | delta 提取 | 结束信号 |
|---|---|---|---|---|
| OpenAI 兼容 | body 加 `stream: true` | SSE (`data: {...}\n\n`) | `choices[0].delta.content` | `data: [DONE]` |
| Anthropic | body 加 `stream: true` | SSE (`event: ...\ndata: {...}\n\n`) | `content_block_delta` 事件 `delta.text` | `message_stop` 事件 |
| Ollama | body 改 `stream: true` | NDJSON（每行一个 JSON） | `message.content` | 流关闭（reader done） |

## 3. 架构方案

```
content.ts                     background.ts                    llm-provider.ts
┌──────────────┐              ┌──────────────────┐             ┌─────────────────┐
│ 划词触发      │              │ onConnect        │             │ callXxxStream   │
│   ↓          │              │   'translate-stream'            │  (3 variants)   │
│ port.connect │──request───→ │   ↓              │             │  ↓              │
│   ↓          │              │ translateWithAdapterStream      │  fetch + reader │
│ onMessage    │←──chunk────  │   ↓              │──onChunk──→ │  parse SSE/NDJSON│
│   渐进渲染    │              │   onChunk →      │             │  extract delta  │
│   + 光标      │←──done─────  │   port.postMessage│            │  accumulate     │
│   ↓          │              │   ↓              │             └─────────────────┘
│ 定稿/错误     │←──error────  │   done/error →   │
│              │              │   port.disconnect │
│ onDisconnect │              │                  │
│   清理浮层    │              └──────────────────┘
└──────────────┘
```

### 模块变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `shared/types.ts` | 新增类型 | `TranslateChunk { deltaText: string }`；port 消息类型 `StreamMessage` |
| `shared/translator/types.ts` | 接口扩展 | `TranslationProvider` 新增可选 `translateStream?` |
| `shared/translator/llm-provider.ts` | 新增函数 | `callOpenAICompatibleStream` / `callAnthropicStream` / `callOllamaStream`；`createLLMProvider` 增加 `translateStream` 实现 |
| `shared/translator/index.ts` | 新增函数 | `translateWithAdapterStream(req, onChunk)` |
| `entrypoints/background.ts` | 新增监听 | `chrome.runtime.onConnect` 监听 `translate-stream` |
| `entrypoints/content.ts` | 重构翻译流程 | `doTranslate` 改 port 建连 + 渐进渲染 |
| `assets/content.css` | 新增样式 | 流式光标动画 |
| `shared/translator/__tests__/llm-provider.test.ts` | 新增测试 | 流式解析、delta 累加、错误归类 |
| `shared/translator/__tests__/adapter.test.ts` | 新增测试 | translateWithAdapterStream 回退分支 |
| `e2e/translate.spec.ts` | 新增测试 | 流式渲染、中断反馈 |
| `e2e/mock-server.ts` | 扩展 mock | SSE/NDJSON 流式端点 |

## 4. UX 与视觉实现

### 设计依据

- PRD UX 章节：流式光标 `▋` 显示/定稿移除、aria-live 通告、错误「❌」前缀、对比度 WCAG AA
- knowledges/ux/design-system.md：浮层深色背景 `#1F2937` + 浅色文字 `#F9FAFB`、最大宽度 360px、圆角 8px
- knowledges/ux/interaction-patterns.md：划词浮层状态反馈
- knowledges/ux/accessibility.md：不依赖纯图标、对比度满足 WCAG AA

### 视觉实现

1. **流式光标**：CSS `@keyframes blink` 闪烁竖线 `▋`，追加在译文文本末尾；流结束（done）移除光标元素
2. **渐进渲染**：译文文本逐 chunk 追加到浮层文本区（`textContent` 或子元素），替代 v0.2 静态「翻译中…」
3. **节流合批**：chunk 到达时用 `requestAnimationFrame` 合批，一帧内多个 chunk 合并为一次 DOM 更新
4. **错误反馈**：保留已渲染译文 + 追加错误行（`❌ 主文案` + 引导次要行），沿用 `errorFeedback()` 差异化文案
5. **aria-live**：浮层容器设 `aria-live="polite"`，屏幕阅读器在断点朗读已生成译文

### 交互状态

| 状态 | LLM 源（流式） | 传统源（非流式回退） |
|---|---|---|
| 触发 | 点击「译」按钮 → 浮层出现 | 同左 |
| 加载 | port 推送 chunk → 译文逐字追加 + 光标 `▋` | 浮层显示「翻译中…」（沿用 v0.2） |
| 定稿 | 流结束 → 移除光标，译文定稿 | 一次性返回 → 显示完整译文 |
| 中断 | 已渲染译文保留 + 错误提示行 | 四类 errorType 错误反馈（沿用） |

### 可访问性

- 流式光标为视觉辅助，非唯一状态指示（同时有 aria-live 与文本承载）
- 错误反馈不依赖颜色，沿用「❌」文字前缀 + 可读文案
- 浮层深色背景 + 浅色文字对比度满足 WCAG AA（沿用）

## 5. 数据结构/模型变更

### 新增类型

```typescript
// shared/types.ts
/** 流式翻译 chunk */
export interface TranslateChunk {
  deltaText: string;
}

/** port 消息（content ↔ background） */
export type StreamPortMessage =
  | { type: 'request'; text: string; targetLang: string; sourceLang?: string }
  | { type: 'chunk'; deltaText: string }
  | { type: 'done'; result: TranslateResult }
  | { type: 'error'; result: TranslateResult };
```

### 接口扩展

```typescript
// shared/translator/types.ts
export interface TranslationProvider {
  id: string;
  type: 'llm' | 'traditional';
  translate(req: TranslateRequest): Promise<TranslateResult>;
  test(req?: TranslateRequest): Promise<TranslateResult>;
  /** 流式翻译（可选，LLM 源实现，传统源不实现） */
  translateStream?(req: TranslateRequest, onChunk: (chunk: TranslateChunk) => void): Promise<TranslateResult>;
}
```

## 6. 接口设计

### translateWithAdapterStream

```typescript
// shared/translator/index.ts
export async function translateWithAdapterStream(
  req: TranslateRequest,
  onChunk: (chunk: TranslateChunk) => void,
): Promise<TranslateResult> {
  // 读取生效源配置（同 translateWithAdapter）
  // 创建 provider
  // provider.translateStream 存在 → 调流式方法
  // 不存在 → 回退 translate()，完整译文作单 chunk 推送
}
```

### background port 监听

```typescript
// entrypoints/background.ts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'translate-stream') return;
  port.onMessage.addListener((msg: StreamPortMessage) => {
    if (msg.type !== 'request') return;
    translateWithAdapterStream(
      { text: msg.text, targetLang: msg.targetLang, sourceLang: msg.sourceLang },
      (chunk) => port.postMessage({ type: 'chunk', deltaText: chunk.deltaText }),
    ).then((result) => {
      if (result.error) {
        port.postMessage({ type: 'error', result });
      } else {
        port.postMessage({ type: 'done', result });
      }
      port.disconnect();
    }).catch((err) => {
      port.postMessage({ type: 'error', result: { translatedText: '', error: String(err), errorType: 'network' } });
      port.disconnect();
    });
  });
});
```

### content port 建连

```typescript
// entrypoints/content.ts
const port = chrome.runtime.connect({ name: 'translate-stream' });
port.postMessage({ type: 'request', text, targetLang, sourceLang });
port.onMessage.addListener((msg) => {
  // chunk → 渐进追加 + 光标
  // done → 定稿
  // error → 保留译文 + 错误行
});
port.onDisconnect.addListener(() => {
  // 浮层清理（SW 回收等异常路径）
});
```

## 7. 兼容性与风险评估

### 向后兼容

- `translateStream` 为可选方法，传统 provider 无需改动
- 既有 `translate(req)` / `translateWithAdapter(req)` / `test()` / `testWithAdapter()` 保留不变
- 既有 `sendMessage` translate 路径：保留（连通性测试 test-provider 仍走 sendMessage），translate 流程改 port
- `TranslateChunk` 为纯新增类型，不影响现有类型

### 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| SW 回收导致流式中断 | 流式不可用 | port.onDisconnect 清理浮层，归入 network 错误 |
| SSE/NDJSON 拆包跨行 | delta 丢失 | 解析器按行缓冲，跨行数据拼接后再解析 |
| 高频 chunk 引起重排卡顿 | 性能 | requestAnimationFrame 合批 |
| 现有 e2e 依赖 sendMessage translate | e2e 失败 | e2e 适配 port 流程或保留兼容路径 |

### 回滚方式

删除 `translateStream` / `TranslateChunk` / `translateWithAdapterStream`，恢复 background.ts / content.ts 到 master 版本。CSS 光标样式无害可保留。
