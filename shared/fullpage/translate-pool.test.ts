// @vitest-environment jsdom
// 翻译池单元测试

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runPool,
  retrySegments,
  isSegmentInViewport,
  createViewportObserver,
} from './translate-pool';
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

// ============================================================================
// 视口判定与 IntersectionObserver 调度工具
// ============================================================================

/**
 * 创建一个可控制 getBoundingClientRect / getClientRects / closest 的段元素 mock。
 * - getClientRects 默认为空数组（jsdom 一致）
 * - getBoundingClientRect 通过 rect 覆盖
 * - closest 通过 closestImpl 覆盖（默认返回 null）
 */
function createRectSegment(
  rect: { top: number; bottom: number; left: number; right: number } | null,
  options: { closestImpl?: (selector: string) => Element | null } = {},
): SegmentRecord {
  const mockEl = {
    tagName: 'P',
    getClientRects: () => [],
    getBoundingClientRect: () =>
      rect ?? ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 } as DOMRect),
    hasAttribute: () => false,
    parentElement: null,
    childNodes: [],
    closest: options.closestImpl ?? (() => null),
  } as unknown as HTMLElement;

  const mockText = {
    nodeType: 3,
    textContent: 'x',
  } as unknown as Text;

  return {
    id: 'seg-rect',
    el: mockEl,
    textNodes: [mockText],
    originalText: 'x',
    status: 'pending',
  };
}

/** 设置 window.innerHeight / innerWidth，保存原始值供 afterEach 还原 */
function setViewportSize(height: number, width: number): { restore: () => void } {
  const original = {
    innerHeight: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
    innerWidth: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
  };
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  return {
    restore: () => {
      if (original.innerHeight) {
        Object.defineProperty(window, 'innerHeight', original.innerHeight);
      }
      if (original.innerWidth) {
        Object.defineProperty(window, 'innerWidth', original.innerWidth);
      }
    },
  };
}

describe('isSegmentInViewport', () => {
  afterEach(() => {
    // 还原窗口尺寸到 jsdom 默认
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
  });

  it('jsdom 兜底：getClientRects 长度为 0 → 一律视为视口内', () => {
    // jsdom 默认 getClientRects 返回空数组
    const seg = createRectSegment({ top: 99999, bottom: 100000, left: 0, right: 100 });
    expect(isSegmentInViewport(seg)).toBe(true);
  });

  it('jsdom 兜底：window.innerHeight === 0 → 视为视口内', () => {
    const handle = setViewportSize(0, 1024);
    try {
      // 绕过 getClientRects 空，让几何判定走到：需要 innerHeight > 0
      const seg = createRectSegment({ top: -100, bottom: -50, left: 0, right: 100 });
      // 模拟 getClientRects 非空（让几何判定执行）
      (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
        [{} as DOMRect] as unknown as DOMRectList;
      expect(isSegmentInViewport(seg)).toBe(true);
    } finally {
      handle.restore();
    }
  });

  it('扩展注入元素（closest 命中 data-llm-translator）→ 视为视口内', () => {
    // 模拟非 jsdom 路径（让 getClientRects 非空）
    const seg = createRectSegment(
      { top: -9999, bottom: -9000, left: 0, right: 100 },
      {
        closestImpl: (selector: string) => {
          if (selector === '[data-llm-translator]') {
            return seg.el; // 自身是注入元素
          }
          return null;
        },
      },
    );
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(true);
  });

  it('完全在视口内 → true', () => {
    setViewportSize(800, 1200);
    const seg = createRectSegment({ top: 100, bottom: 200, left: 50, right: 150 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(true);
  });

  it('完全在视口下方 → false', () => {
    setViewportSize(800, 1200);
    const seg = createRectSegment({ top: 2000, bottom: 2100, left: 50, right: 150 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });

  it('完全在视口上方 → false', () => {
    setViewportSize(800, 1200);
    const seg = createRectSegment({ top: -200, bottom: -100, left: 50, right: 150 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });

  it('左侧越界（完全在左侧外）→ false', () => {
    setViewportSize(800, 1200);
    // 完全在视口左侧：right <= 0
    const seg = createRectSegment({ top: 100, bottom: 200, left: -200, right: -50 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });

  it('右侧越界（完全在右侧外）→ false', () => {
    setViewportSize(800, 1200);
    // 完全在视口右侧：left >= innerWidth
    const seg = createRectSegment({ top: 100, bottom: 200, left: 1500, right: 1600 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });

  it('边界：top === innerHeight → false（严格小于）', () => {
    setViewportSize(800, 1200);
    const seg = createRectSegment({ top: 800, bottom: 900, left: 50, right: 150 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });

  it('边界：bottom === 0 → false（严格大于）', () => {
    setViewportSize(800, 1200);
    const seg = createRectSegment({ top: -100, bottom: 0, left: 50, right: 150 });
    (seg.el as unknown as { getClientRects: () => DOMRectList }).getClientRects = () =>
      [{} as DOMRect] as unknown as DOMRectList;
    expect(isSegmentInViewport(seg)).toBe(false);
  });
});

describe('createViewportObserver', () => {
  /** 一个可控的 mock IntersectionObserver */
  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    readonly root: Element | null = null;
    readonly rootMargin: string;
    readonly thresholds: ReadonlyArray<number>;
    private callback: IntersectionObserverCallback;
    private observed: Set<Element> = new Set();
    unobserveCalls: Element[] = [];
    disconnectCalls = 0;

    constructor(
      callback: IntersectionObserverCallback,
      opts: { root?: Element | null; rootMargin?: string; threshold?: number | number[] } = {},
    ) {
      this.callback = callback;
      this.rootMargin = opts.rootMargin ?? '0px';
      this.thresholds = Array.isArray(opts.threshold)
        ? opts.threshold
        : [opts.threshold ?? 0];
      MockIntersectionObserver.instances.push(this);
    }

    observe(el: Element): void {
      this.observed.add(el);
    }

    unobserve(el: Element): void {
      this.observed.delete(el);
      this.unobserveCalls.push(el);
    }

    disconnect(): void {
      this.observed.clear();
      this.disconnectCalls++;
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    /** 测试用：触发一次相交（isIntersecting=true） */
    triggerIntersect(el: Element, isIntersecting: boolean): void {
      this.callback(
        [
          {
            isIntersecting,
            target: el,
            intersectionRatio: isIntersecting ? 1 : 0,
            boundingClientRect: {} as DOMRectReadOnly,
            intersectionRect: {} as DOMRectReadOnly,
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver,
      );
    }
  }

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
  });

  it('jsdom 无 IntersectionObserver → observe 立即同步触发 onEnter（降级路径）', () => {
    // jsdom 默认无 IntersectionObserver
    const onEnter = vi.fn();
    const observer = createViewportObserver(onEnter);
    const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });

    observer.observe(seg);

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter).toHaveBeenCalledWith(seg);
  });

  it('有 IO 环境：observe 注册到 IO；相交后触发 onEnter 并自动 unobserve', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const onEnter = vi.fn();
      const observer = createViewportObserver(onEnter);
      const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });

      observer.observe(seg);

      // 创建了一个 IO 实例
      expect(MockIntersectionObserver.instances).toHaveLength(1);
      const io = MockIntersectionObserver.instances[0];
      expect(io.observed.has(seg.el)).toBe(true);
      expect(onEnter).not.toHaveBeenCalled();

      // 触发相交
      io.triggerIntersect(seg.el, true);

      // onEnter 调用，元素自动 unobserve
      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onEnter).toHaveBeenCalledWith(seg);
      expect(io.unobserveCalls).toContain(seg.el);
      expect(io.observed.has(seg.el)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('有 IO 环境：非相交不触发 onEnter', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const onEnter = vi.fn();
      const observer = createViewportObserver(onEnter);
      const seg = createRectSegment({ top: 2000, bottom: 2100, left: 0, right: 100 });

      observer.observe(seg);
      const io = MockIntersectionObserver.instances[0];
      io.triggerIntersect(seg.el, false);

      expect(onEnter).not.toHaveBeenCalled();
      expect(io.observed.has(seg.el)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('重复 observe 同一 seg 幂等：不重复注册到 IO', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const onEnter = vi.fn();
      const observer = createViewportObserver(onEnter);
      const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });

      observer.observe(seg);
      observer.observe(seg);
      observer.observe(seg);

      const io = MockIntersectionObserver.instances[0];
      // observe 只在第一次真正注册（observed Set 大小为 1）
      expect(io.observed.size).toBe(1);

      // 触发一次相交：onEnter 只调一次
      io.triggerIntersect(seg.el, true);
      expect(onEnter).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unobserve 未注册的 seg 幂等', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const observer = createViewportObserver(vi.fn());
      const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });

      // 未 observe 就 unobserve：不报错
      expect(() => observer.unobserve(seg)).not.toThrow();
      // 再次 unobserve 同一 seg：仍不报错
      observer.observe(seg);
      expect(() => observer.unobserve(seg)).not.toThrow();
      expect(() => observer.unobserve(seg)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('disconnect 幂等：多次调用安全', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const observer = createViewportObserver(vi.fn());
      observer.observe(createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 }));

      expect(() => observer.disconnect()).not.toThrow();
      expect(() => observer.disconnect()).not.toThrow();
      expect(() => observer.disconnect()).not.toThrow();

      // IO disconnect 只在第一次实际生效（disconnectCalls ≥ 1，后续 mock 实现累积计数）
      const io = MockIntersectionObserver.instances[0];
      expect(io.disconnectCalls).toBeGreaterThanOrEqual(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('disconnect 后 observe 不触发 onEnter', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const onEnter = vi.fn();
      const observer = createViewportObserver(onEnter);

      observer.disconnect();
      const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });
      observer.observe(seg);

      // disconnect 后，observe 是 no-op：不触发 onEnter、IO 实例已被断开
      expect(onEnter).not.toHaveBeenCalled();
      const io = MockIntersectionObserver.instances[0];
      // 元素未被加入观察集合（observe 是 no-op）
      expect(io.observed.has(seg.el)).toBe(false);
      // IO 已被 disconnect
      expect(io.disconnectCalls).toBeGreaterThanOrEqual(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('onEnter 抛错时观察器内部状态保持稳定（不破坏后续 unobserve）', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      const onEnter = vi.fn(() => {
        throw new Error('boom');
      });
      const observer = createViewportObserver(onEnter);
      const seg = createRectSegment({ top: 0, bottom: 100, left: 0, right: 100 });

      observer.observe(seg);
      const io = MockIntersectionObserver.instances[0];

      // onEnter 抛错应传播（调用方需自行 catch）
      expect(() => io.triggerIntersect(seg.el, true)).toThrow('boom');
      // 但元素仍被 unobserve（出列逻辑已完成）
      expect(io.unobserveCalls).toContain(seg.el);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('IO 创建参数：rootMargin=0px, threshold=0', () => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    try {
      createViewportObserver(vi.fn());
      const io = MockIntersectionObserver.instances[0];
      expect(io.rootMargin).toBe('0px');
      expect(io.thresholds).toEqual([0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
