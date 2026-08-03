// 带缓存的并发翻译池 — 并发受限 + 会话级缓存 + 重试

import type {
  SegmentRecord,
  TranslatePoolOptions,
  TranslatePoolResult,
} from './types';
import type { TranslateResult } from '../types';

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
