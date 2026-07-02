// 错误归一化单元测试 — 覆盖四类错误路径（no-config / network / rate-limit / unreachable）
import { describe, it, expect } from 'vitest';
import { classifyError, errorTypeMessage, errorFeedback } from '../error';
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

describe('errorFeedback', () => {
  const allTypes: ErrorType[] = ['no-config', 'network', 'rate-limit', 'unreachable'];

  it('no-config → 主文案「未配置可用翻译源」+ 引导「请在配置页选择或添加源」', () => {
    const fb = errorFeedback('no-config');
    expect(fb.main).toBe('未配置可用翻译源');
    expect(fb.guidance).toBe('请在配置页选择或添加源');
  });

  it('network → 主文案「翻译请求失败」+ 引导「请检查网络或源地址」', () => {
    const fb = errorFeedback('network');
    expect(fb.main).toBe('翻译请求失败');
    expect(fb.guidance).toBe('请检查网络或源地址');
  });

  it('rate-limit → 主文案「翻译源繁忙（限流）」+ 引导「请稍后再试或在配置页切换源」', () => {
    const fb = errorFeedback('rate-limit');
    expect(fb.main).toBe('翻译源繁忙（限流）');
    expect(fb.guidance).toBe('请稍后再试或在配置页切换源');
  });

  it('unreachable → 主文案「翻译源不可达」+ 引导「请在配置页切换到其它源」', () => {
    const fb = errorFeedback('unreachable');
    expect(fb.main).toBe('翻译源不可达');
    expect(fb.guidance).toBe('请在配置页切换到其它源');
  });

  it.each(allTypes)('errorType=%s 的 main 和 guidance 均非空', (type) => {
    const fb = errorFeedback(type);
    expect(fb.main).toBeTruthy();
    expect(fb.main.length).toBeGreaterThan(2);
    expect(fb.guidance).toBeTruthy();
    expect(fb.guidance.length).toBeGreaterThan(2);
  });

  it('四类 main 互不相同（可区分）', () => {
    const mains = allTypes.map((t) => errorFeedback(t).main);
    expect(new Set(mains).size).toBe(4);
  });

  it('四类 guidance 互不相同（可区分）', () => {
    const guidances = allTypes.map((t) => errorFeedback(t).guidance);
    expect(new Set(guidances).size).toBe(4);
  });

  it('no-config 引导包含「配置页」', () => {
    expect(errorFeedback('no-config').guidance).toContain('配置页');
  });

  it('network 引导包含「网络」', () => {
    expect(errorFeedback('network').guidance).toContain('网络');
  });

  it('rate-limit 主文案包含「限流」', () => {
    expect(errorFeedback('rate-limit').main).toContain('限流');
  });

  it('unreachable 主文案包含「不可达」', () => {
    expect(errorFeedback('unreachable').main).toContain('不可达');
  });
});
