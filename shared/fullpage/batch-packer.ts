// 全文翻译 transport chunk 切分与请求批次打包

import type { BatchTranslateChunk, BatchTranslatePart } from '@/shared/types';
import type { SegmentRecord } from './types';

export const MAX_BATCH_CHUNKS = 20;
export const MAX_BATCH_SOURCE_CHARS = 6000;

export const countCodePoints = (text: string) => Array.from(text).length;

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
  const parts = segment.parts.flatMap((part) => splitPart(part.id, part.sourceText, nextSliceIndex));
  const chunks: BatchTranslateChunk[] = [];
  let currentParts: BatchTranslatePart[] = [];
  let currentChars = 0;

  for (const part of parts) {
    const partChars = countCodePoints(part.text);
    if (partChars === 0) continue;
    if (currentParts.length && currentChars + partChars > MAX_BATCH_SOURCE_CHARS) {
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

  if (chunks.length === 0) {
    throw new Error(`Segment ${segment.id} has no transportable text`);
  }
  return chunks;
}

/** 将 transport chunks 以稳定顺序贪心打包为满足 provider 预算的请求。 */
export function packTransportBatches(chunks: BatchTranslateChunk[]): BatchTranslateChunk[][] {
  const batches: BatchTranslateChunk[][] = [];
  let current: BatchTranslateChunk[] = [];
  let chars = 0;

  for (const chunk of chunks) {
    const nextChars = chunkSourceChars(chunk);
    if (chunk.parts.length === 0 || nextChars === 0 || nextChars > MAX_BATCH_SOURCE_CHARS) {
      throw new Error(`Invalid transport chunk ${chunk.chunkId}`);
    }
    if (current.length && (current.length === MAX_BATCH_CHUNKS || chars + nextChars > MAX_BATCH_SOURCE_CHARS)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(chunk);
    chars += nextChars;
  }

  if (current.length) batches.push(current);
  return batches;
}
