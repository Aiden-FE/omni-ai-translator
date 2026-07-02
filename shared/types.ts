// 共享类型定义 — 脚本间通信与配置

/** 源类型分类：LLM 类 / 传统翻译类 */
export type ProviderCategory = 'llm' | 'traditional';

/** 具体源类型（含传统翻译源占位，具体实现由功能事项 2/3） */
export type ProviderType = 'openai-compatible' | 'ollama' | 'google' | 'microsoft';

/** 翻译错误类型，四类互斥，供前端差异化反馈（契约供 #11 消费） */
export type ErrorType = 'no-config' | 'network' | 'rate-limit' | 'unreachable';

/** 提供方配置（向后兼容：category 缺省时按 type 推断） */
export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  /** 源类型分类，缺省时按 type 推断（openai-compatible/ollama → llm，google/microsoft → traditional） */
  category?: ProviderCategory;
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
  /** 错误类型标识，四类互斥，供前端差异化反馈 */
  errorType?: ErrorType;
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
