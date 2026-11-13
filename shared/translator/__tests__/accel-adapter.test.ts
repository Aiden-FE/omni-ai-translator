// 适配层加速接入测试 — 证明加速层真的生效，而不只是编译通过。
//
// 覆盖 ADR-0002 / CONTEXT.md §3.12–3.13：
// - 命中 → 不调翻译源、译文一次性呈现（不模拟流式）
// - 未命中 → 正常翻译，翻译成功后提交缓存
// - 加速不可用（超时/5xx/网络错）→ fail-open，翻译照常
// - 加速范围 / customPrompt / 未配置端点 → 跳过
// - skipLookup（重试）→ 跳过查询但仍提交（覆盖公共缓存）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateWithAdapter, translateWithAdapterStream } from '../index';
import { configureAccelScheduler, resetAccelScheduler } from '@/shared/accel';
import type { Settings } from '@/shared/types';

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
  getProviders: vi.fn(),
  setSettings: vi.fn(),
}));

const { getSettings, getProviders } = await import('@/shared/storage');

const ACCEL = 'https://accel.example.com';

/** 翻译源（传统源）应有的响应形状。 */
function microsoftFetch(text = '翻译源译文') {
  return new Response(JSON.stringify([{ translations: [{ text, to: 'zh-CN' }] }]), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stubAccel(settings: Partial<Settings>): void {
  vi.mocked(getSettings).mockResolvedValue({
    activeProviderId: null,
    defaultTargetLang: 'zh-CN',
    accelEndpoint: ACCEL,
    ...settings,
  } as Settings);
  vi.mocked(getProviders).mockResolvedValue([]);
}

beforeEach(() => {
  // 调度器是模块级单例：每个用例必须从干净状态开始，否则熔断冷却会跨用例泄漏。
  resetAccelScheduler();
  configureAccelScheduler({ lookupWindowMs: 0, commitIdleMs: 0 });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  resetAccelScheduler();
  vi.unstubAllGlobals();
});

describe('命中缓存', () => {
  it('流式路径：命中时推送单个 chunk 且不调翻译源', async () => {
    stubAccel({});
    // lookup 返回的 id 由插件生成，测试里通过「读到请求体」再回填来模拟服务端回显
    let requestedId = '';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string }> };
        requestedId = body.items[0]!.id;
        return new Response(
          JSON.stringify({ hits: [{ id: requestedId, translatedText: '缓存译文' }] }),
          { status: 200 },
        );
      }
      throw new Error(`不应调用翻译源: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    const result = await translateWithAdapterStream(
      { text: 'hello', targetLang: 'zh-CN' },
      (c) => chunks.push(c.deltaText),
    );

    expect(result).toEqual({ translatedText: '缓存译文' });
    // 命中一次性呈现整段译文，不模拟流式
    expect(chunks).toEqual(['缓存译文']);
    // 只发了 lookup，没有翻译请求、没有 commit
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.includes('/v1/cache/lookup'))).toHaveLength(1);
    expect(urls.some((u) => u.includes('microsoft'))).toBe(false);
  });

  it('非流式路径：命中时直接返回缓存译文', async () => {
    stubAccel({});
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string }> };
      return new Response(
        JSON.stringify({ hits: [{ id: body.items[0]!.id, translatedText: '缓存译文' }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    expect(result).toEqual({ translatedText: '缓存译文' });
  });
});

describe('未命中 → 翻译后提交缓存', () => {
  it('lookup 未命中时照常翻译，成功后 fire-and-forget 提交', async () => {
    stubAccel({});
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/lookup')) {
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return microsoftFetch();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    expect(result.translatedText).toBe('翻译源译文');

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/cache/lookup'))).toBe(true);
    expect(urls.some((u) => u.includes('microsoft'))).toBe(true);
    // commit 是 fire-and-forget，需让微任务/定时器排空后再断言
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/v1/cache/commit')))
      .toBe(true);
  });

  it('目标语言显示名按 BCP-47 写入缓存身份（跨入口共用同一 key）', async () => {
    stubAccel({});
    const lookupBodies: Array<{ items: Array<{ targetLang: string }> }> = [];
    const commitBodies: Array<{ items: Array<{ targetLang: string }> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        lookupBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        commitBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return microsoftFetch();
    });
    vi.stubGlobal('fetch', fetchMock);

    // 全文翻译跟随 navigator.language 时传入的是显示名，不是 BCP-47 代码
    await translateWithAdapter({ text: 'hello', targetLang: '简体中文' });
    await new Promise((r) => setTimeout(r, 0));

    expect(lookupBodies[0]!.items[0]!.targetLang).toBe('zh-CN');
    expect(commitBodies[0]!.items[0]!.targetLang).toBe('zh-CN');
  });

  it('翻译失败时不提交缓存', async () => {
    stubAccel({});
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/lookup')) {
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return new Response('server error', { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/v1/cache/commit')))
      .toBe(false);
  });
});

describe('fail-open', () => {
  it('lookup 5xx → 仍能翻译成功（用户无感知）', async () => {
    stubAccel({});
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/lookup')) {
        return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return microsoftFetch();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    expect(result.translatedText).toBe('翻译源译文');
  });

  it('加速节点网络错误 → 仍能翻译成功', async () => {
    stubAccel({});
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/')) throw new Error('accel unreachable');
      return microsoftFetch();
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    expect(result.translatedText).toBe('翻译源译文');
  });
});

describe('跳过加速的条件', () => {
  it('未配置端点 → 不查缓存', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      activeProviderId: null,
      defaultTargetLang: 'zh-CN',
    } as Settings);
    vi.mocked(getProviders).mockResolvedValue([]);
    const fetchMock = vi.fn(async () => microsoftFetch());
    vi.stubGlobal('fetch', fetchMock);

    await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/cache/'))).toBe(false);
  });

  it('scope=builtin 且生效源为自有源 → 不查缓存', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      activeProviderId: 'user-1',
      defaultTargetLang: 'zh-CN',
      accelEndpoint: ACCEL,
      accelScope: 'builtin',
    } as Settings);
    vi.mocked(getProviders).mockResolvedValue([
      {
        id: 'user-1',
        name: '自建',
        type: 'llm',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-4',
        responseStyle: 'openai-completions',
      },
    ]);
    const fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/cache/'))).toBe(false);
  });

  it('配置了 customPrompt → 不查缓存（个性化提示词不进共享缓存）', async () => {
    stubAccel({ customPrompt: '用文言文翻译' });
    const fetchMock = vi.fn(async () => microsoftFetch());
    vi.stubGlobal('fetch', fetchMock);

    await translateWithAdapter({ text: 'hello', targetLang: 'zh-CN' });
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('/v1/cache/'))).toBe(false);
  });
});

describe('skipLookup（重试语义）', () => {
  it('skipLookup 时不查缓存，但仍提交（覆盖公共缓存）', async () => {
    stubAccel({});
    let lookupCalls = 0;
    let commitCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/lookup')) {
        lookupCalls += 1;
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        commitCalls += 1;
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return microsoftFetch('重试译文');
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateWithAdapter(
      { text: 'hello', targetLang: 'zh-CN' },
      { skipLookup: true },
    );
    expect(result.translatedText).toBe('重试译文');
    await new Promise((r) => setTimeout(r, 0));
    expect(lookupCalls).toBe(0);
    expect(commitCalls).toBe(1);
  });
});
