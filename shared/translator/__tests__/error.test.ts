// 错误归一化单元测试 — 覆盖四类错误路径（no-config / network / rate-limit / unreachable）
import { describe, it, expect } from 'vitest';
import { classifyError, errorTypeMessage } from '../error';
import type { ErrorType } from '@/shared/types';

describe('classifyError', () => {
  it('429 状态码 → rate-limit', () => {
    expect(classifyError(null, 429)).toBe('rate-limit');
  });

  it('500 状态码 → unreachable', () => {
    expect(classifyError(null, 500)).toBe('unreachable');
  });

  it('404 状态码 → unreachable', () => {
    expect(classifyError(null, 404)).toBe('unreachable');
  });

  it('400 状态码 → unreachable', () => {
    expect(classifyError(null, 400)).toBe('unreachable');
  });

  it('fetch TypeError 无状态码 → network', () => {
    const err = new TypeError('Failed to fetch');
    expect(classifyError(err)).toBe('network');
  });

  it('无状态码的异常 → network', () => {
    expect(classifyError(new Error('timeout'))).toBe('network');
  });

  it('200 状态码不归类为错误（返回 network 作为 fallback）', () => {
    // 200 不是错误，但 classifyError 的 fallback 是 network
    // 实际调用中 200 不会进入 classifyError（resp.ok 时直接返回译文）
    expect(classifyError(null, 200)).toBe('network');
  });
});

describe('errorTypeMessage', () => {
  const allTypes: ErrorType[] = ['no-config', 'network', 'rate-limit', 'unreachable'];

  it.each(allTypes)('errorType=%s 返回非空可读提示', (type) => {
    const msg = errorTypeMessage(type);
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(5);
  });

  it('no-config 提示包含「配置页」', () => {
    expect(errorTypeMessage('no-config')).toContain('配置页');
  });

  it('network 提示包含「网络」', () => {
    expect(errorTypeMessage('network')).toContain('网络');
  });

  it('rate-limit 提示包含「限流」', () => {
    expect(errorTypeMessage('rate-limit')).toContain('限流');
  });

  it('unreachable 提示包含「不可达」', () => {
    expect(errorTypeMessage('unreachable')).toContain('不可达');
  });

  it('四类提示互不相同（可区分）', () => {
    const messages = allTypes.map((t) => errorTypeMessage(t));
    expect(new Set(messages).size).toBe(4);
  });
});
