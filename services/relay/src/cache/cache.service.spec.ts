// CacheService 单测 — mock ioredis，锁归一化/哈希/upsert 语义/容错。
// 见 ADR-0002：坏条跳过、好条照处理；commit 是 upsert。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from './cache.service.js';
import { buildCacheKey } from './cache-key.js';
import { MAX_ITEMS_PER_REQUEST, MAX_TEXT_LENGTH, type CommitItem, type LookupItem } from '../contracts.js';

/** 最小 Redis mock：只需 mget / pipeline / ping。 */
function createRedisMock() {
  const store = new Map<string, string>();
  const setCalls: Array<{ key: string; value: string; ex: number }> = [];

  const pipelineExec = vi.fn(async () => {
    // 把已排队的 SET 落到 store
    for (const call of setCalls) {
      store.set(call.key, call.value);
    }
    return setCalls.map(() => [null, 'OK'] as [null, string]);
  });

  const redis = {
    store,
    setCalls,
    mget: vi.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    pipeline: vi.fn(() => {
      const queued: Array<{ key: string; value: string; ex: number }> = [];
      return {
        set: (key: string, value: string, _mode: string, ex: number) => {
          queued.push({ key, value, ex });
          setCalls.push({ key, value, ex });
        },
        exec: pipelineExec,
      };
    }),
    ping: vi.fn(async () => 'PONG'),
  };
  return redis;
}

type MockRedis = ReturnType<typeof createRedisMock>;

function createService(redis: MockRedis): CacheService {
  // 绕过 DI 直接构造：单测只关心业务逻辑
  return new CacheService(redis as never);
}

const item = (over: Partial<LookupItem> = {}): LookupItem => ({
  id: 'i1',
  text: 'hello',
  targetLang: 'zh',
  ...over,
});

describe('CacheService.lookup', () => {
  let redis: MockRedis;
  let service: CacheService;

  beforeEach(() => {
    redis = createRedisMock();
    service = createService(redis);
  });

  it('命中时返回对应 id 的译文', async () => {
    const key = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    redis.store.set(key, '你好');

    const result = await service.lookup([item()]);
    expect(result.hits).toEqual([{ id: 'i1', translatedText: '你好' }]);
  });

  it('未命中时返回空 hits', async () => {
    const result = await service.lookup([item()]);
    expect(result.hits).toEqual([]);
  });

  it('部分命中只返回命中条', async () => {
    const key = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    redis.store.set(key, '你好');
    const result = await service.lookup([item(), item({ id: 'i2', text: 'world' })]);
    expect(result.hits).toEqual([{ id: 'i1', translatedText: '你好' }]);
  });

  it('非法单条被跳过，同批合法条照常处理', async () => {
    const key = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    redis.store.set(key, '你好');
    const result = await service.lookup([
      item(),
      { id: 'bad', text: 123 as never, targetLang: 'zh' },
      null as never,
    ]);
    expect(result.hits).toEqual([{ id: 'i1', translatedText: '你好' }]);
  });

  it('超过单条长度上限的条目被跳过', async () => {
    const long = 'x'.repeat(MAX_TEXT_LENGTH + 1);
    const result = await service.lookup([item({ text: long })]);
    expect(result.hits).toEqual([]);
  });

  it('超出 MAX_ITEMS 的多余条目被截断', async () => {
    const items = Array.from({ length: MAX_ITEMS_PER_REQUEST + 50 }, (_, i) =>
      item({ id: `i${i}` }),
    );
    await service.lookup(items);
    expect(redis.mget).toHaveBeenCalledTimes(1);
    // mget 以 spread 调用：args.length = keys 数量
    expect(redis.mget.mock.calls[0]!.length).toBe(MAX_ITEMS_PER_REQUEST);
  });

  it('body 非数组时返回空 hits', async () => {
    expect((await service.lookup('not-array')).hits).toEqual([]);
    expect((await service.lookup(undefined)).hits).toEqual([]);
  });
});

describe('CacheService.commit', () => {
  let redis: MockRedis;
  let service: CacheService;

  beforeEach(() => {
    redis = createRedisMock();
    service = createService(redis);
  });

  it('写入译文并设置 TTL', async () => {
    const result = await service.commit([item({ translatedText: '你好' } as CommitItem)]);
    expect(result).toBe(1);
    const key = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    expect(redis.store.get(key)).toBe('你好');
    expect(redis.setCalls[0].ex).toBeGreaterThan(0);
  });

  it('upsert：覆盖既有条目', async () => {
    const key = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    redis.store.set(key, '旧译');
    await service.commit([item({ translatedText: '新译' } as CommitItem)]);
    expect(redis.store.get(key)).toBe('新译');
  });

  it('缺译文的条目被跳过', async () => {
    const result = await service.commit([item() as CommitItem]);
    expect(result).toBe(0);
    expect(redis.pipeline).not.toHaveBeenCalled();
  });

  it('空批不触碰 pipeline', async () => {
    expect(await service.commit([])).toBe(0);
    expect(redis.pipeline).not.toHaveBeenCalled();
  });
});

describe('CacheService.ping', () => {
  it('redis 正常返回 true', async () => {
    const service = createService(createRedisMock());
    expect(await service.ping()).toBe(true);
  });

  it('redis 抛错返回 false', async () => {
    const redis = createRedisMock();
    redis.ping.mockRejectedValueOnce(new Error('down'));
    const service = createService(redis);
    expect(await service.ping()).toBe(false);
  });
});
