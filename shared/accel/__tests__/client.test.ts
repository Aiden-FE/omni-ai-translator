// 加速客户端单测 — 锁 fail-open 语义（ADR-0002/0004）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { accelCommit, accelHealth, accelLookup, newAccelId } from '../client';

const ENDPOINT = 'https://accel.example.com';
const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('accelLookup', () => {
  it('命中时返回 hit 列表', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ hits: [{ id: 'a', translatedText: '你好' }] }),
    ) as unknown as typeof fetch;

    const hits = await accelLookup(ENDPOINT, [{ id: 'a', text: 'hello', targetLang: 'zh' }]);
    expect(hits).toEqual([{ id: 'a', translatedText: '你好' }]);
  });

  it('打到 /v1/cache/lookup 且带 items', async () => {
    const spy = vi.fn(async () => jsonResponse({ hits: [] }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await accelLookup(ENDPOINT, [{ id: 'a', text: 'hello', targetLang: 'zh' }]);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${ENDPOINT}/v1/cache/lookup`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      items: [{ id: 'a', text: 'hello', targetLang: 'zh' }],
    });
  });

  it('非 2xx → 空 hits（fail-open）', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: 'boom' }, 500),
    ) as unknown as typeof fetch;
    expect(await accelLookup(ENDPOINT, [])).toEqual([]);
  });

  it('网络错误 → 空 hits（fail-open），不抛', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(accelLookup(ENDPOINT, [])).resolves.toEqual([]);
  });

  it('响应畸形（非对象 / hits 非数组）→ 空 hits', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse('garbage')) as unknown as typeof fetch;
    expect(await accelLookup(ENDPOINT, [])).toEqual([]);

    globalThis.fetch = vi.fn(async () => jsonResponse({ hits: 'nope' })) as unknown as typeof fetch;
    expect(await accelLookup(ENDPOINT, [])).toEqual([]);
  });

  it('JSON 解析失败 → 空 hits', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
    expect(await accelLookup(ENDPOINT, [])).toEqual([]);
  });

  it('过滤掉畸形 hit（缺 id / 缺 translatedText）', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        hits: [
          { id: 'a', translatedText: '好' },
          { id: 'b' },
          { translatedText: '无 id' },
          null,
          'x',
        ],
      }),
    ) as unknown as typeof fetch;

    expect(await accelLookup(ENDPOINT, [])).toEqual([{ id: 'a', translatedText: '好' }]);
  });

  it('超时 → 空 hits（fail-open）', async () => {
    vi.useFakeTimers();
    let aborted = false;
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      })) as unknown as typeof fetch;

    const pending = accelLookup(ENDPOINT, [], 50);
    await vi.advanceTimersByTimeAsync(60);
    await expect(pending).resolves.toEqual([]);
    expect(aborted).toBe(true);
    vi.useRealTimers();
  });
});

describe('accelCommit', () => {
  it('打到 /v1/cache/commit 且 fire-and-forget 不抛', async () => {
    const spy = vi.fn(async () => jsonResponse({ accepted: 1 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    expect(() =>
      accelCommit(ENDPOINT, [
        { id: 'a', text: 'hello', targetLang: 'zh', translatedText: '你好' },
      ]),
    ).not.toThrow();

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [url] = spy.mock.calls[0] as unknown as [string];
    expect(url).toBe(`${ENDPOINT}/v1/cache/commit`);
  });

  it('commit 失败不产生 unhandled rejection', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;

    expect(() =>
      accelCommit(ENDPOINT, [{ id: 'a', text: 'h', targetLang: 'zh', translatedText: 'x' }]),
    ).not.toThrow();
    // 让 microtask 队列排空，若存在 unhandled rejection 会在此暴露
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('accelHealth', () => {
  it('redis ok → reachable + redis ok + version', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ status: 'ok', version: '0.1.0', redis: 'ok' }),
    ) as unknown as typeof fetch;
    expect(await accelHealth(ENDPOINT)).toEqual({ reachable: true, redis: 'ok', version: '0.1.0' });
  });

  it('503 + redis down → reachable（节点活着，缓存没通）', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ status: 'degraded', version: '0.1.0', redis: 'down' }, 503),
    ) as unknown as typeof fetch;
    expect(await accelHealth(ENDPOINT)).toEqual({ reachable: true, redis: 'down', version: '0.1.0' });
  });

  it('不可达 → reachable false + reason（设置页需要如实反馈）', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('dns fail');
    }) as unknown as typeof fetch;
    const result = await accelHealth(ENDPOINT);
    expect(result.reachable).toBe(false);
    expect(result).toHaveProperty('reason', 'dns fail');
  });

  it('非健康响应体 → reachable false + HTTP 状态', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ nope: true }, 502)) as unknown as typeof fetch;
    expect(await accelHealth(ENDPOINT)).toEqual({ reachable: false, reason: 'HTTP 502' });
  });

  it('打到 /healthz', async () => {
    const spy = vi.fn(async () => jsonResponse({ version: '0.1.0', redis: 'ok' }));
    globalThis.fetch = spy as unknown as typeof fetch;
    await accelHealth(ENDPOINT);
    expect(spy.mock.calls[0]![0]).toBe(`${ENDPOINT}/healthz`);
  });
});

describe('newAccelId', () => {
  it('生成互不相同的 id', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newAccelId()));
    expect(ids.size).toBe(200);
  });
});
