// Provider 工厂注册表与路由
// 根据 ProviderConfig.type 创建对应的 TranslationProvider 实例。
import type { ProviderConfig, ProviderCategory, ProviderType } from '@/shared/types';
import type { TranslationProvider } from './types';
import { createLLMProvider } from './llm-provider';
import { createTraditionalProvider } from './traditional-provider';

/** LLM 类源类型集合 */
const LLM_TYPES: ReadonlySet<ProviderType> = new Set(['openai-compatible', 'ollama']);

/** 传统翻译类源类型集合 */
const TRADITIONAL_TYPES: ReadonlySet<ProviderType> = new Set(['google', 'microsoft']);

/**
 * 根据 ProviderType 推断 ProviderCategory（向后兼容旧配置无 category 字段的情况）
 */
export function inferCategory(type: ProviderType): ProviderCategory {
  if (LLM_TYPES.has(type)) return 'llm';
  if (TRADITIONAL_TYPES.has(type)) return 'traditional';
  // 未知类型默认归为 traditional，由具体工厂处理
  return 'traditional';
}

/**
 * 根据 ProviderConfig 创建对应的 TranslationProvider 实例
 * LLM 类（openai-compatible / ollama）→ createLLMProvider
 * 传统类（google / microsoft）→ createTraditionalProvider
 */
export function createProvider(config: ProviderConfig): TranslationProvider {
  const category = config.category ?? inferCategory(config.type);
  if (category === 'llm') {
    return createLLMProvider(config);
  }
  return createTraditionalProvider(config);
}
