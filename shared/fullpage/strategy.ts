// 全文翻译策略接缝 — 把「当前源支持哪种翻译路径」收敛成一次解析、一个接口。
//
// 编排器（orchestrator）在 doStart 时按 capability 选择一个 TranslationStrategy：
// - LlmBatchStrategy：LLM 语义分段 + 批量流式池（runBatchPool / retryBatchSegments）
// - TraditionalStrategy：平铺分段 + 并发池（runPool / retrySegments）
//
// 策略持有各自会话缓存、并发门与并发上限，编排器不再需要知道该传哪个池、哪个 cache。
// 这样 capability 分支在编排器里只出现一次（选择策略），而不是分散到四个调用点。

import { collectSegments, collectSemanticSegments } from './segmenter';
import { runPool, retrySegments } from './translate-pool';
import { runBatchPool, retryBatchSegments } from './batch-pool';
import type { ChunkerMode } from './chunker';
import type {
  SegmentRecord,
  SemanticTranslation,
  BatchRequestGate,
} from './types';

/** 每一轮派发的执行上下文（不随策略变化的部分，由编排器提供）。 */
export interface StrategyContext {
  targetLang: string;
  generation: number;
  isActive: () => boolean;
  onSettled: (seg: SegmentRecord) => void;
}

/**
 * 全文翻译策略。接口刻意小：四种能力（分块模式 / 节点收段 / 派发 / 重试）
 * 背后是各自池的全部布线（缓存、并发门、上限、错误分类、回退）。
 */
export interface TranslationStrategy {
  /** chunker 发现分段使用的模式（语义 vs 平铺）。 */
  readonly chunkerMode: ChunkerMode;
  /** 从一棵新增子树收集分段（增量翻译使用）。 */
  collectFor(node: HTMLElement): SegmentRecord[];
  /** 派发一组新段入翻译池。 */
  enqueue(segs: SegmentRecord[], ctx: StrategyContext): Promise<void>;
  /** 重新派发失败段。 */
  retry(segs: SegmentRecord[], ctx: StrategyContext): Promise<void>;
}

/** 默认池并发上限；两条路径都固定 3。 */
const DEFAULT_CONCURRENCY = 3;

export interface LlmBatchStrategyOptions {
  /** 结构化语义译文缓存（会话级）。 */
  semanticCache: Map<string, SemanticTranslation>;
  /** 跨 initial / viewport / dynamic / retry 入口共享的三槽并发门。 */
  requestGate: BatchRequestGate;
}

/** LLM 语义批量流式路径。 */
export function createLlmBatchStrategy(
  options: LlmBatchStrategyOptions,
): TranslationStrategy {
  const { semanticCache, requestGate } = options;
  return {
    chunkerMode: 'semantic',
    collectFor: (node) => collectSemanticSegments(node),
    enqueue: async (segs, ctx) => {
      await runBatchPool(segs, {
        targetLang: ctx.targetLang,
        concurrency: DEFAULT_CONCURRENCY,
        cache: semanticCache,
        requestGate,
        onSettled: ctx.onSettled,
        isActive: ctx.isActive,
      });
    },
    retry: async (segs, ctx) => {
      await retryBatchSegments(segs, {
        targetLang: ctx.targetLang,
        concurrency: DEFAULT_CONCURRENCY,
        cache: semanticCache,
        requestGate,
        onSettled: ctx.onSettled,
        isActive: ctx.isActive,
      });
    },
  };
}

export interface TraditionalStrategyOptions {
  /** 平铺译文缓存（会话级；恢复原文后保留）。 */
  cache: Map<string, string>;
}

/** 传统源（google / microsoft）平铺并发池路径。 */
export function createTraditionalStrategy(
  options: TraditionalStrategyOptions,
): TranslationStrategy {
  const { cache } = options;
  return {
    chunkerMode: 'flat',
    collectFor: (node) => collectSegments(node),
    enqueue: async (segs, ctx) => {
      await runPool(segs, {
        targetLang: ctx.targetLang,
        concurrency: DEFAULT_CONCURRENCY,
        cache,
        onSettled: ctx.onSettled,
        isActive: ctx.isActive,
      });
    },
    retry: async (segs, ctx) => {
      await retrySegments(segs, {
        targetLang: ctx.targetLang,
        concurrency: DEFAULT_CONCURRENCY,
        cache,
        onSettled: ctx.onSettled,
        isActive: ctx.isActive,
      });
    },
  };
}

export interface PickStrategyDeps {
  cache: Map<string, string>;
  semanticCache: Map<string, SemanticTranslation>;
  requestGate: BatchRequestGate;
}

/** 按当前源的 capability 选择策略：批量流式 → LLM；否则传统平铺。 */
export function pickStrategy(
  batchStreamEnabled: boolean,
  deps: PickStrategyDeps,
): TranslationStrategy {
  return batchStreamEnabled
    ? createLlmBatchStrategy({
        semanticCache: deps.semanticCache,
        requestGate: deps.requestGate,
      })
    : createTraditionalStrategy({ cache: deps.cache });
}
