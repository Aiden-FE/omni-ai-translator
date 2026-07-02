// 共享类型定义 — 脚本间通信与配置

/** LLM 提供方类型 */
export type ProviderType = 'openai-compatible' | 'ollama';

/** LLM 提供方配置 */
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** 完整接口路径（如 https://api.openai.com/v1/chat/completions 或 http://localhost:11434/api/chat），代码不再追加 path */
  baseUrl: string;
  apiKey?: string;
  model: string;
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
}

/** 插件设置 */
export interface Settings {
  activeProviderId: string | null;
  defaultTargetLang: string;
  customPrompt?: string;
}

/** 消息通道类型 */
export type Message =
  | { type: 'translate'; payload: TranslateRequest }
  | { type: 'test-provider'; payload: ProviderConfig }
  | { type: 'get-settings' }
  | { type: 'get-providers' };
