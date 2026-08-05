// 带缓存的并发翻译池 — 并发受限 + 会话级缓存 + 重试
//
// 顶部额外提供视口判定（isSegmentInViewport）与 IO 调度工具（createViewportObserver），
// 供编排器在调用 runPool 之前完成“视口内先入池 / 视口外挂 IO 观察”的拆分。
// runPool / retrySegments 核心签名保持不变；视口分组由编排器负责。

import type {
  SegmentRecord,
  TranslatePoolOptions,
  TranslatePoolResult,
} from './types';
import type { TranslateResult } from '../types';

// ============================================================================
// 视口判定与 IntersectionObserver 调度工具
// ============================================================================

/** 扩展注入子树的标记属性选择器 */
const TRANSLATOR_ATTR = '[data-llm-translator]';

/**
 * 快照式判定分段是否在视口内。
 *
 * 返回 `true` 的短路优先级：
 * 1. jsdom / SSR 兜底：`typeof window === 'undefined' || window.innerHeight === 0`
 *    — jsdom 无布局，避免将全部段误判为视口外导致整页拖入 IO 队列。
 * 2. `getClientRects().length === 0` — 同样兜底 jsdom （renderer 也走同个启发式）。
 * 3. 段是扩展注入元素（`closest('[data-llm-translator]')` 命中） — 防御性兜底，
 *    注入元素理论上不会是 seg.el，但为防误判。
 * 4. 几何判定：`rect.top < innerHeight && rect.bottom > 0 && rect.left < innerWidth && rect.right > 0`。
 *
 * 边界条件：边界相切（top === innerHeight 或 bottom === 0）视为视口外（严格不等）。
 */
export function isSegmentInViewport(seg: SegmentRecord): boolean {
  // 1. jsdom / SSR 兜底
  if (typeof window === 'undefined' || window.innerHeight === 0) {
    return true;
  }

  const el = seg.el;

  // 2. getClientRects 空兜底（jsdom 同样恒空）
  if (el.getClientRects().length === 0) {
    return true;
  }

  // 3. 扩展注入元素兜底
  if (typeof el.closest === 'function' && el.closest(TRANSLATOR_ATTR)) {
    return true;
  }

  // 4. 几何判定
  const rect = el.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/** 视口观察器接口 */
export interface ViewportObserver {
  /** 注册分段到观察器。重复注册同一 seg 幂等。 */
  observe(seg: SegmentRecord): void;
  /** 注销分段。未注册或重复注销幂等。 */
  unobserve(seg: SegmentRecord): void;
  /** 断开观察器并清空内部映射。重复调用安全。断开后 observe 为 no-op。 */
  disconnect(): void;
}

/**
 * 创建视口观察器。内部维护 `Map<Element, SegmentRecord>` + 单个 IntersectionObserver。
 * IO callback 命中相交时调用 onEnter(seg) 并自动 unobserve（一次性进入即出列）。
 *
 * 环境兜底：`typeof IntersectionObserver === 'undefined'`（如 jsdom）时返回降级观察器，
 * `observe(seg)` 同步调用 onEnter(seg) — 与“视口外段直接全部入池”原行为一致。
 *
 * rootMargin='0px'、threshold=0：严格视口边界，任何像素进入即触发。
 */
export function createViewportObserver(
  onEnter: (seg: SegmentRecord) => void,
): ViewportObserver {
  // jsdom 等环境无 IO：降级路径，observe 立即同步调 onEnter
  if (typeof IntersectionObserver === 'undefined') {
    return {
      observe(seg: SegmentRecord): void {
        onEnter(seg);
      },
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      unobserve(_seg: SegmentRecord): void {
        // no-op
      },
      disconnect(): void {
        // no-op
      },
    };
  }

  const elToSeg = new Map<Element, SegmentRecord>();
  let io: IntersectionObserver | null = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const seg = elToSeg.get(entry.target);
        if (!seg) continue;
        // 一次性：进入即出列，onEnter 错误传播给调用方
        elToSeg.delete(entry.target);
        if (io) {
          io.unobserve(entry.target);
        }
        onEnter(seg);
      }
    },
    { root: null, rootMargin: '0px', threshold: 0 },
  );
  let alive = true;

  return {
    observe(seg: SegmentRecord): void {
      if (!alive) return;
      if (elToSeg.has(seg.el)) return; // 重复注册幂等
      elToSeg.set(seg.el, seg);
      if (io) {
        io.observe(seg.el);
      }
    },
    unobserve(seg: SegmentRecord): void {
      const removed = elToSeg.delete(seg.el);
      if (removed && io) {
        io.unobserve(seg.el);
      }
    },
    disconnect(): void {
      if (!alive) return;
      alive = false;
      if (io) {
        io.disconnect();
        io = null;
      }
      elToSeg.clear();
    },
  };
}

// ============================================================================
// 原有翻译池实现
// ============================================================================

/** 缓存 key 分隔符 */
const CACHE_SEP = '\u0000';

/**
 * 执行翻译池：并发受限地翻译分段，带缓存与中止支持
 * @param segments - 待翻译的分段数组
 * @param opts - 翻译池选项
 * @returns 翻译结果
 */
export async function runPool(
  segments: SegmentRecord[],
  opts: TranslatePoolOptions,
): Promise<TranslatePoolResult> {
  const {
    targetLang,
    concurrency = 3,
    cache,
    onSettled,
    signal,
    isActive,
  } = opts;

  const succeeded: SegmentRecord[] = [];
  const failed: SegmentRecord[] = [];
  let index = 0;

  /** 检查是否应停止 */
  function shouldStop(): boolean {
    if (signal?.aborted) {
      return true;
    }
    if (isActive && !isActive()) {
      return true;
    }
    return false;
  }

  /** 翻译单个分段 */
  async function translateSegment(seg: SegmentRecord): Promise<void> {
    // 标记为 translating
    seg.status = 'translating';
    onSettled(seg);

    // 构建缓存 key
    const cacheKey = `${targetLang}${CACHE_SEP}${seg.originalText}`;

    // 先查缓存
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      seg.translatedText = cached;
      seg.status = 'done';
      onSettled(seg);
      succeeded.push(seg);
      return;
    }

    // 调用 background 翻译通道（复用现有 translate 通道，逐段非流式）
    let result: TranslateResult;
    try {
      result = await browser.runtime.sendMessage({
        type: 'translate',
        payload: {
          text: seg.originalText,
          targetLang,
        },
      });
    } catch (err) {
      // sendMessage reject（如 background 未响应/连接异常）-> 归为 network 失败
      result = {
        translatedText: '',
        error: err instanceof Error ? err.message : String(err),
        errorType: 'network',
      };
    }

    // 检查 result.error（不是 reject，而是返回体中的 error 字段）
    if (result.error) {
      seg.status = 'failed';
      seg.errorType = result.errorType ?? 'network';
      onSettled(seg);
      failed.push(seg);
      return;
    }

    // 成功：写入缓存 + 译文
    cache.set(cacheKey, result.translatedText);
    seg.translatedText = result.translatedText;
    seg.status = 'done';
    onSettled(seg);
    succeeded.push(seg);
  }

  // 并发池：维护最多 concurrency 个进行中的 promise
  const running: Promise<void>[] = [];

  while (index < segments.length) {
    // 检查中止
    if (shouldStop()) {
      break;
    }

    const seg = segments[index++];
    const p = translateSegment(seg).finally(() => {
      const idx = running.indexOf(p);
      if (idx !== -1) {
        running.splice(idx, 1);
      }
    });
    running.push(p);

    // 如果达到并发上限，等待一个完成
    if (running.length >= concurrency) {
      await Promise.race(running);
    }
  }

  // 等待所有剩余任务完成
  await Promise.all(running);

  return { succeeded, failed };
}

/**
 * 重试失败分段 — 复用同一池逻辑
 * @param failedSegments - 之前失败的分段数组
 * @param opts - 与 runPool 相同的选项
 * @returns 重试结果
 */
export async function retrySegments(
  failedSegments: SegmentRecord[],
  opts: Omit<TranslatePoolOptions, 'signal'>,
): Promise<TranslatePoolResult> {
  // 重置状态
  for (const seg of failedSegments) {
    seg.status = 'pending';
    seg.errorType = undefined;
    seg.translatedText = undefined;
  }

  return runPool(failedSegments, {
    ...opts,
    // 重试时不清除缓存（已失败的 key 可能在重试时命中缓存或成功）
  });
}
