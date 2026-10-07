// 守卫单测 — tracker 取 request.ip（fastify 已按 trustProxy 解析好真实来源）。
import { describe, expect, it } from 'vitest';
import { ProxyThrottlerGuard } from './proxy-throttler.guard.js';

// getTracker 是 protected：用测试子类把它暴露成公开方法，
// 避免在 spec 里做类型断言绕过 TS 的可见性检查。
class TestableGuard extends ProxyThrottlerGuard {
  trackerFor(req: Record<string, unknown>): Promise<string> {
    return this.getTracker(req);
  }
}

// getTracker 不依赖任何实例字段，直接从原型构造，绕开基类必需的构造参数。
const guard: TestableGuard = Object.create(TestableGuard.prototype);

describe('ProxyThrottlerGuard.getTracker', () => {
  it('优先用 request.ip', async () => {
    const tracker = await guard.trackerFor({ ip: '1.1.1.1' });
    expect(tracker).toBe('1.1.1.1');
  });

  it('request.ip 缺失时退回 raw.remoteAddress', async () => {
    const tracker = await guard.trackerFor({ raw: { remoteAddress: '127.0.0.1' } });
    expect(tracker).toBe('127.0.0.1');
  });

  it('两者都缺失时返回 unknown，不抛错', async () => {
    expect(await guard.trackerFor({})).toBe('unknown');
  });

  // 关键回归点：刻意不读 ips[0]——fastify 的 ips 首项是 socket 地址，
  // 会让所有经反代的请求共用一个限流桶。
  it('不把 ips[0] 当 tracker（防共用桶回归）', async () => {
    const tracker = await guard.trackerFor({
      ip: '1.1.1.1',
      ips: ['127.0.0.1', '1.1.1.1'],
    });
    expect(tracker).toBe('1.1.1.1');
  });
});
