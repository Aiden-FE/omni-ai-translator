// Provider 注册表与路由单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProvider, inferCategory } from '../registry';
import type { ProviderConfig } from '@/shared/types';

function makeConfig(type: ProviderConfig['type'], overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-id',
    name: 'test',
    type,
    baseUrl: 'http://localhost:9999/api',
    model: 'test-model',
    ...overrides,
  };
}

describe('inferCategory', () => {
  it('openai-compatible → llm', () => {
    expect(inferCategory('openai-compatible')).toBe('llm');
  });

  it('ollama → llm', () => {
    expect(inferCategory('ollama')).toBe('llm');
  });

  it('google → traditional', () => {
    expect(inferCategory('google')).toBe('traditional');
  });

  it('microsoft → traditional', () => {
    expect(inferCategory('microsoft')).toBe('traditional');
  });
});

describe('createProvider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('openai-compatible 配置 → LLM provider', () => {
    const provider = createProvider(makeConfig('openai-compatible'));
    expect(provider.type).toBe('llm');
    expect(provider.id).toBe('test-id');
  });

  it('ollama 配置 → LLM provider', () => {
    const provider = createProvider(makeConfig('ollama'));
    expect(provider.type).toBe('llm');
  });

  it('google 配置 → traditional provider', () => {
    const provider = createProvider(makeConfig('google'));
    expect(provider.type).toBe('traditional');
  });

  it('microsoft 配置 → traditional provider', () => {
    const provider = createProvider(makeConfig('microsoft'));
    expect(provider.type).toBe('traditional');
  });

  it('显式 category 字段覆盖 type 推断', () => {
    // 即使 type 是 openai-compatible，显式 category=traditional 应创建传统 provider
    const provider = createProvider(makeConfig('openai-compatible', { category: 'traditional' }));
    expect(provider.type).toBe('traditional');
  });

  it('未知传统源类型 → unreachable 错误', async () => {
    // category=traditional 但 type 非 google/microsoft 时，translate 返回 unreachable
    const provider = createProvider(
      makeConfig('openai-compatible', { category: 'traditional' }),
    );
    const result = await provider.translate({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toContain('未知');
  });

  it('google provider translate 调用 fetch 并解析嵌套数组响应', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'hello', null, null, 1]], null, 'en'],
      }),
    );
    const provider = createProvider(makeConfig('google'));
    const result = await provider.translate({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('microsoft provider translate 经 auth token 调用翻译端点', async () => {
    const authFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'fake-jwt-token',
    });
    const translateFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      return url.includes('/translate/auth') ? authFetch() : translateFetch();
    }));
    const provider = createProvider(makeConfig('microsoft'));
    const result = await provider.translate({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
    expect(authFetch).toHaveBeenCalled();
    expect(translateFetch).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('传统 provider fetch 失败 → classifyError 归类', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }),
    );
    const provider = createProvider(makeConfig('google'));
    const result = await provider.translate({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
    vi.unstubAllGlobals();
  });

  it('传统 provider fetch 抛异常 → network 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createProvider(makeConfig('google'));
    const result = await provider.translate({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
    vi.unstubAllGlobals();
  });

  it('所有 provider 实现 TranslationProvider 接口', () => {
    const types: ProviderConfig['type'][] = ['openai-compatible', 'ollama', 'google', 'microsoft'];
    for (const type of types) {
      const provider = createProvider(makeConfig(type));
      expect(provider).toHaveProperty('id');
      expect(provider).toHaveProperty('type');
      expect(typeof provider.translate).toBe('function');
      expect(typeof provider.test).toBe('function');
    }
  });
});
