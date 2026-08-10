// 适配层统一入口单元测试 — 覆盖默认源路由、no-config、builtin 源、getActiveSources/setActiveSource
import { afterAll, beforeAll, describe, it, expect, vi, beforeEach } from 'vitest';
import {
  translateWithAdapter,
  translateWithAdapterStream,
  translateBatchWithAdapterStream,
  testWithAdapter,
  getActiveSources,
  getTranslationCapabilities,
  setActiveSource,
} from '../index';
import type {
  BatchStreamPortMessage,
  BatchTranslateRequest,
  BatchTranslateResult,
  ProviderConfig,
} from '@/shared/types';

// Mock browser.storage.local — 模拟 storage 模块
vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
  getProviders: vi.fn(),
  setSettings: vi.fn(),
}));

// 导入 mock 后的 storage
const { getSettings, getProviders, setSettings } = await import('@/shared/storage');

describe('translateWithAdapter — 默认源与路由', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('activeProviderId 为 null → 解析默认 builtin:microsoft 并路由翻译', async () => {
    // fresh install：未做选择，默认选中 microsoft 免费源
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    // mock microsoft 翻译端点（auth + translate 两步）
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/translate/auth')) {
          return Promise.resolve({ ok: true, status: 200, text: async () => 'token' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
        });
      }),
    );

    const result = await translateWithAdapter({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });

  it('activeProviderId 不匹配任何 provider 与内置源 → no-config 错误', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'non-existent', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'other', name: 'other', type: 'llm', baseUrl: 'http://localhost', model: 'm' },
    ]);

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('no-config');
  });

  it('有匹配的用户 provider → 路由到对应 provider 翻译', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'active-id', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'active-id', name: 'test', type: 'llm', baseUrl: 'http://localhost:9999/v1/chat/completions', model: 'm' },
    ]);

    // Mock fetch 返回成功
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    }));

    const result = await translateWithAdapter({ text: 'hello', targetLang: '中文' });
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });

  it('activeProviderId 指向 builtin:google → 路由到 google 免费源', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:google', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [[['你好', 'hello', null, null, 1]], null, 'en'],
      }),
    );

    const result = await translateWithAdapter({ text: 'hello', targetLang: '简体中文' });
    expect(result.translatedText).toBe('你好');
  });

  it('将外部取消信号传递给传统翻译请求', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      activeProviderId: 'builtin:google',
      defaultTargetLang: '',
    });
    vi.mocked(getProviders).mockResolvedValue([]);
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const resultPromise = translateWithAdapterStream(
      { text: 'hello', targetLang: 'zh-CN' },
      vi.fn(),
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    const result = await resultPromise;

    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(result.error).toContain('Aborted');
  });
});

describe('testWithAdapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('对 LLM provider 配置测试 → 调用 provider.test', async () => {
    const config: ProviderConfig = {
      id: 'test-id',
      name: 'test',
      type: 'llm',
      baseUrl: 'http://localhost:9999/v1/chat/completions',
      model: 'test-model',
    };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    }));

    const result = await testWithAdapter(config);
    expect(result.translatedText).toBe('你好');
  });

  it('对 microsoft 免费源配置测试 → 经 auth token 返回译文', async () => {
    const config: ProviderConfig = {
      id: 'builtin:microsoft',
      name: '微软翻译（免费）',
      type: 'microsoft',
      category: 'traditional',
      baseUrl: 'https://api.cognitive.microsofttranslator.com/translate',
      model: '',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/translate/auth')) {
          return Promise.resolve({ ok: true, status: 200, text: async () => 'token' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ translations: [{ text: '你好', to: 'zh-CN' }] }],
        });
      }),
    );

    const result = await testWithAdapter(config);
    expect(result.translatedText).toBe('你好');
    expect(result.errorType).toBeUndefined();
  });
});

describe('getActiveSources', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('合并内置免费源与用户源，activeProviderId 为 null → 解析默认 microsoft', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'user-llm', name: '我的 LLM', type: 'llm', baseUrl: 'http://x', model: 'm' },
    ]);

    const result = await getActiveSources();
    // 内置 2 个 + 用户 1 个
    expect(result.sources).toHaveLength(3);
    expect(result.sources.some((s) => s.id === 'builtin:microsoft')).toBe(true);
    expect(result.sources.some((s) => s.id === 'builtin:google')).toBe(true);
    expect(result.sources.some((s) => s.id === 'user-llm')).toBe(true);
    expect(result.activeSourceId).toBe('builtin:microsoft');
  });

  it('activeProviderId 已设置 → 返回用户选择的生效源', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'user-llm', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'user-llm', name: '我的 LLM', type: 'llm', baseUrl: 'http://x', model: 'm' },
    ]);

    const result = await getActiveSources();
    expect(result.activeSourceId).toBe('user-llm');
  });
});

describe('setActiveSource', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('切换到 builtin:google → 写入 settings.activeProviderId', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:microsoft', defaultTargetLang: '中文' });

    await setActiveSource('builtin:google');
    expect(setSettings).toHaveBeenCalledWith({
      activeProviderId: 'builtin:google',
      defaultTargetLang: '中文',
    });
  });

  it('切换到用户源 → 写入 settings.activeProviderId', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: null, defaultTargetLang: '' });

    await setActiveSource('user-llm');
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ activeProviderId: 'user-llm' }),
    );
  });
});

// 流式适配层测试辅助 — 构造 ReadableStream 模拟 SSE / NDJSON 流
function makeReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe('translateWithAdapterStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('LLM 源流式 → 调用 translateStream,onChunk 被调用并返回最终结果', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'llm-1', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'llm-1', name: 'test-llm', type: 'llm', baseUrl: 'http://localhost:9999/v1/chat/completions', model: 'm' },
    ]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":",世界"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    }));

    const chunks: string[] = [];
    const result = await translateWithAdapterStream(
      { text: 'hello', targetLang: '中文' },
      (c) => chunks.push(c.deltaText),
    );
    expect(chunks).toEqual(['你好', ',世界']);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
  });

  it('传统源回退 → 调用 translate(),完整译文作单 chunk 推送', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'builtin:microsoft', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    // mock microsoft 翻译端点（auth + translate 两步）
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/translate/auth')) {
          return Promise.resolve({ ok: true, status: 200, text: async () => 'token' });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => [{ translations: [{ text: '你好,世界', to: 'zh-CN' }] }],
        });
      }),
    );

    const chunks: string[] = [];
    const result = await translateWithAdapterStream(
      { text: 'hello', targetLang: '简体中文' },
      (c) => chunks.push(c.deltaText),
    );
    // 传统源无 translateStream → 回退 translate(),完整译文作单 chunk
    expect(chunks).toEqual(['你好,世界']);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
  });

  it('无可用源 → no-config 错误,不调 onChunk', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'non-existent', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      { id: 'other', name: 'other', type: 'llm', baseUrl: 'http://localhost', model: 'm' },
    ]);

    const onChunk = vi.fn();
    const result = await translateWithAdapterStream(
      { text: 'hello', targetLang: '中文' },
      onChunk,
    );
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('no-config');
    expect(onChunk).not.toHaveBeenCalled();
  });
});

const batchRequest: BatchTranslateRequest = {
  targetLang: '中文',
  chunks: [
    {
      chunkId: 'c1',
      segmentId: 'segment-1',
      parts: [{ partId: 0, sliceIndex: 0, text: 'Hello' }],
    },
  ],
};

describe('batch translation capability and routing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('reports batchStream only for the active LLM source', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'llm-1', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      {
        id: 'llm-1',
        name: 'test-llm',
        type: 'llm',
        baseUrl: 'http://localhost:9999/v1',
        model: 'm',
      },
    ]);

    expect(await getTranslationCapabilities()).toEqual({ batchStream: true });

    vi.mocked(getSettings).mockResolvedValue({
      activeProviderId: 'builtin:microsoft',
      defaultTargetLang: '',
    });
    vi.mocked(getProviders).mockResolvedValue([]);

    expect(await getTranslationCapabilities()).toEqual({ batchStream: false });
  });

  it('reports no batch stream capability when the active source is missing', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'missing', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);

    expect(await getTranslationCapabilities()).toEqual({ batchStream: false });
  });

  it('routes a batch stream to the active LLM provider', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'llm-1', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([
      {
        id: 'llm-1',
        name: 'test-llm',
        type: 'llm',
        baseUrl: 'http://localhost:9999/v1',
        model: 'm',
      },
    ]);
    const payload = JSON.stringify({
      chunkId: 'c1',
      translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        `data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    }));
    const seen: string[] = [];

    const result = await translateBatchWithAdapterStream(batchRequest, (chunk) => {
      seen.push(chunk.chunkId);
    });

    expect(seen).toEqual(['c1']);
    expect(result).toEqual({ missingChunkIds: [] });
  });

  it('returns a typed error for a traditional source without scalar fallback', async () => {
    vi.mocked(getSettings).mockResolvedValue({
      activeProviderId: 'builtin:microsoft',
      defaultTargetLang: '',
    });
    vi.mocked(getProviders).mockResolvedValue([]);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await translateBatchWithAdapterStream(batchRequest, vi.fn());

    expect(result.missingChunkIds).toEqual(['c1']);
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no-config for a batch call when the active source is missing', async () => {
    vi.mocked(getSettings).mockResolvedValue({ activeProviderId: 'missing', defaultTargetLang: '' });
    vi.mocked(getProviders).mockResolvedValue([]);
    const onChunk = vi.fn();

    const result = await translateBatchWithAdapterStream(batchRequest, onChunk);

    expect(result.missingChunkIds).toEqual(['c1']);
    expect(result.errorType).toBe('no-config');
    expect(onChunk).not.toHaveBeenCalled();
  });
});

type PortMessageListener = (message: unknown) => void;

interface TestPort {
  name: string;
  onMessage: { addListener: (listener: PortMessageListener) => void };
  onDisconnect: { addListener: (listener: () => void) => void };
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface TestPortHarness {
  port: TestPort;
  send(message: unknown): void;
  emitDisconnect(): void;
}

let batchConnectListener: ((port: TestPort) => void) | undefined;
let translatorModule: typeof import('../index');

function createPort(name: string, postMessage = vi.fn()): TestPortHarness {
  const messageListeners: PortMessageListener[] = [];
  const disconnectListeners: Array<() => void> = [];
  const port: TestPort = {
    name,
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
    postMessage,
    disconnect: vi.fn(),
  };
  batchConnectListener!(port);

  return {
    port,
    send(message) {
      expect(messageListeners).toHaveLength(1);
      messageListeners[0](message);
    },
    emitDisconnect() {
      for (const listener of disconnectListeners) listener();
    },
  };
}

function createBatchPort(postMessage = vi.fn()): TestPortHarness {
  return createPort('fullpage-translate-batch-stream', postMessage);
}

describe('background batch stream port', () => {
  beforeAll(async () => {
    vi.stubGlobal('browser', {
      contextMenus: {
        onClicked: { addListener: vi.fn() },
        create: vi.fn(),
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        onConnect: {
          addListener: (listener: (port: TestPort) => void) => {
            batchConnectListener = listener;
          },
        },
      },
      tabs: { sendMessage: vi.fn() },
    });
    vi.stubGlobal('defineBackground', (setup: () => void) => {
      setup();
      return setup;
    });

    translatorModule = await import('../index');
    await import('@/entrypoints/background');
    expect(batchConnectListener).toBeTypeOf('function');
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('ignores wrong and duplicate messages while preserving requestId through chunk and done', async () => {
    let finishBatch: ((result: BatchTranslateResult) => void) | undefined;
    const batchResult = new Promise<BatchTranslateResult>((resolve) => {
      finishBatch = resolve;
    });
    const translateBatchSpy = vi
      .spyOn(translatorModule, 'translateBatchWithAdapterStream')
      .mockImplementation(async (_request, onChunk) => {
        onChunk({
          chunkId: 'c1',
          translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
        });
        return batchResult;
      });
    const harness = createBatchPort();

    const request: BatchStreamPortMessage = {
      type: 'request',
      requestId: 'request-7',
      targetLang: batchRequest.targetLang,
      chunks: batchRequest.chunks,
    };
    harness.send({
      type: 'done',
      requestId: 'wrong-type',
      missingChunkIds: [],
    });
    harness.send(request);
    harness.send(request);

    expect(translateBatchSpy).toHaveBeenCalledTimes(1);
    expect(harness.port.postMessage).toHaveBeenCalledWith({
      type: 'chunk',
      requestId: 'request-7',
      chunk: {
        chunkId: 'c1',
        translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
      },
    });

    finishBatch!({ missingChunkIds: [] });
    await vi.waitFor(() => {
      expect(harness.port.postMessage).toHaveBeenCalledWith({
        type: 'done',
        requestId: 'request-7',
        missingChunkIds: [],
      });
      expect(harness.port.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('ignores malformed request shapes without locking out the first valid request', async () => {
    const translateBatchSpy = vi
      .spyOn(translatorModule, 'translateBatchWithAdapterStream')
      .mockResolvedValue({ missingChunkIds: [] });
    const harness = createBatchPort();
    const sparseChunks = new Array<unknown>(1);
    const sparseParts = new Array<unknown>(1);
    const malformedMessages: unknown[] = [
      { type: 'request' },
      { type: 'request', requestId: 7, targetLang: '中文', chunks: [] },
      { type: 'request', requestId: 'r', targetLang: null, chunks: [] },
      { type: 'request', requestId: 'r', targetLang: '中文', chunks: {} },
      { type: 'request', requestId: 'empty-chunks', targetLang: '中文', chunks: [] },
      {
        type: 'request',
        requestId: 'r',
        targetLang: '中文',
        chunks: [{ chunkId: 'c1', parts: [] }],
      },
      {
        type: 'request',
        requestId: 'r',
        targetLang: '中文',
        chunks: [{
          chunkId: 'c1',
          segmentId: 'segment-1',
          parts: [{ partId: '0', sliceIndex: 0, text: 'Hello' }],
        }],
      },
      {
        type: 'request',
        requestId: 'empty-parts',
        targetLang: '中文',
        chunks: [{ chunkId: 'c1', segmentId: 'segment-1', parts: [] }],
      },
      {
        type: 'request',
        requestId: 'sparse-chunks',
        targetLang: '中文',
        chunks: sparseChunks,
      },
      {
        type: 'request',
        requestId: 'sparse-parts',
        targetLang: '中文',
        chunks: [{ chunkId: 'c1', segmentId: 'segment-1', parts: sparseParts }],
      },
      {
        type: 'request',
        requestId: 'nan-part-id',
        targetLang: '中文',
        chunks: [{
          chunkId: 'c1',
          segmentId: 'segment-1',
          parts: [{ partId: Number.NaN, sliceIndex: 0, text: 'Hello' }],
        }],
      },
      {
        type: 'request',
        requestId: 'fractional-slice-index',
        targetLang: '中文',
        chunks: [{
          chunkId: 'c1',
          segmentId: 'segment-1',
          parts: [{ partId: 0, sliceIndex: 0.5, text: 'Hello' }],
        }],
      },
      {
        type: 'request',
        requestId: 'fractional-part-id',
        targetLang: '中文',
        chunks: [{
          chunkId: 'c1',
          segmentId: 'segment-1',
          parts: [{ partId: 0.5, sliceIndex: 0, text: 'Hello' }],
        }],
      },
      {
        type: 'request',
        requestId: 'nan-slice-index',
        targetLang: '中文',
        chunks: [{
          chunkId: 'c1',
          segmentId: 'segment-1',
          parts: [{ partId: 0, sliceIndex: Number.NaN, text: 'Hello' }],
        }],
      },
    ];

    for (const message of malformedMessages) harness.send(message);
    expect(translateBatchSpy).not.toHaveBeenCalled();

    harness.send({
      type: 'request',
      requestId: 'valid-request',
      targetLang: batchRequest.targetLang,
      chunks: batchRequest.chunks,
    });

    expect(translateBatchSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(harness.port.postMessage).toHaveBeenCalledWith({
        type: 'done',
        requestId: 'valid-request',
        missingChunkIds: [],
      });
      expect(harness.port.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  it('stops forwarding and does not finalize after the peer disconnects early', async () => {
    const attemptedChunks: string[] = [];
    vi.spyOn(translatorModule, 'translateBatchWithAdapterStream')
      .mockImplementation(async (_request, onChunk) => {
        await Promise.resolve();
        attemptedChunks.push('c1');
        onChunk({
          chunkId: 'c1',
          translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
        });
        attemptedChunks.push('c2');
        onChunk({
          chunkId: 'c2',
          translatedParts: [{ partId: 1, sliceIndex: 0, text: '世界' }],
        });
        return { missingChunkIds: [] };
      });
    const harness = createBatchPort();

    harness.send({
      type: 'request',
      requestId: 'early-disconnect',
      targetLang: batchRequest.targetLang,
      chunks: batchRequest.chunks,
    });
    harness.emitDisconnect();

    await vi.waitFor(() => expect(attemptedChunks).toEqual(['c1']));
    expect(harness.port.postMessage).not.toHaveBeenCalled();
    expect(harness.port.disconnect).not.toHaveBeenCalled();
  });

  it('断开 scalar 流式 port 时取消底层翻译请求', async () => {
    let requestSignal: AbortSignal | undefined;
    const translateSpy = vi
      .spyOn(translatorModule, 'translateWithAdapterStream')
      .mockImplementation(async (_request, _onChunk, signal) => {
        requestSignal = signal;
        return new Promise<never>(() => {});
      });
    const harness = createPort('translate-stream');

    harness.send({ type: 'request', text: 'hello', targetLang: 'zh-CN' });
    expect(translateSpy).toHaveBeenCalledTimes(1);
    expect(requestSignal?.aborted).toBe(false);

    harness.emitDisconnect();

    expect(requestSignal?.aborted).toBe(true);
    expect(harness.port.postMessage).not.toHaveBeenCalled();
  });

  it('stops after postMessage throws and disconnects at most once without a second post', async () => {
    const attemptedChunks: string[] = [];
    vi.spyOn(translatorModule, 'translateBatchWithAdapterStream')
      .mockImplementation(async (_request, onChunk) => {
        attemptedChunks.push('c1');
        onChunk({
          chunkId: 'c1',
          translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
        });
        attemptedChunks.push('c2');
        return { missingChunkIds: [] };
      });
    const postMessage = vi.fn(() => {
      throw new Error('Port is disconnected');
    });
    const harness = createBatchPort(postMessage);

    harness.send({
      type: 'request',
      requestId: 'post-failure',
      targetLang: batchRequest.targetLang,
      chunks: batchRequest.chunks,
    });

    await vi.waitFor(() => expect(harness.port.disconnect).toHaveBeenCalledTimes(1));
    expect(attemptedChunks).toEqual(['c1']);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
