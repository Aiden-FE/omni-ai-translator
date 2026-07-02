// 传统翻译 Provider 占位 — Google / 微软
// 具体翻译实现由功能事项 2（免 Key 兜底）和功能事项 3（传统 API Key 配置）完成。
// 本文件仅提供可注册的 provider 占位，translate 返回 unreachable 错误。
import type { ProviderConfig, TranslateResult } from '@/shared/types';
import type { TranslationProvider } from './types';

/**
 * 创建传统翻译源 provider 占位实例
 * google / microsoft 可注册但具体 translate 由功能事项 2/3 实现。
 * 当前调用 translate / test 返回 unreachable 错误。
 */
export function createTraditionalProvider(config: ProviderConfig): TranslationProvider {
  return {
    id: config.id,
    type: 'traditional' as const,
    async translate(): Promise<TranslateResult> {
      return {
        translatedText: '',
        error: `${config.type} 翻译源尚未实现，请在配置页切换到已配置的 LLM 源`,
        errorType: 'unreachable',
      };
    },
    async test(): Promise<TranslateResult> {
      return {
        translatedText: '',
        error: `${config.type} 翻译源尚未实现，请在配置页切换到已配置的 LLM 源`,
        errorType: 'unreachable',
      };
    },
  };
}
