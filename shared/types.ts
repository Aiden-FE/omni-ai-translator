// 共享类型定义 — 脚本间通信与配置

/** 源类型分类：LLM 类 / 传统翻译类 */
export type ProviderCategory = 'llm' | 'traditional';

/** 具体源类型：LLM 类统一为 'llm'（由 responseStyle 区分协议格式）；传统翻译 google/microsoft 保持独立 */
export type ProviderType = 'llm' | 'google' | 'microsoft';

/** LLM 请求协议。 */
export type LlmProtocol =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic'
  | 'ollama';

/** 翻译错误类型，四类互斥，供前端差异化反馈（契约供 #11 消费） */
export type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';

/** 提供方配置（向后兼容：category 缺省时按 type 推断） */
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** 源类型分类，缺省时按 type 推断（llm → llm，google/microsoft → traditional） */
  category?: ProviderCategory;
  /** Base URL（如 https://api.openai.com/v1 或 http://localhost:11434），调用时按协议补全端点路径。 */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** microsoft Azure Translator 区域（如 eastus、global）；有 Key 时携带 Ocp-Apim-Subscription-Region。google 不使用。缺省则不发送该 header。 */
  region?: string;
  /** LLM 请求协议。 */
  responseStyle?: LlmProtocol;
}

/** 翻译请求 */
export interface TranslateRequest {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

/** 翻译响应 */
export interface TranslateResult {
  translatedText: string;
  error?: string;
  /** 错误类型标识，四类互斥，供前端差异化反馈 */
  errorType?: ErrorType;
}

/** 全文翻译批量请求中的一个原文片段。 */
export interface BatchTranslatePart {
  partId: number;
  sliceIndex: number;
  text: string;
}

/** 全文翻译批量请求中的一个传输 chunk。 */
export interface BatchTranslateChunk {
  chunkId: string;
  segmentId: string;
  parts: BatchTranslatePart[];
}

/** 全文翻译批量响应中的一个译文片段。 */
export interface BatchTranslatedPart {
  partId: number;
  sliceIndex: number;
  text: string;
}

/** 全文翻译批量响应中的一个已翻译 transport chunk。 */
export interface BatchTranslatedChunk {
  chunkId: string;
  translatedParts: BatchTranslatedPart[];
}

/** 当前翻译源对上层公开的能力，不暴露 provider 配置或凭据。 */
export interface TranslationCapabilities {
  batchStream: boolean;
}

/** 一次 LLM 批量流式翻译请求。 */
export interface BatchTranslateRequest {
  targetLang: string;
  chunks: BatchTranslateChunk[];
}

/** 批量流结束状态；未校验通过的 chunk 由调用方按 ID 重试。 */
export interface BatchTranslateResult {
  missingChunkIds: string[];
  error?: string;
  errorType?: ErrorType;
}

/** 插件设置 */
export interface Settings {
  activeProviderId: string | null;
  defaultTargetLang: string;
  customPrompt?: string;
}

/** 生效源列表与当前生效源（getActiveSources 返回，供 #4 配置页消费） */
export interface ActiveSourcesResult {
  /** 可用源列表：内置免费源 + 用户已配置源 */
  sources: ProviderConfig[];
  /** 当前生效源 ID（fresh install 解析为默认 microsoft） */
  activeSourceId: string;
}

/** 消息通道类型 */
export type Message =
  | { type: 'translate'; payload: TranslateRequest }
  | { type: 'test-provider'; payload: ProviderConfig }
  | { type: 'get-settings' }
  | { type: 'get-providers' }
  | { type: 'get-translation-capabilities' }
  | { type: 'get-active-sources' }
  | { type: 'set-active-source'; payload: { id: string } };

/** 全文翻译显示模式：replace=译文替换原文，bilingual=双语对照 */
export type DisplayMode = 'replace' | 'bilingual';

/**
 * background → content 命令通道（与上方 content → background 的 Message 联合分离，勿混用）
 * - fullpage-translate：右键菜单「全文翻译」触发，background 经 browser.tabs.sendMessage 下发给目标页 content script（t5 消费）
 */
export type BackgroundCommand = { type: 'fullpage-translate'; mode: DisplayMode };

/** 流式翻译 chunk（增量译文片段） */
export interface TranslateChunk {
  deltaText: string;
}

/**
 * Port 消息类型（content ↔ background 流式翻译契约）
 * - content → background：request（翻译请求）
 * - background → content：chunk（增量译文）/ done（流结束）/ error（错误）
 */
export type StreamPortMessage =
  | { type: 'request'; text: string; targetLang: string; sourceLang?: string }
  | { type: 'chunk'; deltaText: string }
  | { type: 'done'; result: TranslateResult }
  | { type: 'error'; result: TranslateResult };

/** 全文 LLM 批量流式翻译的专用 Port 契约。 */
export type BatchStreamPortMessage =
  | { type: 'request'; requestId: string; targetLang: string; chunks: BatchTranslateChunk[] }
  | { type: 'chunk'; requestId: string; chunk: BatchTranslatedChunk }
  | { type: 'done'; requestId: string; missingChunkIds: string[] }
  | { type: 'error'; requestId: string; result: BatchTranslateResult };
