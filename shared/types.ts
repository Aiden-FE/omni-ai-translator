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
  /** microsoft Azure Translator 区域（如 eastus、global）；有 Key 时携带 Ocp-Apim-Subscription-Region。google 不使用。缺省则不发送该 header。 */
  region?: string;
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
