// 加速调度器单测 — 锁住两件事：
// 1) 并发 lookup/commit 真的被合流（生产事故的根因是逐段请求打满限流）；
// 2) 429/5xx/网络错误时立刻 fail-open，并进入冷却，不能集体堵在节点上。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccelCommitItem, AccelLookupQuery } from '../client';
import {
  accelCommitQueued,
  accelLookupBatched,
  configureAccelScheduler,
  resetAccelScheduler,
} from '../scheduler';

const ENDPOINT = 'https://accel.test';

function query(id: string, text = id): AccelLookupQuery {
  return { id, text, targetLang: 'zh-CN' };
}

function commitItem(id: string): AccelCommitItem {
  return { id, text: id, targetLang: 'zh-CN', translatedText: `译:${id}` };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function requestBodies(fetchMock: ReturnType<typeof vi.fn>): Array<{ items: Array<Record<string, string>> }> {
  return fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetAccelScheduler();
  configureAccelScheduler({
    lookupWindowMs: 10,
    commitIdleMs: 1000,
    commitFlushItems: 3,
    cooldownBaseMs: 1000,
    cooldownMaxMs: 4000,
    cooldownJitterRatio: 0,
  });
});

afterEach(() => {
  resetAccelScheduler();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lookup 合流', () => {
  it('窗口内的并发查询合并成一个请求，命中按 id 回填到各自调用方', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string }> };
      const hits = body.items
        .filter((item) => item.id === 'b')
        .map((item) => ({ id: item.id, translatedText: '缓存:b' }));
      return json({ hits });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = accelLookupBatched(ENDPOINT, [query('a')]);
    const second = accelLookupBatched(ENDPOINT, [query('b')]);
    await vi.advanceTimersByTimeAsync(10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBodies(fetchMock)[0]!.items.map((item) => item.id)).toEqual(['a', 'b']);
    await expect(first).resolves.toEqual([]);
    await expect(second).resolves.toEqual([{ id: 'b', translatedText: '缓存:b' }]);
  });

  it('超过服务端单批上限时拆成多个请求', async () => {
    const fetchMock = vi.fn(async () => json({ hits: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const queries = Array.from({ length: 201 }, (_, i) => query(`q${i}`));
    const pending = accelLookupBatched(ENDPOINT, queries);
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestBodies(fetchMock)[0]!.items).toHaveLength(200);
    expect(requestBodies(fetchMock)[1]!.items).toHaveLength(1);
  });
});

describe('限流与故障：立刻 fail-open + 冷却', () => {
  it('429 → 等待中的查询立即按未命中返回，冷却期内不再发请求', async () => {
    const fetchMock = vi.fn(async () =>
      json({ error: 'throttled' }, 429, { 'retry-after': '2' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = accelLookupBatched(ENDPOINT, [query('a')]);
    await vi.advanceTimersByTimeAsync(10);
    await expect(first).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 冷却期内：同步返回空，不发请求，调用方立刻走自己的翻译源
    await expect(accelLookupBatched(ENDPOINT, [query('b')])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Retry-After 到期后恢复试探
    await vi.advanceTimersByTimeAsync(2000);
    const probe = accelLookupBatched(ENDPOINT, [query('c')]);
    await vi.advanceTimersByTimeAsync(10);
    await expect(probe).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('在途请求失败时，排队中的查询也立即返回，不等 3 秒超时', async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = accelLookupBatched(ENDPOINT, [query('a')]);
    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 第一批在途时又来了一个查询 → 进入队列
    const queued = accelLookupBatched(ENDPOINT, [query('b')]);
    resolveFetch(json({ error: 'boom' }, 500));
    await vi.advanceTimersByTimeAsync(0);

    await expect(first).resolves.toEqual([]);
    await expect(queued).resolves.toEqual([]);
    // 冷却打开后不再发第二个请求
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('网络错误同样触发冷却，而不是每条查询各试一次', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('dns fail');
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = accelLookupBatched(ENDPOINT, [query('a')]);
    await vi.advanceTimersByTimeAsync(10);
    await expect(pending).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(accelLookupBatched(ENDPOINT, [query('b')])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('commit 合流', () => {
  it('达到条数阈值立即落盘，一批写完', async () => {
    const fetchMock = vi.fn(async () => json({ accepted: 3 }));
    vi.stubGlobal('fetch', fetchMock);

    accelCommitQueued(ENDPOINT, [commitItem('a'), commitItem('b'), commitItem('c')]);
    await vi.advanceTimersByTimeAsync(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestBodies(fetchMock)[0]!.items).toHaveLength(3);
  });

  it('未到阈值时等空闲窗口再落盘', async () => {
    const fetchMock = vi.fn(async () => json({ accepted: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    accelCommitQueued(ENDPOINT, [commitItem('a')]);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('冷却期内直接丢弃提交，不向拥堵节点加写', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'throttled' }, 429));
    vi.stubGlobal('fetch', fetchMock);

    const pending = accelLookupBatched(ENDPOINT, [query('a')]);
    await vi.advanceTimersByTimeAsync(10);
    await pending;

    const callsAfterLookup = fetchMock.mock.calls.length;
    accelCommitQueued(ENDPOINT, [commitItem('a')]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterLookup);
  });

  it('冷却前发出的 commit 成功，不会提前解除冷却', async () => {
    configureAccelScheduler({ commitFlushItems: 1 });
    const resolvers: Array<{ url: string; resolve: (response: Response) => void }> = [];
    const fetchMock = vi.fn((url: string) => new Promise<Response>((resolve) => {
      resolvers.push({ url: String(url), resolve });
    }));
    vi.stubGlobal('fetch', fetchMock);

    accelCommitQueued(ENDPOINT, [commitItem('a')]);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolvers).toHaveLength(1);

    const lookup = accelLookupBatched(ENDPOINT, [query('b')]);
    await vi.advanceTimersByTimeAsync(10);
    expect(resolvers).toHaveLength(2);
    resolvers[1]!.resolve(json({ error: 'throttled' }, 429));
    await vi.advanceTimersByTimeAsync(0);
    await expect(lookup).resolves.toEqual([]);

    // 冷却前发出的 commit 成功返回：这只说明节点活着，不代表配额已恢复。
    resolvers[0]!.resolve(json({ accepted: 1 }));
    await vi.advanceTimersByTimeAsync(0);

    await expect(accelLookupBatched(ENDPOINT, [query('c')])).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
