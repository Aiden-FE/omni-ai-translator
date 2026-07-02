// Provider 注册表与路由单元测试
import { describe, it, expect } from 'vitest';
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

  it('传统 provider translate 返回 unreachable 错误', async () => {
    const provider = createProvider(makeConfig('google'));
    const result = await provider.translate({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toBeTruthy();
  });

  it('传统 provider test 返回 unreachable 错误', async () => {
    const provider = createProvider(makeConfig('microsoft'));
    const result = await provider.test();
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
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
