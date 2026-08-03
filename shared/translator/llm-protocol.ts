import type { LlmProtocol } from '@/shared/types';

export const DEFAULT_LLM_BASE_URL_BY_PROTOCOL: Record<LlmProtocol, string> = {
  'openai-completions': 'https://api.openai.com/v1',
  'openai-responses': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama: 'http://localhost:11434',
};

const ENDPOINT_SUFFIX_BY_PROTOCOL: Record<LlmProtocol, string> = {
  'openai-completions': '/chat/completions',
  'openai-responses': '/responses',
  anthropic: '/messages',
  ollama: '/api/chat',
};

export function normalizeLlmProtocol(value: unknown): LlmProtocol {
  if (
    value === 'openai-responses'
    || value === 'anthropic'
    || value === 'ollama'
  ) {
    return value;
  }
  return 'openai-completions';
}

export function resolveLlmEndpoint(baseUrl: string, protocol: LlmProtocol): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const suffix = ENDPOINT_SUFFIX_BY_PROTOCOL[protocol];
  return normalizedBaseUrl.endsWith(suffix)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}${suffix}`;
}
