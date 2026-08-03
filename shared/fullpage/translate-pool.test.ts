// @vitest-environment jsdom
// 翻译池单元测试

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPool, retrySegments } from './translate-pool';
import type { SegmentRecord } from './types';

/** 创建测试分段 */
function createSegment(text: string, id?: string): SegmentRecord {
  const mockEl = {
    tagName: 'P',
    getClientRects: () => [],
    hasAttribute: () => false,
    parentElement: null,
    childNodes: [],
  } as unknown as HTMLElement;

  const mockText = {
    nodeType: 3, // TEXT_NODE
    textContent: text,
  } as unknown as Text;

  return {
    id: id ?? `seg-${text}`,
    el: mockEl,
    textNodes: [mockText],
    originalText: text,
    status: 'pending',
  };
}

/** Mock browser.runtime.sendMessage */
function mockSendMessage(
  responses: Record<string, { translatedText?: string; error?: string; errorType?: string }>,
): void {
  vi.stubGlobal('browser', {
    runtime: {
      sendMessage: vi.fn(async (msg: { type: string; payload: { text: string; targetLang: string } }) => {
        const key = `${msg.payload.targetLang}\u0000${msg.payload.text}`;
        const resp = responses[key];
        if (resp) {
          return resp;
        }
        // 默认返回原文
        return { translatedText: msg.payload.text };
      }),
    },
  });
}

describe('runPool', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('基本翻译 → 所有段成功', async () => {
    const segments = [
      createSegment('hello'),
      createSegment('world'),
      createSegment('foo'),
    ];
    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    mockSendMessage({
      '简体中文\u0000hello': { translatedText: '你好' },
      '简体中文\u0000world': { translatedText: '世界' },
      '简体中文\u0000foo': { translatedText: 'foo' },
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(segments[0].translatedText).toBe('你好');
    expect(segments[0].status).toBe('done');
    expect(segments[1].translatedText).toBe('世界');
    expect(segments[1].status).toBe('done');
    expect(segments[2].translatedText).toBe('foo');
    expect(segments[2].status).toBe('done');
    expect(cache.size).toBe(3);
    expect(onSettled).toHaveBeenCalled();
  });

  it('缓存命中 → 不调用 sendMessage', async () => {
    const segments = [
      createSegment('hello'),
      createSegment('world'),
    ];
    const cache = new Map<string, string>();
    cache.set('简体中文\u0000hello', '你好（缓存）');
    const onSettled = vi.fn();

    mockSendMessage({
      '简体中文\u0000world': { translatedText: '世界' },
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(segments[0].translatedText).toBe('你好（缓存）');
    expect(segments[0].status).toBe('done');
    // 只有一条 sendMessage 调用（world）
    expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'translate',
      payload: { text: 'world', targetLang: '简体中文' },
    });
  });

  it('翻译失败 → status=failed + errorType 记录', async () => {
    const segments = [
      createSegment('hello'),
      createSegment('error-text'),
      createSegment('world'),
    ];
    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    mockSendMessage({
      '简体中文\u0000hello': { translatedText: '你好' },
      '简体中文\u0000error-text': { error: 'translation failed', errorType: 'network' },
      '简体中文\u0000world': { translatedText: '世界' },
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].originalText).toBe('error-text');
    expect(result.failed[0].status).toBe('failed');
    expect(result.failed[0].errorType).toBe('network');
  });

  it('并发限制 ≤ 3 → 不会同时超过并发数', async () => {
    const segments = Array.from({ length: 10 }, (_, i) => createSegment(`seg-${i}`));
    const cache = new Map<string, string>();
    const onSettled = vi.fn();
    let concurrentCount = 0;
    let maxConcurrent = 0;

    // 模拟异步延迟
    mockSendMessage(
      Object.fromEntries(
        segments.map((s) => [
          '简体中文\u0000' + s.originalText,
          {
            translatedText: `翻译${s.originalText}`,
            _delay: true,
          },
        ]),
      ),
    );

    // 重写 sendMessage 来追踪并发
    vi.mocked(browser.runtime.sendMessage).mockImplementation(async (msg) => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      await new Promise((r) => setTimeout(r, 50));
      concurrentCount--;
      return { translatedText: `翻译${msg.payload.text}` };
    });

    await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  it('并发池返回正确结果 — 全部成功', async () => {
    const segments = Array.from({ length: 5 }, (_, i) => createSegment(`seg-${i}`));
    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn(async (msg) => ({
          translatedText: `翻译${msg.payload.text}`,
        })),
      },
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(5);
    expect(result.failed).toHaveLength(0);
  });

  it('中止信号 → 停止派发新段', async () => {
    const segments = [
      createSegment('seg-1'),
      createSegment('seg-2'),
      createSegment('seg-3'),
    ];
    const cache = new Map<string, string>();
    const onSettled = vi.fn();
    const controller = new AbortController();

    let callCount = 0;
    mockSendMessage({});

    vi.mocked(browser.runtime.sendMessage).mockImplementation(async (msg) => {
      callCount++;
      if (callCount === 1) {
        controller.abort();
      }
      await new Promise((r) => setTimeout(r, 100));
      return { translatedText: `翻译${msg.payload.text}` };
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
      signal: controller.signal,
    });

    // 第一个段开始翻译后中止，后续段不应派发
    expect(callCount).toBe(1);
    expect(result.succeeded.length + result.failed.length).toBeLessThan(3);
  });

  it('isActive 回调 → 返回 false 时停止派发', async () => {
    const segments = [
      createSegment('seg-1'),
      createSegment('seg-2'),
      createSegment('seg-3'),
    ];
    const cache = new Map<string, string>();
    const onSettled = vi.fn();
    let active = true;

    let callCount = 0;
    mockSendMessage({});

    vi.mocked(browser.runtime.sendMessage).mockImplementation(async (msg) => {
      callCount++;
      if (callCount === 1) {
        active = false;
      }
      await new Promise((r) => setTimeout(r, 100));
      return { translatedText: `翻译${msg.payload.text}` };
    });

    await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
      isActive: () => active,
    });

    expect(callCount).toBe(1);
  });

  it('空分段数组 → 返回空结果', async () => {
    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    const result = await runPool([], {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(onSettled).not.toHaveBeenCalled();
  });

  it('sendMessage 返回 { error } → 判为失败（非 reject）', async () => {
    const segments = [createSegment('error-seg')];
    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn(async () => ({
          translatedText: '',
          error: 'service unavailable',
          errorType: 'unreachable',
        })),
      },
    });

    const result = await runPool(segments, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].errorType).toBe('unreachable');
    expect(result.failed[0].status).toBe('failed');
  });
});

describe('retrySegments', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('重试失败段 → 状态重置后重新翻译', async () => {
    const failedSegs = [
      createSegment('retry-1'),
      createSegment('retry-2'),
    ];
    // 模拟之前失败的状态
    failedSegs[0].status = 'failed';
    failedSegs[0].errorType = 'network';
    failedSegs[1].status = 'failed';
    failedSegs[1].errorType = 'rate-limit';

    const cache = new Map<string, string>();
    const onSettled = vi.fn();

    mockSendMessage({
      '简体中文\u0000retry-1': { translatedText: '重试成功1' },
      '简体中文\u0000retry-2': { translatedText: '重试成功2' },
    });

    const result = await retrySegments(failedSegs, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(failedSegs[0].status).toBe('done');
    expect(failedSegs[0].errorType).toBeUndefined();
    expect(failedSegs[0].translatedText).toBe('重试成功1');
  });

  it('重试时缓存命中 → 不调用 sendMessage', async () => {
    const failedSegs = [createSegment('cached-retry')];
    failedSegs[0].status = 'failed';
    failedSegs[0].errorType = 'network';

    const cache = new Map<string, string>();
    cache.set('简体中文\u0000cached-retry', '缓存译文');
    const onSettled = vi.fn();

    mockSendMessage({});

    const result = await retrySegments(failedSegs, {
      targetLang: '简体中文',
      concurrency: 3,
      cache,
      onSettled,
    });

    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(failedSegs[0].status).toBe('done');
    expect(failedSegs[0].translatedText).toBe('缓存译文');
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
  });
});
