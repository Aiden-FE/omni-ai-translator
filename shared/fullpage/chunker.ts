// 大页面分段分片器 — 把同步 DOM 遍历切到 rIC 上,避免 1000+ 段页面首帧冻结。
//
// 设计要点:
// 1. 收集走 walkSegmentsGen / walkSemanticSegmentsGen (generator), 每段之间可让出。
// 2. 视口内段优先:每片 flush 内部先视口内再视口外,用户先看见可见区域译文。
// 3. 8ms 主线程预算:每片切到 rIC,Safari / jsdom 等无 rIC 环境走 setTimeout 退路。
// 4. isActive 守卫:仅在显式 await 路径(切片间 / 走完后)检查,fire-and-forget 路径不抛。
//
// 性能预算(Q12=B): 1000 段 ≤80ms,5000 段 ≤400ms。测试在 shared/fullpage/chunker.test.ts。
// 性能验证策略: 测「per-tick 主线程块」,而非「总墙钟时间」,因为 setTimeout(0) 退路在
// jsdom 中比真 DOM 慢 5-10×,总墙钟时间不可移植;per-tick 块是真实主线程占用指标。

import { isSegmentInViewport } from './translate-pool';
import { walkSegmentsGen, walkSemanticSegmentsGen } from './segmenter';
import type { SegmentRecord, SegmenterOptions } from './types';

/** 调度器抽象: 把"下一帧"挂到 rIC / setTimeout 上。测试用同步调度器注入。 */
export interface ChunkerScheduler {
  /** 调度一个恢复点,返回一个 promise(下一帧 idle 时 resolve)。 */
  yield(): Promise<void>;
  /** 主线程时间预算(ms),超过此值应让出。rIC 调度器一般 8;测试可调 0。 */
  readonly budgetMs: number;
}

/** 默认 rIC 调度器: 8ms 预算,无 rIC 时退到 setTimeout(0)。 */
export function createIdleChunkerScheduler(budgetMs = 8): ChunkerScheduler {
  const ric = typeof globalThis !== 'undefined'
    && typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback === 'function';
  return {
    budgetMs,
    yield() {
      if (ric) {
        return new Promise<void>((resolve) => {
          (globalThis as unknown as {
            requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void;
          }).requestIdleCallback(() => resolve(), { timeout: 50 });
        });
      }
      return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    },
  };
}

/** 分片模式: 决定走 walkSegments(传统)还是 walkSemanticSegments(LLM 语义)。 */
export type ChunkerMode = 'flat' | 'semantic';

/** 一个分片回调: 一批段被 emit 出来供编排器 dispatch。 */
export type ChunkerChunk = {
  /** 视口内段(优先 emit) */
  inView: SegmentRecord[];
  /** 视口外段(emit 后由编排器挂 IO) */
  outOfView: SegmentRecord[];
};

/** discoverSegments 选项 */
export interface DiscoverOptions {
  /** DOM 根 */
  root: ParentNode;
  /** flat = 传统 collectSegments 语义; semantic = LLM 语义块 */
  mode: ChunkerMode;
  /** 透传给 walker 的选项 */
  segmenter?: SegmenterOptions;
  /** 每片段数上限(同时触发 flush 条件之一); 默认 200 */
  chunkSize?: number;
  /** 调度器; 默认 createIdleChunkerScheduler(8) */
  scheduler?: ChunkerScheduler;
  /** 每次有段发现就回调(不切片,用于极简测试与调试) */
  onSegment?: (seg: SegmentRecord) => void;
  /** 每片 flush 时回调(inView + outOfView 都已按视口分组,数量可达 chunkSize 上限) */
  onChunk?: (chunk: ChunkerChunk) => void;
  /** 全部走完时回调(total 段数) */
  onComplete?: (total: number) => void;
  /** 会话守卫: 返回 false 时整 walk reject(仅在显式 await 路径检查) */
  isActive?: () => boolean;
  /** 视口判定,默认 isSegmentInViewport(translate-pool 内的快照式判定)。 */
  isInViewport?: (seg: SegmentRecord) => boolean;
}

export class DiscoveryAborted extends Error {
  constructor() { super('Discovery aborted'); this.name = 'DiscoveryAborted'; }
}

/**
 * 流式分段发现: 通过 walkSegmentsGen / walkSemanticSegmentsGen 走 generator,
 * 每 N 段或预算耗尽时 await 调度器让出,emits ChunkerChunk 给编排器。
 *
 * 算法:
 * - 内部走 generator 的 for...of; 每个 yield 后检查时间预算 + buffer 长度
 * - 触发 flush: 任意 buffer 满 chunkSize / 当前 tick 时间 > budgetMs
 * - flush: onChunk({ inView, outOfView }) → 一次 emit(inView 在前, outOfView 在后)
 * - 走完后 flush 残留 buffer
 * - isActive 守卫仅在 flush 间 / 走完后检查
 */
export async function discoverSegments(opts: DiscoverOptions): Promise<number> {
  const chunkSize = opts.chunkSize ?? 200;
  const scheduler = opts.scheduler ?? createIdleChunkerScheduler();
  const isInViewport = opts.isInViewport ?? isSegmentInViewport;

  let bufferInView: SegmentRecord[] = [];
  let bufferOutView: SegmentRecord[] = [];
  let total = 0;
  let tickStart = now();

  /** 仅在显式 await 路径调用: 切片/走完后检查 isActive。 */
  async function checkActiveOrAbort(): Promise<void> {
    if (opts.isActive && !opts.isActive()) {
      throw new DiscoveryAborted();
    }
  }

  async function flushBuffer(): Promise<void> {
    if (bufferInView.length === 0 && bufferOutView.length === 0) return;
    const chunk: ChunkerChunk = {
      inView: bufferInView,
      outOfView: bufferOutView,
    };
    bufferInView = [];
    bufferOutView = [];
    opts.onChunk?.(chunk);
  }

  async function maybeYield(): Promise<void> {
    const elapsed = now() - tickStart;
    const needFlush = bufferInView.length >= chunkSize
      || bufferOutView.length >= chunkSize
      || elapsed >= scheduler.budgetMs;
    if (!needFlush) return;
    await flushBuffer();
    tickStart = now();
    await scheduler.yield();
    await checkActiveOrAbort();
  }

  await checkActiveOrAbort();
  const gen = opts.mode === 'semantic'
    ? walkSemanticSegmentsGen(opts.root, opts.segmenter)
    : walkSegmentsGen(opts.root, opts.segmenter);
  for (const seg of gen) {
    total += 1;
    opts.onSegment?.(seg);
    if (isInViewport(seg)) {
      bufferInView.push(seg);
    } else {
      bufferOutView.push(seg);
    }
    await maybeYield();
  }
  await flushBuffer();
  await checkActiveOrAbort();
  opts.onComplete?.(total);
  return total;
}

/** 同步时间源,可被测试覆盖 */
function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/** 测试专用: 同步调度器(不真的让出,供功能测试用) */
export const SYNC_SCHEDULER: ChunkerScheduler = {
  budgetMs: 0,
  yield: () => Promise.resolve(),
};
