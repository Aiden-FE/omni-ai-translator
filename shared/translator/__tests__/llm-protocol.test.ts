import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_BASE_URL_BY_PROTOCOL,
  normalizeLlmProtocol,
  resolveLlmEndpoint,
} from '../llm-protocol';

describe('resolveLlmEndpoint', () => {
  it.each([
    ['https://api.openai.com/v1', 'openai-completions', 'https://api.openai.com/v1/chat/completions'],
    ['https://api.openai.com/v1/', 'openai-responses', 'https://api.openai.com/v1/responses'],
    ['https://api.anthropic.com/v1', 'anthropic', 'https://api.anthropic.com/v1/messages'],
    ['http://localhost:11434', 'ollama', 'http://localhost:11434/api/chat'],
  ] as const)('%s + %s -> %s', (baseUrl, protocol, expected) => {
    expect(resolveLlmEndpoint(baseUrl, protocol)).toBe(expected);
  });

  it.each([
    ['https://gateway.test/v1/chat/completions', 'openai-completions'],
    ['https://gateway.test/v1/responses', 'openai-responses'],
    ['https://gateway.test/v1/messages', 'anthropic'],
    ['http://localhost:11434/api/chat', 'ollama'],
  ] as const)('preserves complete endpoint %s', (url, protocol) => {
    expect(resolveLlmEndpoint(url, protocol)).toBe(url);
  });

  it('trims surrounding whitespace and trailing slashes', () => {
    expect(resolveLlmEndpoint('  https://gateway.test/v1///  ', 'openai-responses'))
      .toBe('https://gateway.test/v1/responses');
  });
});

describe('normalizeLlmProtocol', () => {
  it.each([
    [undefined, 'openai-completions'],
    ['openai', 'openai-completions'],
    ['openai-completions', 'openai-completions'],
    ['openai-responses', 'openai-responses'],
    ['anthropic', 'anthropic'],
    ['ollama', 'ollama'],
    ['unknown', 'openai-completions'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeLlmProtocol(value)).toBe(expected);
  });
});

describe('DEFAULT_LLM_BASE_URL_BY_PROTOCOL', () => {
  it('uses service roots rather than complete request endpoints', () => {
    expect(DEFAULT_LLM_BASE_URL_BY_PROTOCOL).toEqual({
      'openai-completions': 'https://api.openai.com/v1',
      'openai-responses': 'https://api.openai.com/v1',
      anthropic: 'https://api.anthropic.com/v1',
      ollama: 'http://localhost:11434',
    });
  });
});
