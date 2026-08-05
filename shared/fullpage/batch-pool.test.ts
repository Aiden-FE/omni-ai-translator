// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BatchStreamPortMessage,
  BatchTranslatedChunk,
} from '@/shared/types';
import {
  createBatchRequestGate,
  runBatchPool,
  retryBatchSegments,
} from './batch-pool';
import type { SegmentRecord } from './types';

type MessageListener = (message: BatchStreamPortMessage) => void;
type DisconnectListener = () => void;

class FakePort {
  readonly name = 'fullpage-translate-batch-stream';
  readonly posted: BatchStreamPortMessage[] = [];
  readonly onMessage = {
    addListener: (listener: MessageListener) => this.messageListeners.push(listener),
  };
  readonly onDisconnect = {
    addListener: (listener: DisconnectListener) => this.disconnectListeners.push(listener),
  };
  readonly postMessage = vi.fn((message: BatchStreamPortMessage) => {
    this.posted.push(message);
  });
  readonly disconnect = vi.fn(() => this.close());
  private readonly messageListeners: MessageListener[] = [];
  private readonly disconnectListeners: DisconnectListener[] = [];
  private closed = false;

  constructor(private readonly runtime: FakeRuntime) {}

  get request(): Extract<BatchStreamPortMessage, { type: 'request' }> {
    const request = this.posted.find(
      (message): message is Extract<BatchStreamPortMessage, { type: 'request' }> =>
        message.type === 'request',
    );
    if (!request) throw new Error('Port has no request');
    return request;
  }

  emitChunk(chunk: BatchTranslatedChunk, requestId = this.request.requestId): void {
    this.emit({ type: 'chunk', requestId, chunk });
  }

  emitDone(missingChunkIds: string[] = [], requestId = this.request.requestId): void {
    this.emit({ type: 'done', requestId, missingChunkIds });
    this.close();
  }

  emitError(
    missingChunkIds: string[] = [],
    requestId = this.request.requestId,
  ): void {
    this.emit({
      type: 'error',
      requestId,
      result: {
        missingChunkIds,
        error: 'batch failed',
        errorType: 'rate-limit',
      },
    });
    this.close();
  }

  emitDisconnect(): void {
    this.close();
  }

  private emit(message: BatchStreamPortMessage): void {
    for (const listener of [...this.messageListeners]) listener(message);
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.runtime.portClosed();
    for (const listener of [...this.disconnectListeners]) listener();
  }
}

class FakeRuntime {
  readonly ports: FakePort[] = [];
  readonly connect = vi.fn(() => {
    const port = new FakePort(this);
    this.ports.push(port);
    this.active += 1;
    this.maxActive = Math.max(this.maxActive, this.active);
    return port;
  });
  private active = 0;
  private maxActive = 0;

  activePortCount(): number {
    return this.active;
  }

  maxActivePortCount(): number {
    return this.maxActive;
  }

  portClosed(): void {
    this.active -= 1;
  }
}

function semanticSegment(id: string, sourceParts: string[]): SegmentRecord {
  const el = document.createElement('p');
  const parts = sourceParts.map((sourceText, partId) => {
    const node = document.createTextNode(sourceText);
    el.appendChild(node);
    return { id: partId, node, sourceText };
  });
  document.body.appendChild(el);
  return {
    id,
    el,
    textNodes: parts.map((part) => part.node),
    originalText: sourceParts.join('').trim(),
    parts,
    status: 'pending',
  };
}

function translatedChunk(
  port: FakePort,
  chunkIndex: number,
  translate: (text: string) => string = (text) => `[译]${text}`,
): BatchTranslatedChunk {
  const chunk = port.request.chunks[chunkIndex];
  return {
    chunkId: chunk.chunkId,
    translatedParts: chunk.parts.map((part) => ({
      partId: part.partId,
      sliceIndex: part.sliceIndex,
      text: translate(part.text),
    })),
  };
}

async function drainMicrotasks(rounds = 10): Promise<void> {
  for (let index = 0; index < rounds; index += 1) await Promise.resolve();
}

function observePromise(promise: Promise<unknown>) {
  let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
  let reason: unknown;
  void promise.then(
    () => {
      state = 'fulfilled';
    },
    (error: unknown) => {
      state = 'rejected';
      reason = error;
    },
  );
  return {
    state: () => state,
    reason: () => reason,
  };
}

function options(cache = new Map()) {
  return {
    targetLang: '简体中文',
    concurrency: 3 as const,
    cache,
    onSettled: vi.fn(),
  };
}

let runtime: FakeRuntime;

beforeEach(() => {
  document.body.innerHTML = '';
  runtime = new FakeRuntime();
  vi.stubGlobal('browser', { runtime });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runBatchPool', () => {
  it('settles a complete owner before the containing request finishes', async () => {
    const segments = [semanticSegment('s0', ['Hello']), semanticSegment('s1', ['World'])];

    const poolPromise = runBatchPool(segments, options());
    const port = runtime.ports[0];
    expect(segments.map((segment) => segment.status)).toEqual(['translating', 'translating']);

    port.emitChunk(translatedChunk(port, 0));

    expect(segments[0].status).toBe('done');
    expect(segments[0].translatedParts).toEqual(['[译]Hello']);
    expect(segments[1].status).toBe('translating');

    port.emitChunk(translatedChunk(port, 1));
    port.emitDone();
    await poolPromise;
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.activePortCount()).toBe(0);
  });

  it('opens at most three ports and starts the fourth only after one closes', async () => {
    const segments = Array.from(
      { length: 4 },
      (_, index) => semanticSegment(`s${index}`, ['x'.repeat(6000)]),
    );

    const poolPromise = runBatchPool(segments, options());

    expect(runtime.ports).toHaveLength(3);
    expect(runtime.activePortCount()).toBe(3);
    expect(runtime.maxActivePortCount()).toBe(3);

    const firstPort = runtime.ports[0];
    firstPort.emitChunk(translatedChunk(firstPort, 0));
    firstPort.emitDone();
    await drainMicrotasks();

    expect(runtime.ports).toHaveLength(4);
    expect(runtime.activePortCount()).toBe(3);
    expect(runtime.maxActivePortCount()).toBe(3);

    for (const port of runtime.ports.slice(1)) {
      port.emitChunk(translatedChunk(port, 0));
      port.emitDone();
    }
    await poolPromise;
  });

  it('rejects terminal settlement errors without leaking shared gate permits', async () => {
    const requestGate = createBatchRequestGate();
    const settlementError = new Error('settlement callback failed');
    const failingPools = Array.from({ length: 3 }, (_, index) => {
      const poolPromise = runBatchPool(
        [semanticSegment(`failing-${index}`, ['x'.repeat(6000)])],
        {
          ...options(),
          requestGate,
          onSettled: vi.fn((segment: SegmentRecord) => {
            if (segment.status === 'failed') throw settlementError;
          }),
        },
      );
      return {
        poolPromise,
        observed: observePromise(poolPromise),
      };
    });
    expect(runtime.ports).toHaveLength(3);

    const queuedSegment = semanticSegment('queued', ['x'.repeat(6000)]);
    const queuedPromise = runBatchPool([queuedSegment], {
      ...options(),
      requestGate,
    });
    expect(runtime.ports).toHaveLength(3);

    const terminalThrows: unknown[] = [];
    for (const port of runtime.ports.slice(0, 3)) {
      try {
        port.emitDone([port.request.chunks[0].chunkId]);
        terminalThrows.push(undefined);
      } catch (error) {
        terminalThrows.push(error);
      }
    }
    await drainMicrotasks();

    expect(runtime.ports).toHaveLength(4);
    expect(failingPools.map(({ observed }) => observed.state())).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(failingPools.map(({ observed }) => observed.reason())).toEqual([
      settlementError,
      settlementError,
      settlementError,
    ]);
    expect(terminalThrows).toEqual([undefined, undefined, undefined]);
    for (const port of runtime.ports.slice(0, 3)) {
      expect(port.disconnect).toHaveBeenCalledTimes(1);
    }

    const queuedPort = runtime.ports[3];
    queuedPort.emitChunk(translatedChunk(queuedPort, 0));
    queuedPort.emitDone();
    await queuedPromise;
    expect(runtime.activePortCount()).toBe(0);

    const laterSegments = Array.from(
      { length: 3 },
      (_, index) => semanticSegment(`later-${index}`, ['x'.repeat(6000)]),
    );
    const laterPromise = runBatchPool(laterSegments, {
      ...options(),
      requestGate,
    });

    expect(runtime.ports).toHaveLength(7);
    expect(runtime.activePortCount()).toBe(3);
    for (const port of runtime.ports.slice(4)) {
      port.emitChunk(translatedChunk(port, 0));
      port.emitDone();
    }
    await laterPromise;
  });

  it('releases the shared permit when isActive throws after acquisition', async () => {
    const requestGate = createBatchRequestGate();
    const activeCheckError = new Error('active check failed');
    let activeChecks = 0;
    const failingPromise = runBatchPool(
      [semanticSegment('active-check', ['x'.repeat(6000)])],
      {
        ...options(),
        requestGate,
        isActive: () => {
          activeChecks += 1;
          if (activeChecks === 3) throw activeCheckError;
          return true;
        },
      },
    );

    await expect(failingPromise).rejects.toBe(activeCheckError);
    expect(runtime.ports).toHaveLength(0);

    const laterSegments = Array.from(
      { length: 3 },
      (_, index) => semanticSegment(`after-active-error-${index}`, ['x'.repeat(6000)]),
    );
    const laterPromise = runBatchPool(laterSegments, {
      ...options(),
      requestGate,
    });

    expect(runtime.ports).toHaveLength(3);
    expect(runtime.activePortCount()).toBe(3);
    for (const port of runtime.ports) {
      port.emitChunk(translatedChunk(port, 0));
      port.emitDone();
    }
    await laterPromise;
  });

  it('keeps valid siblings and fails only owners with missing chunks', async () => {
    const segments = [semanticSegment('s0', ['Hello']), semanticSegment('s1', ['World'])];
    const poolPromise = runBatchPool(segments, options());
    const port = runtime.ports[0];

    port.emitChunk(translatedChunk(port, 0));
    port.emitDone([port.request.chunks[1].chunkId]);
    const result = await poolPromise;

    expect(result.succeeded).toEqual([segments[0]]);
    expect(result.failed).toEqual([segments[1]]);
    expect(segments[0].status).toBe('done');
    expect(segments[1].status).toBe('failed');
  });

  it('reassembles oversized slices in source order before settling and caching', async () => {
    const segment = semanticSegment('oversized', ['a'.repeat(6001)]);
    const cache = new Map();
    const poolPromise = runBatchPool([segment], options(cache));
    expect(runtime.ports).toHaveLength(2);

    const secondPort = runtime.ports[1];
    secondPort.emitChunk(translatedChunk(secondPort, 0, () => 'B'));
    expect(segment.status).toBe('translating');
    expect(cache.size).toBe(0);

    const firstPort = runtime.ports[0];
    firstPort.emitChunk(translatedChunk(firstPort, 0, () => 'A'));
    expect(segment.status).toBe('done');
    expect(segment.translatedParts).toEqual(['AB']);
    expect(segment.translatedText).toBe('AB');
    expect(cache.size).toBe(1);

    firstPort.emitDone();
    secondPort.emitDone();
    await poolPromise;
  });

  it('uses a complete structured cache entry without opening a port', async () => {
    const cache = new Map();
    const first = semanticSegment('first', ['Hello ', 'world']);
    const firstPromise = runBatchPool([first], options(cache));
    const port = runtime.ports[0];
    const outOfOrderChunk = translatedChunk(port, 0);
    outOfOrderChunk.translatedParts.reverse();
    port.emitChunk(outOfOrderChunk);
    port.emitDone();
    await firstPromise;

    expect(first.translatedParts).toEqual(['[译]Hello ', '[译]world']);

    const second = semanticSegment('second', ['Hello ', 'world']);
    const result = await runBatchPool([second], options(cache));

    expect(runtime.ports).toHaveLength(1);
    expect(result.succeeded).toEqual([second]);
    expect(second.translatedParts).toEqual(['[译]Hello ', '[译]world']);
    expect(second.translatedText).toBe('[译]Hello [译]world');
    expect(second.status).toBe('done');
  });

  it('distinguishes equal joined text with different ordered source-part boundaries', async () => {
    const cache = new Map();
    const first = semanticSegment('first-boundary', ['A', 'BC']);
    const firstPromise = runBatchPool([first], options(cache));
    const firstPort = runtime.ports[0];
    firstPort.emitChunk(translatedChunk(firstPort, 0));
    firstPort.emitDone();
    await firstPromise;

    const differentBoundary = semanticSegment('different-boundary', ['AB', 'C']);
    const differentPromise = runBatchPool([differentBoundary], options(cache));

    expect(runtime.ports).toHaveLength(2);
    const differentPort = runtime.ports[1];
    differentPort.emitChunk(translatedChunk(differentPort, 0));
    differentPort.emitDone();
    await differentPromise;

    const sameBoundary = semanticSegment('same-boundary', ['AB', 'C']);
    const cachedResult = await runBatchPool([sameBoundary], options(cache));

    expect(runtime.ports).toHaveLength(2);
    expect(cachedResult.succeeded).toEqual([sameBoundary]);
    expect(sameBoundary.translatedParts).toEqual(['[译]AB', '[译]C']);
  });

  it('preserves a completed owner when a later batch error fails its sibling', async () => {
    const segments = [semanticSegment('s0', ['Hello']), semanticSegment('s1', ['World'])];
    const poolPromise = runBatchPool(segments, options());
    const port = runtime.ports[0];

    port.emitChunk(translatedChunk(port, 0));
    port.emitError([port.request.chunks[1].chunkId]);
    const result = await poolPromise;

    expect(result.succeeded).toEqual([segments[0]]);
    expect(result.failed).toEqual([segments[1]]);
    expect(segments[0].translatedText).toBe('[译]Hello');
    expect(segments[1].errorType).toBe('rate-limit');
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(runtime.activePortCount()).toBe(0);
  });

  it('ignores duplicate, unknown, and stale request events', async () => {
    const segment = semanticSegment('s0', ['Hello']);
    const poolPromise = runBatchPool([segment], options());
    const port = runtime.ports[0];
    const chunk = translatedChunk(port, 0);

    port.emitChunk(chunk, 'stale-request');
    expect(segment.status).toBe('translating');

    port.emitChunk(chunk);
    port.emitChunk({
      ...chunk,
      translatedParts: chunk.translatedParts.map((part) => ({ ...part, text: 'duplicate' })),
    });
    expect(segment.translatedText).toBe('[译]Hello');

    port.emitDone();
    await poolPromise;
    port.emitChunk({ ...chunk, translatedParts: [] });
    expect(segment.translatedText).toBe('[译]Hello');
  });

  it('fails unresolved owners on disconnect without losing completed owners', async () => {
    const segments = [semanticSegment('s0', ['Hello']), semanticSegment('s1', ['World'])];
    const poolPromise = runBatchPool(segments, options());
    const port = runtime.ports[0];

    port.emitChunk(translatedChunk(port, 0));
    port.emitDisconnect();
    const result = await poolPromise;

    expect(result.succeeded).toEqual([segments[0]]);
    expect(result.failed).toEqual([segments[1]]);
    expect(segments[1].errorType).toBe('network');
  });

  it('does not dispatch another batch after isActive becomes false', async () => {
    let active = true;
    const segments = Array.from(
      { length: 4 },
      (_, index) => semanticSegment(`s${index}`, ['x'.repeat(6000)]),
    );
    const poolPromise = runBatchPool(segments, {
      ...options(),
      isActive: () => active,
    });
    expect(runtime.ports).toHaveLength(3);

    active = false;
    const firstPort = runtime.ports[0];
    firstPort.emitChunk(translatedChunk(firstPort, 0));
    firstPort.emitDone();
    await drainMicrotasks();

    expect(runtime.ports).toHaveLength(3);
    expect(segments[3].status).toBe('pending');

    for (const port of runtime.ports.slice(1)) {
      port.emitChunk(translatedChunk(port, 0));
      port.emitDone();
    }
    await poolPromise;
  });
});

describe('retryBatchSegments', () => {
  it('clears failed semantic output and retries through the batch port', async () => {
    const segment = semanticSegment('retry', ['Hello']);
    segment.status = 'failed';
    segment.errorType = 'network';
    segment.translatedText = 'partial';
    segment.translatedParts = ['partial'];

    const retryPromise = retryBatchSegments([segment], options());

    expect(segment.status).toBe('translating');
    expect(segment.translatedText).toBeUndefined();
    expect(segment.translatedParts).toBeUndefined();
    const port = runtime.ports[0];
    port.emitChunk(translatedChunk(port, 0));
    port.emitDone();

    expect((await retryPromise).succeeded).toEqual([segment]);
  });
});
