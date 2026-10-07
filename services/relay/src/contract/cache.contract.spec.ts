// 契约测试 — 跑真实 Redis，验证 mget / pipeline SET EX 的真实行为。
//
// 单测（cache.service.spec.ts）用 mock 锁业务逻辑；这里验证与真实 Redis 的交互：
// upsert 覆盖、TTL 落库、mget 缺键返回 null。
//
// 运行前置：设置 RELAY_CONTRACT_REDIS_URL 指向一个 Redis 实例，例如
//   RELAY_CONTRACT_REDIS_URL=redis://localhost:6379 pnpm --filter @omni/relay test
// 未设置时整个 describe.skip，保证本地无 Redis 也能绿。
// CI（.github/workflows/ci.yml）用 redis service 容器提供该实例。

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import { CacheService } from '../cache/cache.service.js';
import { buildCacheKey, CACHE_KEY_PREFIX } from '../cache/cache-key.js';
import { loadEnv } from '../config/env.js';

const redisUrl = process.env.RELAY_CONTRACT_REDIS_URL;
const describeIfRedis = redisUrl ? describe : describe.skip;

describeIfRedis('CacheService 契约（真实 Redis）', () => {
  let redis: Redis;
  let service: CacheService;

  beforeAll(async () => {
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: 1 });
    service = new CacheService(redis);
    // 清测试命名空间，避免与真实数据/上次运行残留
    const keys = await redis.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('lookup 未命中返回空 hits', async () => {
    const result = await service.lookup([{ id: 'a', text: '合同测试未命中', targetLang: 'zh' }]);
    expect(result.hits).toEqual([]);
  });

  it('commit 后 lookup 命中，译文一致', async () => {
    const text = '合同测试原文';
    const item = { id: 'a', text, targetLang: 'zh' };
    expect(await service.commit([{ ...item, translatedText: '合同测试译文' }])).toBe(1);
    const result = await service.lookup([item]);
    expect(result.hits).toEqual([{ id: 'a', translatedText: '合同测试译文' }]);
  });

  it('commit 是 upsert：二次提交覆盖旧译文', async () => {
    const text = '覆盖测试原文';
    const item = { id: 'b', text, targetLang: 'zh' };
    await service.commit([{ ...item, translatedText: '旧' }]);
    await service.commit([{ ...item, translatedText: '新' }]);
    const result = await service.lookup([item]);
    expect(result.hits).toEqual([{ id: 'b', translatedText: '新' }]);
  });

  it('TTL 落库且可被读取', async () => {
    const text = 'TTL 测试原文';
    const item = { id: 'c', text, targetLang: 'zh' };
    await service.commit([{ ...item, translatedText: '译文' }]);
    const key = buildCacheKey({ text, targetLang: 'zh' });
    const ttl = await redis.ttl(key);
    const expected = loadEnv().ttlSeconds;
    expect(ttl).toBeGreaterThan(expected - 60);
    expect(ttl).toBeLessThanOrEqual(expected);
  });

  it('mget 缺键返回 null → 部分命中只返回命中项', async () => {
    await service.commit([{ id: 'd', text: '存在', targetLang: 'zh', translatedText: '有' }]);
    const result = await service.lookup([
      { id: 'd', text: '存在', targetLang: 'zh' },
      { id: 'e', text: '缺失', targetLang: 'zh' },
    ]);
    expect(result.hits).toEqual([{ id: 'd', translatedText: '有' }]);
  });

  it('目标语言不同视为不同条目', async () => {
    const text = '多语言测试';
    await service.commit([{ id: 'f', text, targetLang: 'zh', translatedText: '中文' }]);
    const zh = await service.lookup([{ id: 'f', text, targetLang: 'zh' }]);
    const en = await service.lookup([{ id: 'f', text, targetLang: 'en' }]);
    expect(zh.hits).toEqual([{ id: 'f', translatedText: '中文' }]);
    expect(en.hits).toEqual([]);
  });

  it('源语言区分自动检测与显式', async () => {
    const text = '源语言测试';
    await service.commit([{ id: 'g', text, targetLang: 'zh', translatedText: '自动' }]);
    const auto = await service.lookup([{ id: 'g', text, targetLang: 'zh' }]);
    const explicit = await service.lookup([{ id: 'g', text, targetLang: 'zh', sourceLang: 'en' }]);
    expect(auto.hits).toEqual([{ id: 'g', translatedText: '自动' }]);
    expect(explicit.hits).toEqual([]);
  });
});
