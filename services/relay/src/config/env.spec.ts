import { describe, expect, it } from 'vitest';
import { DEFAULT_TTL_SECONDS, EnvParseError, loadEnv } from './env.js';

describe('loadEnv', () => {
  it('全缺省时返回默认值', () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      port: 3000,
      redisUrl: 'redis://localhost:6379',
      ttlSeconds: DEFAULT_TTL_SECONDS,
      trustProxy: false,
      lookupLimit: 120,
      commitLimit: 30,
      rateLimitWindowSeconds: 60,
    });
  });

  it('TRUST_PROXY 接受多种真值/假值写法', () => {
    for (const v of ['1', 'true', 'yes', 'on', 'TRUE']) {
      expect(loadEnv({ TRUST_PROXY: v }).trustProxy).toBe(true);
    }
    for (const v of ['0', 'false', 'no', 'off']) {
      expect(loadEnv({ TRUST_PROXY: v }).trustProxy).toBe(false);
    }
  });

  it('TRUST_PROXY 非法值抛错', () => {
    expect(() => loadEnv({ TRUST_PROXY: 'maybe' })).toThrow(EnvParseError);
  });

  it('整数参数非法时抛错', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(EnvParseError);
    expect(() => loadEnv({ PORT: '0' })).toThrow(EnvParseError);
  });

  it('REDIS_URL trim 后生效，空串回退默认', () => {
    expect(loadEnv({ REDIS_URL: ' redis://h:6379 ' }).redisUrl).toBe('redis://h:6379');
    expect(loadEnv({ REDIS_URL: '' }).redisUrl).toBe('redis://localhost:6379');
  });
});
