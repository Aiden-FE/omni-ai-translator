// 适配层统一入口单元测试 — 覆盖默认源路由、no-config、builtin 源、getActiveSources/setActiveSource
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  translateWithAdapter,
  testWithAdapter,
  getActiveSources,
  setActiveSource,
} from '../index';
import type { ProviderConfig } from '@/shared/types';

// Mock chrome.storage.local — 模拟 storage 模块
vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
  getProviders: vi.fn(),
  setSettings: vi.fn(),
}));

// 导入 mock 后的 storage
const { getSettings, getProviders, setSettings } = await import('@/shared/storage');

describe('translateWithAdapter — 默认源与路由', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('activeProviderId 为 null → 解析默认 builtin:microsoft 并路由翻译', async () => {
    // fresh install：未做选择，默认选中 microsoft 免费源
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    // mock microsoft 翻译端点（auth + translate 两步）
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/translate/auth')) {
          return Promise.resolve({ ok: true, status: 200, text: async () => 'token' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
        });
      }),
    );

    const result = await translateWithAdapter({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });

  it('activeProviderId 不匹配任何 provider 与内置源 → no-config 错误', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'non-existent', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'other', name: 'other', type: 'openai-compatible', baseUrl: 'http://localhost', model: 'm' },
    ]);

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('no-config');
  });

  it('有匹配的用户 provider → 路由到对应 provider 翻译', async () => {
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

  it('activeProviderId 指向 builtin:google → 路由到 google 免费源', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:google', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'hello', null, null, 1]], null, 'en'],
      }),
    );

    const result = await translateWithAdapter({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
  });
});

describe('testWithAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('对 microsoft 免费源配置测试 → 经 auth token 返回译文', async () => {
    const config: ProviderConfig = {
      id: 'builtin:microsoft',
      name: '微软翻译（免费）',
      type: 'microsoft',
      category: 'traditional',
      baseUrl: 'https://api.cognitive.microsofttranslator.com/translate',
      model: '',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/translate/auth')) {
          return Promise.resolve({ ok: true, status: 200, text: async () => 'token' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
        });
      }),
    );

    const result = await testWithAdapter(config);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });
});

describe('getActiveSources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('合并内置免费源与用户源，activeProviderId 为 null → 解析默认 microsoft', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'user-llm', name: '我的 LLM', type: 'openai-compatible', baseUrl: 'http://x', model: 'm' },
    ]);

    const result = await getActiveSources();
    // 内置 2 个 + 用户 1 个
    expect(result.sources).toHaveLength(3);
    expect(result.sources.some((s) => s.id === 'builtin:microsoft')).toBe(true);
    expect(result.sources.some((s) => s.id === 'builtin:google')).toBe(true);
    expect(result.sources.some((s) => s.id === 'user-llm')).toBe(true);
    expect(result.activeSourceId).toBe('builtin:microsoft');
  });

  it('activeProviderId 已设置 → 返回用户选择的生效源', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'user-llm', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'user-llm', name: '我的 LLM', type: 'openai-compatible', baseUrl: 'http://x', model: 'm' },
    ]);

    const result = await getActiveSources();
    expect(result.activeSourceId).toBe('user-llm');
  });
});

describe('setActiveSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('切换到 builtin:google → 写入 settings.activeProviderId', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:microsoft', defaultTargetLang: '中文' });

    await setActiveSource('builtin:google');
    expect(setSettings).toHaveBeenCalledWith({
      activeProviderId: 'builtin:google',
      defaultTargetLang: '中文',
    });
  });

  it('切换到用户源 → 写入 settings.activeProviderId', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });

    await setActiveSource('user-llm');
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ activeProviderId: 'user-llm' }),
    );
  });
});
