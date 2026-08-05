// @vitest-environment jsdom
// 传输批次打包器单元测试

import { describe, expect, it } from 'vitest';
import type { BatchTranslatedChunk, BatchTranslateChunk } from '@/shared/types';
import {
  MAX_BATCH_CHUNKS,
  MAX_BATCH_SOURCE_CHARS,
  countCodePoints,
  createTransportChunks,
  packTransportBatches,
} from './batch-packer';
import type { SegmentRecord } from './types';

function wireChunk(chunkId: string, text: string): BatchTranslateChunk {
  return {
    chunkId,
    segmentId: 'segment',
    parts: [{ partId: 0, sliceIndex: 0, text }],
  };
}

const translatedWireFixture: BatchTranslatedChunk = {
  chunkId: 'segment:0',
  translatedParts: [{ partId: 7, sliceIndex: 0, text: 'translated text' }],
};

function sourceCodePointCount(chunkOrBatch: BatchTranslateChunk | BatchTranslateChunk[]): number {
  const batch = Array.isArray(chunkOrBatch) ? chunkOrBatch : [chunkOrBatch];
  return batch.reduce(
    (total, chunk) => total + chunk.parts.reduce(
      (partTotal, part) => partTotal + countCodePoints(part.text),
      0,
    ),
    0,
  );
}

function segmentWithText(text: string): SegmentRecord {
  return {
    id: 'segment',
    el: document.createElement('p'),
    textNodes: [],
    originalText: text,
    parts: [{ id: 7, node: document.createTextNode(text), sourceText: text }],
    status: 'pending',
  };
}

describe('transport batch packing', () => {
  it('uses the streaming response wire shape without request-only fields', () => {
    expect(translatedWireFixture).toEqual({
      chunkId: 'segment:0',
      translatedParts: [{ partId: 7, sliceIndex: 0, text: 'translated text' }],
    });
  });

  it('puts 20 one-character chunks in one request and the 21st in another', () => {
    const chunks = Array.from({ length: 21 }, (_, i) => wireChunk(`c${i}`, 'x'));

    expect(packTransportBatches(chunks).map((batch) => batch.length)).toEqual([20, 1]);
  });

  it('counts Unicode code points and never exceeds 6000', () => {
    const chunks = [wireChunk('a', '😀'.repeat(3000)), wireChunk('b', '文'.repeat(3001))];

    expect(packTransportBatches(chunks).map(sourceCodePointCount)).toEqual([3000, 3001]);
  });

  it('transport-splits one oversized segment with stable slice indexes', () => {
    const chunks = createTransportChunks(segmentWithText('a'.repeat(6001)));

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.chunkId)).toEqual(['segment:0', 'segment:1']);
    expect(chunks.map((chunk) => chunk.parts[0].sliceIndex)).toEqual([0, 1]);
    expect(chunks.map(sourceCodePointCount)).toEqual([6000, 1]);
  });

  it('rejects empty and over-budget chunks instead of emitting invalid requests', () => {
    expect(() => packTransportBatches([wireChunk('empty', '')])).toThrow();
    expect(() => packTransportBatches([wireChunk('oversized', 'x'.repeat(MAX_BATCH_SOURCE_CHARS + 1))])).toThrow();
  });

  it('exports the literal transport limits', () => {
    expect(MAX_BATCH_CHUNKS).toBe(20);
    expect(MAX_BATCH_SOURCE_CHARS).toBe(6000);
  });
});
