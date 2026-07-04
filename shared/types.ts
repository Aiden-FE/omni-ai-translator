// 共享类型定义 — 脚本间通信与配置

/** 源类型分类：LLM 类 / 传统翻译类 */
export type ProviderCategory = 'llm' | 'traditional';

/** 具体源类型：LLM 类统一为 'llm'（由 responseStyle 区分协议格式）；传统翻译 google/microsoft 保持独立 */
export type ProviderType = 'llm' | 'google' | 'microsoft';

/** 翻译错误类型，四类互斥，供前端差异化反馈（契约供 #11 消费） */
export type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';

/** 提供方配置（向后兼容：category 缺省时按 type 推断） */
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** 源类型分类，缺省时按 type 推断（llm → llm，google/microsoft → traditional） */
  category?: ProviderCategory;
  /** 完整接口路径（如 https://api.openai.com/v1/chat/completions 或 http://localhost:11434/api/chat），代码不再追加 path */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** microsoft Azure Translator 区域（如 eastus、global）；有 Key 时携带 Ocp-Apim-Subscription-Region。google 不使用。缺省则不发送该 header。 */
  region?: string;
  /** 响应风格：对所有 LLM 源(type='llm')生效，区分协议格式。缺省 'openai'（向后兼容）。openai → OpenAI 兼容；anthropic → 原生 Anthropic Messages API；ollama → 本地 Ollama 协议。 */
  responseStyle?: 'openai' | 'anthropic' | 'ollama';
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
  | { type: 'get-active-sources' }
  | { type: 'set-active-source'; payload: { id: string } };

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
