import type { BatchTranslateChunk, BatchTranslatedChunk } from '@/shared/types';
import { createReasoningStreamFilter, sanitizeReasoningArtifacts } from './reasoning-filter';

interface ScannerState {
  depth: number;
  inString: boolean;
  escaped: boolean;
  objectStart: number;
  buffer: string;
}

interface BatchObjectStream {
  push(delta: string): void;
  finish(): string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function partKey(partId: number, sliceIndex: number): string {
  return `${partId}:${sliceIndex}`;
}

function validateChunk(
  value: unknown,
  expectedById: Map<string, BatchTranslateChunk>,
): BatchTranslatedChunk | null {
  if (!isRecord(value) || typeof value.chunkId !== 'string' || !Array.isArray(value.translatedParts)) {
    return null;
  }

  const expected = expectedById.get(value.chunkId);
  if (!expected || value.translatedParts.length !== expected.parts.length) return null;

  const expectedParts = new Set(expected.parts.map((part) => partKey(part.partId, part.sliceIndex)));
  const seenParts = new Set<string>();
  const translatedParts: BatchTranslatedChunk['translatedParts'] = [];

  for (const translatedPart of value.translatedParts) {
    if (!isRecord(translatedPart)
      || typeof translatedPart.partId !== 'number'
      || typeof translatedPart.sliceIndex !== 'number'
      || typeof translatedPart.text !== 'string') {
      return null;
    }

    const key = partKey(translatedPart.partId, translatedPart.sliceIndex);
    if (!expectedParts.has(key) || seenParts.has(key)) return null;

    seenParts.add(key);
    translatedParts.push({
      partId: translatedPart.partId,
      sliceIndex: translatedPart.sliceIndex,
      text: sanitizeReasoningArtifacts(translatedPart.text),
    });
  }

  return { chunkId: value.chunkId, translatedParts };
}

/** Builds the provider instructions separately so Anthropic can keep structured input in user content. */
export function buildBatchInstructions(targetLang: string): string {
  return [
    `Translate every chunk into ${targetLang}.`,
    'Do not reason or output analysis, <think>, <analysis>, or control tokens.',
    'Output one compact JSON object per input chunk and no other text.',
    'Response object schema: {"chunkId": string, "translatedParts": [{"partId": number, "sliceIndex": number, "text": string}]}.',
    'Use each input chunkId, partId, and sliceIndex unchanged. Return every input chunk and every input part exactly once; do not add, remove, or duplicate them.',
    'Put the translation only in translatedParts[].text.',
  ].join('\n');
}

/** Builds the batch protocol prompt while keeping all untrusted input structured as JSON. */
export function buildBatchPrompt(targetLang: string, chunks: BatchTranslateChunk[]): string {
  return `${buildBatchInstructions(targetLang)}\n${JSON.stringify(chunks)}`;
}

/** Parses independently completed JSON translation objects from an arbitrary text stream. */
export function createBatchObjectStream(
  expected: BatchTranslateChunk[],
  onChunk: (chunk: BatchTranslatedChunk) => void,
): BatchObjectStream {
  const expectedById = new Map(expected.map((chunk) => [chunk.chunkId, chunk]));
  const settledIds = new Set<string>();
  const scanner: ScannerState = {
    depth: 0,
    inString: false,
    escaped: false,
    objectStart: -1,
    buffer: '',
  };

  function resetScanner(): void {
    scanner.depth = 0;
    scanner.inString = false;
    scanner.escaped = false;
    scanner.objectStart = -1;
    scanner.buffer = '';
  }

  function settleObject(objectText: string): void {
    let chunk: BatchTranslatedChunk | null;
    try {
      chunk = validateChunk(JSON.parse(objectText), expectedById);
    } catch {
      // A balanced candidate can still be malformed JSON; it is not a chunk.
      return;
    }

    if (!chunk || settledIds.has(chunk.chunkId)) return;
    onChunk(chunk);
    settledIds.add(chunk.chunkId);
  }

  function scanVisibleText(delta: string): void {
    for (const char of delta) {
      if (scanner.depth === 0) {
        if (char !== '{') continue;
        scanner.depth = 1;
        scanner.objectStart = 0;
        scanner.buffer = char;
        continue;
      }

      scanner.buffer += char;

      if (scanner.inString) {
        if (scanner.escaped) {
          scanner.escaped = false;
        } else if (char === '\\') {
          scanner.escaped = true;
        } else if (char === '"') {
          scanner.inString = false;
        }
        continue;
      }

      if (char === '"') {
        scanner.inString = true;
      } else if (char === '{') {
        scanner.depth += 1;
      } else if (char === '}') {
        scanner.depth -= 1;
        if (scanner.depth === 0) {
          const objectText = scanner.buffer.slice(scanner.objectStart);
          resetScanner();
          settleObject(objectText);
        }
      }
    }
  }

  const reasoningFilter = createReasoningStreamFilter(scanVisibleText);

  return {
    push(delta: string): void {
      for (const char of delta) {
        if (scanner.depth > 0) {
          scanVisibleText(char);
        } else {
          reasoningFilter.push(char);
        }
      }
    },
    finish(): string[] {
      reasoningFilter.finish();
      return expected
        .map((chunk) => chunk.chunkId)
        .filter((chunkId) => !settledIds.has(chunkId));
    },
  };
}
