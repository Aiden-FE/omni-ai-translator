// @vitest-environment jsdom
// 传输批次打包器单元测试

import { describe, expect, it } from 'vitest';
import type { BatchTranslatedChunk, BatchTranslateChunk } from '@/shared/types';
import {
  MAX_BATCH_CHUNKS,
  MAX_BATCH_PARTS,
  MAX_BATCH_SOURCE_CHARS,
  countCodePoints,
  createTransportChunks,
  isValidBatchTranslateChunks,
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

function segmentWithParts(sourceParts: string[]): SegmentRecord {
  const parts = sourceParts.map((sourceText, id) => ({
    id,
    node: document.createTextNode(sourceText),
    sourceText,
  }));
  return {
    id: 'multipart-segment',
    el: document.createElement('p'),
    textNodes: parts.map((part) => part.node),
    originalText: sourceParts.join('').trim(),
    parts,
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

  it('limits complex requests to 40 total parts while preserving chunk order', () => {
    const chunks = Array.from({ length: 20 }, (_, chunkIndex) => ({
      chunkId: `complex-${chunkIndex}`,
      segmentId: `segment-${chunkIndex}`,
      parts: Array.from({ length: 5 }, (_, partId) => ({
        partId,
        sliceIndex: 0,
        text: 'x',
      })),
    }));

    const batches = packTransportBatches(chunks);

    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 4]);
    expect(batches.map((batch) => batch.flatMap((chunk) => chunk.parts).length)).toEqual([
      40,
      40,
      20,
    ]);
    expect(batches.flat().map((chunk) => chunk.chunkId)).toEqual(
      chunks.map((chunk) => chunk.chunkId),
    );
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

  it('omits whitespace-only semantic parts from the transport wire', () => {
    const chunks = createTransportChunks(segmentWithParts(['Hello', ' \t\n', 'world']));

    expect(chunks).toEqual([{
      chunkId: 'multipart-segment:0',
      segmentId: 'multipart-segment',
      parts: [
        { partId: 0, sliceIndex: 0, text: 'Hello' },
        { partId: 2, sliceIndex: 1, text: 'world' },
      ],
    }]);
  });

  it('transport-splits one semantic segment that exceeds the part budget', () => {
    const chunks = createTransportChunks(
      segmentWithParts(Array.from({ length: 41 }, () => 'x')),
    );

    expect(chunks.map((chunk) => chunk.parts.length)).toEqual([40, 1]);
    expect(chunks.map((chunk) => chunk.chunkId)).toEqual([
      'multipart-segment:0',
      'multipart-segment:1',
    ]);
    expect(chunks.flatMap((chunk) => chunk.parts).map((part) => part.sliceIndex)).toEqual(
      Array.from({ length: 41 }, (_, index) => index),
    );
  });

  it('rejects empty and over-budget chunks instead of emitting invalid requests', () => {
    expect(() => packTransportBatches([wireChunk('empty', '')])).toThrow();
    expect(() => packTransportBatches([wireChunk('oversized', 'x'.repeat(MAX_BATCH_SOURCE_CHARS + 1))])).toThrow();
  });

  it('exports the literal transport limits', () => {
    expect(MAX_BATCH_CHUNKS).toBe(20);
    expect(MAX_BATCH_PARTS).toBe(40);
    expect(MAX_BATCH_SOURCE_CHARS).toBe(6000);
  });

  it('validates runtime batch limits and identifier uniqueness at the background boundary', () => {
    const boundaryBatch = Array.from({ length: 20 }, (_, index) => ({
      chunkId: `chunk-${index}`,
      segmentId: `segment-${index}`,
      parts: [{ partId: 0, sliceIndex: 0, text: 'x'.repeat(300) }],
    }));

    expect(isValidBatchTranslateChunks(boundaryBatch)).toBe(true);
    expect(isValidBatchTranslateChunks([
      ...boundaryBatch,
      wireChunk('chunk-20', 'x'),
    ])).toBe(false);
    expect(isValidBatchTranslateChunks([
      wireChunk('large-a', 'x'.repeat(6000)),
      wireChunk('large-b', 'x'),
    ])).toBe(false);
    expect(isValidBatchTranslateChunks([
      wireChunk('duplicate', 'a'),
      wireChunk('duplicate', 'b'),
    ])).toBe(false);
    expect(isValidBatchTranslateChunks([{
      chunkId: 'duplicate-parts',
      segmentId: 'segment',
      parts: [
        { partId: 1, sliceIndex: 2, text: 'a' },
        { partId: 1, sliceIndex: 2, text: 'b' },
      ],
    }])).toBe(false);
  });

  it('rejects more than 40 total parts at the background boundary', () => {
    const chunkWithParts = (count: number): BatchTranslateChunk => ({
      chunkId: `parts-${count}`,
      segmentId: 'segment',
      parts: Array.from({ length: count }, (_, partId) => ({
        partId,
        sliceIndex: 0,
        text: 'x',
      })),
    });

    expect(isValidBatchTranslateChunks([chunkWithParts(40)])).toBe(true);
    expect(isValidBatchTranslateChunks([chunkWithParts(41)])).toBe(false);
  });
});
