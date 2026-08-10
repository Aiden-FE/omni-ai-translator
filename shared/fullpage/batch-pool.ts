// LLM 全文批量流式翻译池：transport 打包、三 Port 调度与语义 owner 渐进 settle

import type {
  BatchStreamPortMessage,
  BatchTranslateChunk,
  ErrorType,
} from '@/shared/types';
import { createTransportChunks, packTransportBatches } from './batch-packer';
import type {
  BatchPoolOptions,
  BatchRequestGate,
  SegmentRecord,
  SemanticTranslation,
  TranslatePoolResult,
} from './types';

export type { BatchPoolOptions, BatchRequestGate } from './types';

const BATCH_PORT_NAME = 'fullpage-translate-batch-stream';
const BATCH_PORT_TIMEOUT_MS = 65_000;
const SEMANTIC_CACHE_VERSION = 'semantic-v1';
const CACHE_SEP = '\u0000';
let requestSequence = 0;

/** 创建一个 FIFO 三槽请求门，供同一 orchestrator 的多个 pool 调用共享。 */
export function createBatchRequestGate(concurrency: 3 = 3): BatchRequestGate {
  let active = 0;
  const waiters: Array<(release: () => void) => void> = [];

  const createRelease = (): (() => void) => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) {
        next(createRelease());
      } else {
        active -= 1;
      }
    };
  };

  return {
    acquire(): (() => void) | Promise<() => void> {
      if (active < concurrency) {
        active += 1;
        return createRelease();
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}

interface BatchPort {
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
  };
  onDisconnect: {
    addListener(listener: () => void): void;
  };
  postMessage(message: BatchStreamPortMessage): void;
  disconnect(): void;
}

interface ValidatedTranslatedPart {
  partId: number;
  sliceIndex: number;
  text: string;
}

interface OwnerState {
  segment: SegmentRecord;
  chunks: BatchTranslateChunk[];
  received: Map<string, ValidatedTranslatedPart[]>;
  started: boolean;
  settled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function semanticCacheKey(targetLang: string, segment: SegmentRecord): string {
  const sourcePartSignature = JSON.stringify(
    segment.parts?.map((part) => part.sourceText) ?? [],
  );
  return [
    SEMANTIC_CACHE_VERSION,
    targetLang,
    segment.originalText,
    sourcePartSignature,
  ].join(CACHE_SEP);
}

function isCompleteCachedTranslation(
  value: SemanticTranslation | undefined,
  expectedParts: number,
): value is SemanticTranslation {
  return value !== undefined
    && typeof value.translatedText === 'string'
    && Array.isArray(value.translatedParts)
    && value.translatedParts.length === expectedParts
    && value.translatedParts.every((part) => typeof part === 'string');
}

function partKey(partId: number, sliceIndex: number): string {
  return `${partId}:${sliceIndex}`;
}

function validateTranslatedChunk(
  value: unknown,
  expected: BatchTranslateChunk,
): ValidatedTranslatedPart[] | null {
  if (!isRecord(value)
    || value.chunkId !== expected.chunkId
    || !Array.isArray(value.translatedParts)
    || value.translatedParts.length !== expected.parts.length) {
    return null;
  }

  const expectedParts = new Map(
    expected.parts.map((part) => [partKey(part.partId, part.sliceIndex), part]),
  );
  const translatedParts: ValidatedTranslatedPart[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.translatedParts.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value.translatedParts, index)) return null;
    const part = value.translatedParts[index];
    if (!isRecord(part)
      || !Number.isInteger(part.partId)
      || !Number.isInteger(part.sliceIndex)
      || typeof part.text !== 'string') {
      return null;
    }
    const key = partKey(part.partId as number, part.sliceIndex as number);
    if (!expectedParts.has(key) || seen.has(key)) return null;
    seen.add(key);
    translatedParts.push({
      partId: part.partId as number,
      sliceIndex: part.sliceIndex as number,
      text: part.text,
    });
  }
  return seen.size === expectedParts.size ? translatedParts : null;
}

function nextRequestId(): string {
  requestSequence += 1;
  return `fullpage-batch-${requestSequence}`;
}

/**
 * 运行语义批量翻译池。每个 owner 在自身全部 transport chunks 校验完成时立即 settle，
 * 无需等待同一请求或其他请求结束。
 */
export async function runBatchPool(
  segments: SegmentRecord[],
  opts: BatchPoolOptions,
): Promise<TranslatePoolResult> {
  const succeeded = new Set<SegmentRecord>();
  const failed = new Set<SegmentRecord>();
  const chunkOwners = new Map<string, OwnerState>();

  const shouldStop = () => opts.isActive !== undefined && !opts.isActive();

  function settleSucceeded(owner: OwnerState, translation: SemanticTranslation): void {
    if (owner.settled) return;
    owner.settled = true;
    owner.segment.translatedParts = [...translation.translatedParts];
    owner.segment.translatedText = translation.translatedText;
    owner.segment.errorType = undefined;
    owner.segment.status = 'done';
    opts.cache.set(
      semanticCacheKey(opts.targetLang, owner.segment),
      {
        translatedText: translation.translatedText,
        translatedParts: [...translation.translatedParts],
      },
    );
    succeeded.add(owner.segment);
    opts.onSettled(owner.segment);
  }

  function settleFailed(owner: OwnerState, errorType: ErrorType = 'network'): void {
    if (owner.settled) return;
    owner.settled = true;
    owner.segment.translatedText = undefined;
    owner.segment.translatedParts = undefined;
    owner.segment.status = 'failed';
    owner.segment.errorType = errorType;
    failed.add(owner.segment);
    opts.onSettled(owner.segment);
  }

  function markTranslating(owner: OwnerState): void {
    if (owner.started || owner.settled) return;
    owner.started = true;
    owner.segment.translatedText = undefined;
    owner.segment.translatedParts = undefined;
    owner.segment.errorType = undefined;
    owner.segment.status = 'translating';
    opts.onSettled(owner.segment);
  }

  function trySettleOwner(owner: OwnerState): void {
    if (owner.settled || owner.received.size !== owner.chunks.length) return;
    const parts = owner.segment.parts;
    if (!parts) {
      settleFailed(owner, 'unreachable');
      return;
    }

    const translatedSlices = new Map<number, Array<{ sliceIndex: number; text: string }>>();
    for (const chunk of owner.chunks) {
      const translated = owner.received.get(chunk.chunkId);
      if (!translated) return;
      for (const part of translated) {
        const slices = translatedSlices.get(part.partId) ?? [];
        slices.push({ sliceIndex: part.sliceIndex, text: part.text });
        translatedSlices.set(part.partId, slices);
      }
    }

    const translatedParts = parts.map((part) => {
      if (part.sourceText.trim().length === 0) return part.sourceText;
      const slices = translatedSlices.get(part.id) ?? [];
      slices.sort((left, right) => left.sliceIndex - right.sliceIndex);
      return slices.map((slice) => slice.text).join('');
    });
    settleSucceeded(owner, {
      translatedParts,
      translatedText: translatedParts.join(''),
    });
  }

  const transportChunks: BatchTranslateChunk[] = [];
  for (const segment of segments) {
    if (shouldStop()) break;
    const expectedPartCount = segment.parts?.length ?? 0;
    const cached = opts.cache.get(semanticCacheKey(opts.targetLang, segment));
    if (isCompleteCachedTranslation(cached, expectedPartCount)) {
      const owner: OwnerState = {
        segment,
        chunks: [],
        received: new Map(),
        started: true,
        settled: false,
      };
      segment.status = 'translating';
      opts.onSettled(segment);
      settleSucceeded(owner, cached);
      continue;
    }

    let chunks: BatchTranslateChunk[];
    try {
      chunks = createTransportChunks(segment);
    } catch {
      const owner: OwnerState = {
        segment,
        chunks: [],
        received: new Map(),
        started: true,
        settled: false,
      };
      settleFailed(owner, 'unreachable');
      continue;
    }
    const owner: OwnerState = {
      segment,
      chunks,
      received: new Map(),
      started: false,
      settled: false,
    };
    if (chunks.length === 0) {
      markTranslating(owner);
      const translatedParts = segment.parts?.map((part) => part.sourceText) ?? [];
      settleSucceeded(owner, {
        translatedParts,
        translatedText: translatedParts.join(''),
      });
      continue;
    }
    for (const chunk of chunks) {
      chunkOwners.set(chunk.chunkId, owner);
      transportChunks.push(chunk);
    }
  }

  const batches = packTransportBatches(transportChunks);
  const requestGate = opts.requestGate ?? createBatchRequestGate(opts.concurrency ?? 3);
  let nextBatchIndex = 0;

  async function runBatch(batch: BatchTranslateChunk[]): Promise<void> {
    const requestId = nextRequestId();
    const expectedChunks = new Map(batch.map((chunk) => [chunk.chunkId, chunk]));
    const batchOwners = new Set(
      batch.map((chunk) => chunkOwners.get(chunk.chunkId)).filter(
        (owner): owner is OwnerState => owner !== undefined,
      ),
    );
    for (const owner of batchOwners) markTranslating(owner);

    await new Promise<void>((resolve, reject) => {
      let port: BatchPort | null = null;
      let finished = false;

      const closePort = () => {
        try {
          port?.disconnect();
        } catch {
          // The background may have disconnected immediately after its terminal message.
        }
      };

      const finish = (
        kind: 'done' | 'error' | 'disconnect',
        errorType: ErrorType = 'network',
        initialError: { value: unknown } | null = null,
      ) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);

        let settlementError = initialError;
        const failOwner = (owner: OwnerState) => {
          try {
            settleFailed(owner, errorType);
          } catch (error) {
            settlementError ??= { value: error };
          }
        };
        try {
          if (kind === 'done') {
            for (const chunk of batch) {
              const owner = chunkOwners.get(chunk.chunkId);
              if (owner && !owner.received.has(chunk.chunkId)) failOwner(owner);
            }
          } else {
            for (const owner of batchOwners) failOwner(owner);
          }
        } catch (error) {
          settlementError ??= { value: error };
        } finally {
          closePort();
          if (settlementError) reject(settlementError.value);
          else resolve();
        }
      };

      const timeoutId = setTimeout(() => finish('error', 'network'), BATCH_PORT_TIMEOUT_MS);
      try {
        port = browser.runtime.connect({ name: BATCH_PORT_NAME }) as unknown as BatchPort;
        port.onMessage.addListener((message: unknown) => {
          if (finished || !isRecord(message) || message.requestId !== requestId) return;
          if (message.type === 'chunk') {
            if (!isRecord(message.chunk) || typeof message.chunk.chunkId !== 'string') return;
            const expected = expectedChunks.get(message.chunk.chunkId);
            const owner = chunkOwners.get(message.chunk.chunkId);
            if (!expected || !owner || owner.settled || owner.received.has(expected.chunkId)) return;
            const translated = validateTranslatedChunk(message.chunk, expected);
            if (!translated) return;
            owner.received.set(expected.chunkId, translated);
            try {
              trySettleOwner(owner);
            } catch (error) {
              finish('error', 'network', { value: error });
            }
            return;
          }
          if (message.type === 'done') {
            finish('done');
            return;
          }
          if (message.type === 'error' && isRecord(message.result)) {
            const errorType = typeof message.result.errorType === 'string'
              ? message.result.errorType as ErrorType
              : 'network';
            finish('error', errorType);
          }
        });
        port.onDisconnect.addListener(() => finish('disconnect'));
        port.postMessage({
          type: 'request',
          requestId,
          targetLang: opts.targetLang,
          chunks: batch,
        });
      } catch {
        finish('disconnect');
      }
    });
  }

  async function worker(): Promise<void> {
    while (!shouldStop()) {
      const index = nextBatchIndex;
      if (index >= batches.length) return;
      nextBatchIndex += 1;
      const acquired = requestGate.acquire();
      const release = typeof acquired === 'function' ? acquired : await acquired;
      try {
        if (shouldStop()) return;
        await runBatch(batches[index]);
      } finally {
        release();
      }
    }
  }

  const workerCount = Math.min(opts.concurrency ?? 3, batches.length);
  const workerErrors: unknown[] = [];
  await Promise.all(Array.from({ length: workerCount }, async () => {
    try {
      await worker();
    } catch (error) {
      workerErrors.push(error);
    }
  }));
  if (workerErrors.length > 0) throw workerErrors[0];

  return {
    succeeded: segments.filter((segment) => succeeded.has(segment)),
    failed: segments.filter((segment) => failed.has(segment)),
  };
}

/** 重置失败语义段并用相同 transport/Port 路径重试。 */
export async function retryBatchSegments(
  failedSegments: SegmentRecord[],
  opts: BatchPoolOptions,
): Promise<TranslatePoolResult> {
  for (const segment of failedSegments) {
    segment.status = 'pending';
    segment.errorType = undefined;
    segment.translatedText = undefined;
    segment.translatedParts = undefined;
  }
  return runBatchPool(failedSegments, opts);
}
