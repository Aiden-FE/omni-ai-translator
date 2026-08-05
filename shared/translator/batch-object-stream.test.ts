import { describe, expect, it } from 'vitest';
import type { BatchTranslateChunk, BatchTranslatedChunk } from '@/shared/types';
import { buildBatchPrompt, createBatchObjectStream } from './batch-object-stream';

const expectedChunks: BatchTranslateChunk[] = [
  {
    chunkId: 'c1',
    segmentId: 'segment-1',
    parts: [{ partId: 0, sliceIndex: 0, text: 'Hello' }],
  },
  {
    chunkId: 'c2',
    segmentId: 'segment-2',
    parts: [{ partId: 4, sliceIndex: 1, text: 'World' }],
  },
];

function translatedChunk(
  chunkId: string,
  translatedParts: BatchTranslatedChunk['translatedParts'],
): string {
  return JSON.stringify({ chunkId, translatedParts });
}

describe('batch object stream', () => {
  it('parses adjacent objects split at arbitrary network boundaries', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
    const c1 = translatedChunk('c1', [{ partId: 0, sliceIndex: 0, text: '你' }]);
    const c2 = translatedChunk('c2', [{ partId: 4, sliceIndex: 1, text: '好' }]);

    parser.push(`reasoning that must be ignored\n\`\`\`json\n${c1.slice(0, 13)}`);
    parser.push(c1.slice(13));
    parser.push(`${c2}\n\`\`\``);

    expect(parser.finish()).toEqual([]);
    expect(results.map((result) => result.chunkId)).toEqual(['c1', 'c2']);
  });

  it('keeps braces and escaped quotes inside JSON strings out of scanner state', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
    const payload = translatedChunk('c1', [
      { partId: 0, sliceIndex: 0, text: '保留 {brace} 和 \\"quote\\"' },
    ]);

    for (let index = 0; index < payload.length; index += 1) {
      parser.push(payload.slice(index, index + 1));
    }

    expect(results).toEqual([
      {
        chunkId: 'c1',
        translatedParts: [{ partId: 0, sliceIndex: 0, text: '保留 {brace} 和 \\"quote\\"' }],
      },
    ]);
    expect(parser.finish()).toEqual(['c2']);
  });

  it('does not settle JSON objects contained in split reasoning blocks', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
    const reasoningChunk = translatedChunk('c1', [{ partId: 0, sliceIndex: 0, text: '推理中的错误译文' }]);
    const finalChunk = translatedChunk('c1', [{ partId: 0, sliceIndex: 0, text: '最终译文' }]);

    parser.push('<thi');
    parser.push(`nk>${reasoningChunk}</th`);
    parser.push(`ink>${finalChunk}`);

    expect(results).toEqual([
      { chunkId: 'c1', translatedParts: [{ partId: 0, sliceIndex: 0, text: '最终译文' }] },
    ]);
    expect(parser.finish()).toEqual(['c2']);
  });

  it('filters reasoning and control artifacts from validated translation text', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
    const payload = translatedChunk('c1', [
      { partId: 0, sliceIndex: 0, text: '<think>private</think>可见<analysis>hidden</analysis></s>' },
    ]);

    for (let index = 0; index < payload.length; index += 1) {
      parser.push(payload.slice(index, index + 1));
    }

    expect(results).toEqual([
      { chunkId: 'c1', translatedParts: [{ partId: 0, sliceIndex: 0, text: '可见' }] },
    ]);
  });

  it('ignores duplicate, unknown, malformed, and mismatched part objects', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));
    const validC1 = translatedChunk('c1', [{ partId: 0, sliceIndex: 0, text: '一' }]);
    const unknown = translatedChunk('c9', [{ partId: 0, sliceIndex: 0, text: '未知' }]);
    const mismatchedC2 = translatedChunk('c2', [{ partId: 4, sliceIndex: 0, text: '错误' }]);

    parser.push(`${validC1}${validC1}${unknown}{not json}${mismatchedC2}`);

    expect(results.map((result) => result.chunkId)).toEqual(['c1']);
    expect(parser.finish()).toEqual(['c2']);
  });

  it('rejects missing IDs, duplicated parts, missing parts, and non-string translations', () => {
    const results: BatchTranslatedChunk[] = [];
    const parser = createBatchObjectStream(expectedChunks, (chunk) => results.push(chunk));

    parser.push(JSON.stringify({
      translatedParts: [{ partId: 0, sliceIndex: 0, text: 'missing chunk id' }],
    }));
    parser.push(translatedChunk('c2', [
      { partId: 4, sliceIndex: 1, text: 'one' },
      { partId: 4, sliceIndex: 1, text: 'duplicate' },
    ]));
    parser.push(translatedChunk('c2', []));
    parser.push(JSON.stringify({
      chunkId: 'c2',
      translatedParts: [{ partId: 4, sliceIndex: 1, text: 42 }],
    }));

    expect(results).toEqual([]);
    expect(parser.finish()).toEqual(['c1', 'c2']);
  });

  it('propagates callback failures without settling the chunk', () => {
    const callbackError = new Error('consumer failed');
    const parser = createBatchObjectStream(expectedChunks, () => {
      throw callbackError;
    });
    const payload = translatedChunk('c1', [{ partId: 0, sliceIndex: 0, text: '译文' }]);

    expect(() => parser.push(payload)).toThrow(callbackError);
    expect(parser.finish()).toEqual(['c1', 'c2']);
  });
});

describe('batch prompt', () => {
  it('uses the protocol requirements and serializes the exact chunk data as JSON', () => {
    const chunks: BatchTranslateChunk[] = [
      {
        chunkId: 'input-id-{1}',
        segmentId: 'segment-a',
        parts: [{ partId: 3, sliceIndex: 9, text: 'Text with "quotes" and {braces}' }],
      },
    ];

    const prompt = buildBatchPrompt('Chinese', chunks);
    const jsonData = prompt.slice(prompt.lastIndexOf('\n') + 1);

    expect(prompt).toContain('Do not reason or output analysis, <think>, <analysis>, or control tokens.');
    expect(prompt).toContain('Output one compact JSON object per completed chunk and no other text.');
    expect(JSON.parse(jsonData)).toEqual(chunks);
  });
});
