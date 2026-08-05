// 适配层统一入口单元测试 — 覆盖默认源路由、no-config、builtin 源、getActiveSources/setActiveSource
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('background batch stream port', () => {
  it('ignores wrong and duplicate messages while preserving requestId through chunk and done', async () => {
    type PortMessageListener = (message: BatchStreamPortMessage) => void;
    interface TestPort {
      name: string;
      onMessage: { addListener: (listener: PortMessageListener) => void };
      postMessage: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }

    let connectListener: ((port: TestPort) => void) | undefined;
    const runtimeMessageListeners: Array<(message: unknown) => unknown> = [];
    vi.stubGlobal('browser', {
      contextMenus: {
        onClicked: { addListener: vi.fn() },
        create: vi.fn(),
      },
      runtime: {
        onInstalled: { addListener: vi.fn() },
        onMessage: {
          addListener: (listener: (message: unknown) => unknown) => {
            runtimeMessageListeners.push(listener);
          },
        },
        onConnect: {
          addListener: (listener: (port: TestPort) => void) => {
            connectListener = listener;
          },
        },
      },
      tabs: { sendMessage: vi.fn() },
    });
    vi.stubGlobal('defineBackground', (setup: () => void) => {
      setup();
      return setup;
    });

    const translator = await import('../index');
    let finishBatch: ((result: BatchTranslateResult) => void) | undefined;
    const batchResult = new Promise<BatchTranslateResult>((resolve) => {
      finishBatch = resolve;
    });
    const translateBatchSpy = vi
      .spyOn(translator, 'translateBatchWithAdapterStream')
      .mockImplementation(async (_request, onChunk) => {
        onChunk({
          chunkId: 'c1',
          translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
        });
        return batchResult;
      });

    await import('@/entrypoints/background');

    expect(connectListener).toBeTypeOf('function');
    const portMessageListeners: PortMessageListener[] = [];
    const port: TestPort = {
      name: 'fullpage-translate-batch-stream',
      onMessage: {
        addListener: (listener) => portMessageListeners.push(listener),
      },
      postMessage: vi.fn(),
      disconnect: vi.fn(),
    };
    connectListener!(port);
    expect(portMessageListeners).toHaveLength(1);

    const request: BatchStreamPortMessage = {
      type: 'request',
      requestId: 'request-7',
      targetLang: batchRequest.targetLang,
      chunks: batchRequest.chunks,
    };
    portMessageListeners[0]({
      type: 'done',
      requestId: 'wrong-type',
      missingChunkIds: [],
    });
    portMessageListeners[0](request);
    portMessageListeners[0](request);

    expect(translateBatchSpy).toHaveBeenCalledTimes(1);
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'chunk',
      requestId: 'request-7',
      chunk: {
        chunkId: 'c1',
        translatedParts: [{ partId: 0, sliceIndex: 0, text: '你好' }],
      },
    });

    finishBatch!({ missingChunkIds: [] });
    await vi.waitFor(() => {
      expect(port.postMessage).toHaveBeenCalledWith({
        type: 'done',
        requestId: 'request-7',
        missingChunkIds: [],
      });
      expect(port.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
