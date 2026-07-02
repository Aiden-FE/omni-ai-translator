// 适配层统一入口单元测试 — 覆盖 no-config 错误路径
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateWithAdapter, testWithAdapter } from '../index';
import type { ProviderConfig } from '@/shared/types';

// Mock chrome.storage.local — 模拟 storage 模块
vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
  getProviders: vi.fn(),
}));

// 导入 mock 后的 storage
const { getSettings, getProviders } = await import('@/shared/storage');

describe('translateWithAdapter — no-config 错误路径', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('无任何 provider 配置 → no-config 错误', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('no-config');
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('配置页');
  });

  it('activeProviderId 不匹配任何 provider → no-config 错误', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'non-existent', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'other', name: 'other', type: 'openai-compatible', baseUrl: 'http://localhost', model: 'm' },
    ]);

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('no-config');
  });

  it('有匹配的 provider → 路由到对应 provider 翻译', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'active-id', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'active-id', name: 'test', type: 'openai-compatible', baseUrl: 'http://localhost:9999/v1/chat/completions', model: 'm' },
    ]);

    // Mock fetch 返回成功
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    }));

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });
});

describe('testWithAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('对 LLM provider 配置测试 → 调用 provider.test', async () => {
    const config: ProviderConfig = {
      id: 'test-id',
      name: 'test',
      type: 'openai-compatible',
      baseUrl: 'http://localhost:9999/v1/chat/completions',
      model: 'test-model',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    }));

    const result = await testWithAdapter(config);
    expect(result.translatedText).toBe('你好');
  });

  it('对传统 provider 配置测试 → unreachable 错误', async () => {
    const config: ProviderConfig = {
      id: 'test-google',
      name: 'google',
      type: 'google',
      baseUrl: '',
      model: '',
    };

    const result = await testWithAdapter(config);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
  });
});
