// @vitest-environment jsdom
// chunker 单元测试 + 性能回归
//
// 功能:
// - 同步调度器 (SYNC_SCHEDULER) 跑完整 walk, 验证段数 / 视口分类 / onComplete
// - 真实 rIC 路径 (createIdleChunkerScheduler) 在 jsdom 下走 setTimeout(0) 退路
// - isActive 失效路径: 注入同步调度器, 中途 isActive 翻 false → 整 walk reject
// - 多次 onChunk 派发: 大页 + rIC 退路, 验证 inView 优先 + 多次 flush
//
// 性能 (Q12=B 预算: 真 DOM 1000 段 ≤80ms, 5000 段 ≤400ms):
// 测「per-tick 主线程块」,而非「总墙钟时间」,因为 setTimeout(0) 退路在
// jsdom 中比真 DOM 慢 5-10×,总墙钟时间不可移植;per-tick 块是真实主线程占用指标。
// 用 TickRecorder 自定义调度器,记录每次 yield 前后时间戳,断言 max tick ≤ 阈值。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  discoverSegments,
  createIdleChunkerScheduler,
  SYNC_SCHEDULER,
  type ChunkerChunk,
} from './chunker';
import type { SegmentRecord } from './types';

/** 构造合成 N 段 DOM(深度 1-3,文本 60-200 字符) */
function buildSyntheticDom(segmentCount: number): HTMLElement {
  const body = document.createElement('div');
  for (let i = 0; i < segmentCount; i += 1) {
    const depth = (i % 3) + 1;
    let parent: HTMLElement = body;
    for (let d = 0; d < depth; d += 1) {
      const div = document.createElement('div');
      parent.appendChild(div);
      parent = div;
    }
    const p = document.createElement('p');
    p.textContent = `段 ${i}: ${'x'.repeat(60 + (i % 140))}`;
    parent.appendChild(p);
  }
  document.body.appendChild(body);
  return body;
}

function clearDom(): void {
  document.body.innerHTML = '';
}

/** 自定义调度器: 记录每次 yield 后的"下一个 tick 主线程块"耗时。 */
function createTickRecorder(budgetMs: number): {
  scheduler: { yield(): Promise<void>; budgetMs: number };
  getMaxTickMs(): number;
  getTotalYields(): number;
} {
  let lastResume: number | null = null;
  let maxTick = 0;
  let yields = 0;
  return {
    scheduler: {
      budgetMs,
      yield(): Promise<void> {
        return new Promise<void>((resolve) => {
          setTimeout(() => {
            if (lastResume !== null) {
              const tick = performance.now() - lastResume;
              if (tick > maxTick) maxTick = tick;
            }
            lastResume = performance.now();
            yields += 1;
            resolve();
          }, 0);
        });
      },
    },
    getMaxTickMs() { return maxTick; },
    getTotalYields() { return yields; },
  };
}

describe('chunker / discoverSegments (sync scheduler)', () => {
  beforeEach(() => clearDom());
  afterEach(() => clearDom());

  it('flat 模式: 小 DOM 一次 onChunk 收完', async () => {
    const root = buildSyntheticDom(5);
    const chunks: ChunkerChunk[] = [];
    const total = await discoverSegments({
      root,
      mode: 'flat',
      scheduler: SYNC_SCHEDULER,
      onChunk: (c) => chunks.push(c),
    });
    expect(total).toBe(5);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const all = chunks.flatMap((c) => [...c.inView, ...c.outOfView]);
    expect(all.length).toBe(5);
  });

  it('semantic 模式: 段数与 collectSemanticSegments 一致', async () => {
    const root = buildSyntheticDom(20);
    const total = await discoverSegments({
      root,
      mode: 'semantic',
      scheduler: SYNC_SCHEDULER,
    });
    expect(total).toBe(20);
  });

  it('isActive 失效: 走完后 isActive 翻 false 立即 reject (在 flush 后检查)', async () => {
    const root = buildSyntheticDom(10);
    let isActive = true;
    await expect(discoverSegments({
      root,
      mode: 'flat',
      scheduler: SYNC_SCHEDULER,
      onChunk: () => { isActive = false; },
      isActive: () => isActive,
    })).rejects.toThrow(/aborted/i);
  });

  it('isActive 起始 false: 立即 reject 不 walk', async () => {
    const root = buildSyntheticDom(10);
    const onSeg = vi.fn();
    await expect(discoverSegments({
      root,
      mode: 'flat',
      scheduler: SYNC_SCHEDULER,
      onSegment: onSeg,
      isActive: () => false,
    })).rejects.toThrow(/aborted/i);
    expect(onSeg).not.toHaveBeenCalled();
  });

  it('fire-and-forget 路径: isActive 中途翻 false 不抛未处理拒绝', async () => {
    const root = buildSyntheticDom(30);
    let isActive = true;
    let seenCount = 0;
    const unhandled: unknown[] = [];
    const handler = (e: PromiseRejectionEvent) => { unhandled.push(e.reason); e.preventDefault(); };
    globalThis.addEventListener('unhandledrejection', handler);
    try {
      await expect(discoverSegments({
        root,
        mode: 'flat',
        scheduler: SYNC_SCHEDULER,
        onSegment: () => { seenCount += 1; if (seenCount === 15) isActive = false; },
        isActive: () => isActive,
      })).rejects.toThrow(/aborted/i);
    } finally {
      globalThis.removeEventListener('unhandledrejection', handler);
    }
    await new Promise((r) => { setTimeout(r, 0); });
    expect(unhandled).toEqual([]);
  });

  it('chunk 内部: 自定义 isInViewport 偶数 idx 视口外,验证 emit 分组', async () => {
    const root = buildSyntheticDom(10);
    let i = 0;
    const custom = (_s: SegmentRecord) => { i += 1; return i % 2 === 1; };
    const chunks: ChunkerChunk[] = [];
    await discoverSegments({
      root,
      mode: 'flat',
      scheduler: SYNC_SCHEDULER,
      isInViewport: custom,
      onChunk: (c) => chunks.push(c),
    });
    const allIn = chunks.reduce((n, c) => n + c.inView.length, 0);
    const allOut = chunks.reduce((n, c) => n + c.outOfView.length, 0);
    expect(allIn).toBe(5);
    expect(allOut).toBe(5);
  });

  it('多次 onChunk: chunkSize 5 + 20 段, 至少 4 次 flush', async () => {
    const root = buildSyntheticDom(20);
    const chunks: ChunkerChunk[] = [];
    await discoverSegments({
      root,
      mode: 'flat',
      chunkSize: 5,
      scheduler: SYNC_SCHEDULER,
      onChunk: (c) => chunks.push(c),
    });
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    const total = chunks.reduce((n, c) => n + c.inView.length + c.outOfView.length, 0);
    expect(total).toBe(20);
  });
});

describe('chunker / discoverSegments (rIC 退路 in jsdom, TickRecorder)', () => {
  beforeEach(() => clearDom());
  afterEach(() => clearDom());

  it('100 段 / chunkSize 30: 多个 chunk + per-tick 块 ≤ 20ms (jsdom 上限)', async () => {
    const root = buildSyntheticDom(100);
    const rec = createTickRecorder(8);
    const chunks: ChunkerChunk[] = [];
    const total = await discoverSegments({
      root,
      mode: 'flat',
      chunkSize: 30,
      scheduler: rec.scheduler,
      onChunk: (c) => chunks.push(c),
    });
    expect(total).toBe(100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // jsdom setTimeout(0) 退路下, tick ≈ "jsdom 处理 30 段 + 调度延迟"。
    // 30 段 jsdom ≈ 10-15ms, 退路 setTimeout 0-2ms, 合 ≤20ms。
    expect(rec.getMaxTickMs()).toBeLessThan(20);
  });

  it('1000 段 / chunkSize 200: per-tick 块 ≤ 80ms (真 DOM Q12=B 预算上限)', async () => {
    const root = buildSyntheticDom(1000);
    const rec = createTickRecorder(8);
    const total = await discoverSegments({ root, mode: 'flat', chunkSize: 200, scheduler: rec.scheduler });
    expect(total).toBe(1000);
    // 真 DOM 200 段 walk < 16ms (Q9=B);jsdom 上限 80ms(含 setTimeout 退路)
    expect(rec.getMaxTickMs()).toBeLessThan(80);
  }, 5000);

  it('5000 段 / chunkSize 200: per-tick 块 ≤ 400ms (真 DOM Q12=B 预算上限)', async () => {
    const root = buildSyntheticDom(5000);
    const rec = createTickRecorder(8);
    const total = await discoverSegments({ root, mode: 'flat', chunkSize: 200, scheduler: rec.scheduler });
    expect(total).toBe(5000);
    // 真 DOM 200 段 walk 远低于 80ms;jsdom 上限 400ms 覆盖 5× 系数
    expect(rec.getMaxTickMs()).toBeLessThan(400);
  }, 15_000);

  it('1000 段 semantic: per-tick 块 ≤ 160ms (semantic walker 多 2-3× 节点访问)', async () => {
    const root = buildSyntheticDom(1000);
    const rec = createTickRecorder(8);
    const total = await discoverSegments({ root, mode: 'semantic', chunkSize: 200, scheduler: rec.scheduler });
    expect(total).toBe(1000);
    // 真 DOM 200 段 semantic walk < 32ms;jsdom 上限 160ms 覆盖 5× 系数
    expect(rec.getMaxTickMs()).toBeLessThan(160);
  }, 5000);
});

describe('chunker / scheduler contract', () => {
  it('createIdleChunkerScheduler 在 jsdom 下走 setTimeout 退路 (budgetMs 可配)', () => {
    const sched = createIdleChunkerScheduler(4);
    expect(sched.budgetMs).toBe(4);
    const p = sched.yield();
    expect(p).toBeInstanceOf(Promise);
    return p;
  });

  it('SYNC_SCHEDULER: budgetMs=0, yield 立刻 resolve', async () => {
    expect(SYNC_SCHEDULER.budgetMs).toBe(0);
    await expect(SYNC_SCHEDULER.yield()).resolves.toBeUndefined();
  });
});
