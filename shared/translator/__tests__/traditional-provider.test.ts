// 传统翻译 Provider 单元测试 — 覆盖有 Key（官方端点）/ 无 Key（免 Key 公共端点）两条路径
// 验收要点：microsoft 有 Key 含 region header 校验；google 有 Key 走 v2 端点；错误经 classifyError 归一化。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTraditionalProvider } from '../traditional-provider';
import type { ProviderConfig } from '@/shared/types';

function makeGoogleConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-google',
    name: 'test-google',
    type: 'google',
    category: 'traditional',
    baseUrl: 'https://translation.googleapis.com',
    model: '',
    ...overrides,
  };
}

function makeMicrosoftConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-microsoft',
    name: 'test-microsoft',
    type: 'microsoft',
    category: 'traditional',
    baseUrl: 'https://api.cognitive.microsofttranslator.com/translate',
    model: '',
    ...overrides,
  };
}

const baseReq = { text: 'hello', targetLang: '简体中文' };

describe('传统翻译 Provider — Google', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('无 Key → 走免 Key 公共端点（translate_a/single），解析嵌套数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [[['你好', 'hello', null, null, 1]], null, 'en'],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(makeGoogleConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();

    // 验证请求落到免 Key 公共端点
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('translate_a/single');
    expect(url).not.toContain('key=');
  });

  it('有 Key → 走官方 v2 端点，URL 含 /language/translate/v2?key=，POST body 含 target', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { translations: [{ translatedText: '你好' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeGoogleConfig({ apiKey: 'gk-test-key' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();

    // 验证请求落到官方 v2 端点
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/language/translate/v2');
    expect(url).toContain('key=gk-test-key');
    // 验证 POST body
    const callOpts = fetchMock.mock.calls[0][1] as RequestInit;
    expect(callOpts.method).toBe('POST');
    const body = JSON.parse(callOpts.body as string);
    expect(body.target).toBe('zh-CN');
    expect(body.q).toEqual(['hello']);
  });

  it('有 Key 且 baseUrl 已含 v2 路径 → 不重复追加路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { translations: [{ translatedText: '你好' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeGoogleConfig({
        apiKey: 'gk-test-key',
        baseUrl: 'https://translation.googleapis.com/language/translate/v2',
      }),
    );
    await provider.translate(baseReq);

    const url = fetchMock.mock.calls[0][0] as string;
    // 不应出现重复的 v2 路径
    expect(url.match(/language\/translate\/v2/g)?.length).toBe(1);
  });

  it('有 Key → 429 状态码 → rate-limit 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    }));
    const provider = createTraditionalProvider(
      makeGoogleConfig({ apiKey: 'gk-test-key' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
  });

  it('无 Key → fetch 抛 TypeError → network 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createTraditionalProvider(makeGoogleConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
  });
});

describe('传统翻译 Provider — Microsoft', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('无 Key → 走 edge auth + translate 两步（Bearer token）', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/translate/auth')) {
        return Promise.resolve({ ok: true, status: 200, text: async () => 'jwt-token' });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(makeMicrosoftConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();

    // 验证两次请求：auth + translate
    expect(fetchMock.mock.calls).toHaveLength(2);
    // 第二次请求带 Bearer token
    const translateOpts = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = translateOpts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer jwt-token');
  });

  it('有 Key + region → 携带 Ocp-Apim-Subscription-Key + Region header，不请求 auth 端点', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeMicrosoftConfig({ apiKey: 'ms-test-key', region: 'eastus' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();

    // 有 Key 时只发一次请求（不走 auth）
    expect(fetchMock.mock.calls).toHaveLength(1);

    const url = fetchMock.mock.calls[0][0] as string;
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect(url).toContain('api-version=3.0');
    expect(url).toContain('to=zh-CN');
    const headers = opts.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('ms-test-key');
    expect(headers['Ocp-Apim-Subscription-Region']).toBe('eastus');
    // 不应带 Bearer token（有 Key 不走 auth）
    expect(headers.Authorization).toBeUndefined();
  });

  it('有 Key 但 region 缺省 → 不发送 Region header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeMicrosoftConfig({ apiKey: 'ms-test-key' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');

    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Key']).toBe('ms-test-key');
    expect(headers['Ocp-Apim-Subscription-Region']).toBeUndefined();
  });

  it('有 Key 但 region 为纯空白 → trim 后不发送 Region header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeMicrosoftConfig({ apiKey: 'ms-test-key', region: '   ' }),
    );
    await provider.translate(baseReq);

    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers['Ocp-Apim-Subscription-Region']).toBeUndefined();
  });

  it('有 Key → fetch 抛 TypeError → network 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createTraditionalProvider(
      makeMicrosoftConfig({ apiKey: 'ms-test-key', region: 'eastus' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
  });

  it('有 Key → 500 状态码 → unreachable 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    const provider = createTraditionalProvider(
      makeMicrosoftConfig({ apiKey: 'ms-test-key', region: 'eastus' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
  });

  it('无 Key → auth 端点 429 → rate-limit 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/translate/auth')) {
        return Promise.resolve({ ok: false, status: 429, text: async () => 'Too Many' });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => [] });
    }));
    const provider = createTraditionalProvider(makeMicrosoftConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
  });
});

describe('传统翻译 Provider — test()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('test() 委托 translate，默认发送 hello → 中文', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { translations: [{ translatedText: '你好' }] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createTraditionalProvider(
      makeGoogleConfig({ apiKey: 'gk-test-key' }),
    );
    const result = await provider.test();
    expect(result.translatedText).toBe('你好');

    // 验证默认请求体含 hello
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.q).toEqual(['hello']);
  });

  it('未知传统源类型 → unreachable 错误', async () => {
    const provider = createTraditionalProvider(
      makeGoogleConfig({ type: 'baidu' as ProviderConfig['type'] }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
  });
});
