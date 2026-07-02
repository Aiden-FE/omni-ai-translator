// LLM Provider 错误路径单元测试 — 覆盖 network / rate-limit / unreachable 三类（no-config 在 adapter 层测试）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMProvider } from '../llm-provider';
import type { ProviderConfig } from '@/shared/types';

function makeOpenAIConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-llm',
    name: 'test-llm',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:9999/v1/chat/completions',
    model: 'test-model',
    ...overrides,
  };
}

const baseReq = { text: 'hello', targetLang: '中文' };

describe('LLM Provider 错误归一化', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetch 抛 TypeError → network 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
    expect(result.error).toContain('Failed to fetch');
  });

  it('429 状态码 → rate-limit 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
    expect(result.error).toContain('429');
  });

  it('500 状态码 → unreachable 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toContain('500');
  });

  it('404 状态码 → unreachable 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
  });

  it('成功响应 → 返回译文，无 errorType', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好,世界' } }],
      }),
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.error).toBeUndefined();
    expect(result.errorType).toBeUndefined();
  });

  it('Ollama 类型成功响应 → 返回译文', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: '你好,世界' },
      }),
    }));
    const provider = createLLMProvider(makeOpenAIConfig({ type: 'ollama' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
  });

  it('test() 默认发送 hello → 中文 请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.test();
    expect(result.translatedText).toBe('你好');
    // 验证请求体包含 hello
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.messages[0].content).toContain('hello');
  });
});
