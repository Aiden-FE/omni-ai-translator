// 全文翻译 transport chunk 切分与请求批次打包

import type { BatchTranslateChunk, BatchTranslatePart } from '@/shared/types';
import type { SegmentRecord } from './types';

export const MAX_BATCH_CHUNKS = 20;
export const MAX_BATCH_PARTS = 40;
export const MAX_BATCH_SOURCE_CHARS = 6000;

export const countCodePoints = (text: string) => Array.from(text).length;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDenseNonEmptyArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

/** Revalidates an untrusted Port payload before it reaches a provider. */
export function isValidBatchTranslateChunks(value: unknown): value is BatchTranslateChunk[] {
  if (!isDenseNonEmptyArray(value) || value.length > MAX_BATCH_CHUNKS) return false;

  const chunkIds = new Set<string>();
  let sourceChars = 0;
  let totalParts = 0;
  for (const chunk of value) {
    if (!isRecord(chunk)
      || typeof chunk.chunkId !== 'string'
      || typeof chunk.segmentId !== 'string'
      || chunkIds.has(chunk.chunkId)
      || !isDenseNonEmptyArray(chunk.parts)) {
      return false;
    }
    chunkIds.add(chunk.chunkId);
    totalParts += chunk.parts.length;
    if (totalParts > MAX_BATCH_PARTS) return false;

    const partPairs = new Set<string>();
    let chunkChars = 0;
    for (const part of chunk.parts) {
      if (!isRecord(part)
        || !Number.isInteger(part.partId)
        || !Number.isInteger(part.sliceIndex)
        || typeof part.text !== 'string') {
        return false;
      }
      const pair = `${part.partId}:${part.sliceIndex}`;
      if (partPairs.has(pair)) return false;
      partPairs.add(pair);
      chunkChars += countCodePoints(part.text);
    }
    if (chunkChars === 0 || chunkChars > MAX_BATCH_SOURCE_CHARS) return false;
    sourceChars += chunkChars;
    if (sourceChars > MAX_BATCH_SOURCE_CHARS) return false;
  }
  return true;
}

function isSentencePunctuation(char: string): boolean {
  return /[.!?。！？]/u.test(char);
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function findSplitIndex(codePoints: string[]): number {
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    if (isSentencePunctuation(codePoints[index])) return index + 1;
  }
  for (let index = codePoints.length - 1; index >= 0; index -= 1) {
    if (isWhitespace(codePoints[index])) return index + 1;
  }
  return codePoints.length;
}

function splitOversizedPart(text: string): string[] {
  const codePoints = Array.from(text);
  const slices: string[] = [];
  let start = 0;

  while (start < codePoints.length) {
    const end = Math.min(start + MAX_BATCH_SOURCE_CHARS, codePoints.length);
    if (end === codePoints.length) {
      slices.push(codePoints.slice(start).join(''));
      break;
    }
    const splitAt = findSplitIndex(codePoints.slice(start, end));
    slices.push(codePoints.slice(start, start + splitAt).join(''));
    start += splitAt;
  }

  return slices;
}

function splitPart(partId: number, text: string, nextSliceIndex: () => number): BatchTranslatePart[] {
  return splitOversizedPart(text).map((slice) => ({
    partId,
    sliceIndex: nextSliceIndex(),
    text: slice,
  }));
}

function chunkSourceChars(chunk: BatchTranslateChunk): number {
  return chunk.parts.reduce((total, part) => total + countCodePoints(part.text), 0);
}

/**
 * 将一个语义段按 provider 的单 chunk 字符预算切为可传输片段。
 * 每个 part 的 source text 原样连接后等于原始文本，chunk 与 slice 索引均稳定。
 */
export function createTransportChunks(segment: SegmentRecord): BatchTranslateChunk[] {
  if (!segment.parts?.length) {
    throw new Error(`Segment ${segment.id} has no semantic text parts`);
  }

  let sliceIndex = 0;
  const nextSliceIndex = () => {
    const current = sliceIndex;
    sliceIndex += 1;
    return current;
  };
  const parts = segment.parts
    .filter((part) => part.sourceText.trim().length > 0)
    .flatMap((part) => splitPart(part.id, part.sourceText, nextSliceIndex));
  const chunks: BatchTranslateChunk[] = [];
  let currentParts: BatchTranslatePart[] = [];
  let currentChars = 0;

  for (const part of parts) {
    const partChars = countCodePoints(part.text);
    if (partChars === 0) continue;
    if (currentParts.length && (
      currentParts.length === MAX_BATCH_PARTS
      || currentChars + partChars > MAX_BATCH_SOURCE_CHARS
    )) {
      chunks.push({
        chunkId: `${segment.id}:${chunks.length}`,
        segmentId: segment.id,
        parts: currentParts,
      });
      currentParts = [];
      currentChars = 0;
    }
    currentParts.push(part);
    currentChars += partChars;
  }

  if (currentParts.length) {
    chunks.push({
      chunkId: `${segment.id}:${chunks.length}`,
      segmentId: segment.id,
      parts: currentParts,
    });
  }

  return chunks;
}

/** 将 transport chunks 以稳定顺序贪心打包为满足 provider 预算的请求。 */
export function packTransportBatches(chunks: BatchTranslateChunk[]): BatchTranslateChunk[][] {
  const batches: BatchTranslateChunk[][] = [];
  let current: BatchTranslateChunk[] = [];
  let chars = 0;
  let parts = 0;

  for (const chunk of chunks) {
    const nextChars = chunkSourceChars(chunk);
    const nextParts = chunk.parts.length;
    if (nextParts === 0
      || nextParts > MAX_BATCH_PARTS
      || nextChars === 0
      || nextChars > MAX_BATCH_SOURCE_CHARS) {
      throw new Error(`Invalid transport chunk ${chunk.chunkId}`);
    }
    if (current.length && (
      current.length === MAX_BATCH_CHUNKS
      || parts + nextParts > MAX_BATCH_PARTS
      || chars + nextChars > MAX_BATCH_SOURCE_CHARS
    )) {
      batches.push(current);
      current = [];
      chars = 0;
      parts = 0;
    }
    current.push(chunk);
    chars += nextChars;
    parts += nextParts;
  }

  if (current.length) batches.push(current);
  return batches;
}
