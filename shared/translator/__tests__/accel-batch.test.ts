// 全文批量加速接入测试（#93）。
//
// 关键约束：批量池的 validateTranslatedChunk 要求返回 parts 数量与请求完全一致，
// 因此只有「chunk 全部 part 命中」才能整块短路；部分命中必须整块发 LLM。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateBatchWithAdapterStream } from '../index';
import type {
  BatchTranslatedChunk,
  BatchTranslateChunk,
  Settings,
} from '@/shared/types';

vi.mock('@/shared/storage', () => ({
  getSettings: vi.fn(),
  getProviders: vi.fn(),
  setSettings: vi.fn(),
}));

const { getSettings, getProviders } = await import('@/shared/storage');

const ACCEL = 'https://accel.example.com';

const LLM_PROVIDER = {
  id: 'user-llm',
  name: '自建 LLM',
  type: 'llm' as const,
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4',
  responseStyle: 'openai-completions' as const,
};

function chunk(chunkId: string, texts: string[]): BatchTranslateChunk {
  return {
    chunkId,
    segmentId: `seg-${chunkId}`,
    parts: texts.map((text, i) => ({ partId: 0, sliceIndex: i, text })),
  };
}

function stub(settings: Partial<Settings>): void {
  vi.mocked(getSettings).mockResolvedValue({
    activeProviderId: 'user-llm',
    defaultTargetLang: 'zh-CN',
    accelEndpoint: ACCEL,
    accelScope: 'all',
    ...settings,
  } as Settings);
  vi.mocked(getProviders).mockResolvedValue([LLM_PROVIDER]);
}

/** mock LLM 批量流：按请求内容回一个固定译文 chunk。 */
function stubLlm(onRequest: (req: unknown) => void) {
  return {
    translateBatchStream: vi.fn(async (req: { chunks: BatchTranslateChunk[] }, onChunk: (c: BatchTranslatedChunk) => void) => {
      onRequest(req);
      for (const c of req.chunks) {
        onChunk({
          chunkId: c.chunkId,
          translatedParts: c.parts.map((p) => ({ partId: p.partId, sliceIndex: p.sliceIndex, text: `LLM:${p.text}` })),
        });
      }
      return { missingChunkIds: [] };
    }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('整批命中', () => {
  it('所有 chunk 全命中 → 零 LLM 请求', async () => {
    stub({});
    const llm = stubLlm(() => {});
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    // lookup 回填：按请求里的 id 返回译文
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string; text: string }> };
        return new Response(
          JSON.stringify({ hits: body.items.map((i) => ({ id: i.id, translatedText: `缓存:${i.text}` })) }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
    }) as never;

    const out: BatchTranslatedChunk[] = [];
    const result = await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a', 'b']), chunk('c2', ['c'])] },
      (c) => out.push(c),
    );

    expect(llm.translateBatchStream).not.toHaveBeenCalled();
    expect(result.missingChunkIds).toEqual([]);
    // 命中块以完整 chunk 形态回给池（parts 数量与请求一致）
    expect(out).toHaveLength(2);
    expect(out[0]!.chunkId).toBe('c1');
    expect(out[0]!.translatedParts).toHaveLength(2);
    expect(out[0]!.translatedParts[0]!.text).toBe('缓存:a');
  });
});

describe('部分命中', () => {
  it('部分 chunk 命中 → 只把未命中的 chunk 发 LLM，命中块照常回传', async () => {
    stub({});
    let sentChunks: BatchTranslateChunk[] = [];
    const llm = stubLlm((req) => { sentChunks = (req as { chunks: BatchTranslateChunk[] }).chunks; });
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    // 只让 c1 命中
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string; text: string }> };
        const hits = body.items
          .filter((i) => i.id.startsWith('c1'))
          .map((i) => ({ id: i.id, translatedText: `缓存:${i.text}` }));
        return new Response(JSON.stringify({ hits }), { status: 200 });
      }
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
    }) as never;

    const out: BatchTranslatedChunk[] = [];
    await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a', 'b']), chunk('c2', ['c'])] },
      (c) => out.push(c),
    );

    // 只有 c2 进 LLM（c1 全命中被短路）
    expect(sentChunks.map((c) => c.chunkId)).toEqual(['c2']);
    // 命中块 + LLM 块都回传
    expect(out.map((c) => c.chunkId).sort()).toEqual(['c1', 'c2']);
  });

  it('chunk 内部分 part 命中 → 整块仍发 LLM（池要求 parts 数量一致）', async () => {
    stub({});
    let sentChunks: BatchTranslateChunk[] = [];
    const llm = stubLlm((req) => { sentChunks = (req as { chunks: BatchTranslateChunk[] }).chunks; });
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    // 只命中 c1 的第 0 个 part（sliceIndex 0），第 1 个未命中
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        const body = JSON.parse(String(init?.body)) as { items: Array<{ id: string; text: string }> };
        // id 形如 `${chunkId}\0${partId}\0${sliceIndex}`；只命中 sliceIndex=0 那个 part
        const NUL = String.fromCharCode(0);
        const hits = body.items
          .filter((i) => i.id.endsWith(`${NUL}0${NUL}0`))
          .map((i) => ({ id: i.id, translatedText: `缓存:${i.text}` }));
        return new Response(JSON.stringify({ hits }), { status: 200 });
      }
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
    }) as never;

    await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a', 'b'])] },
      () => {},
    );
    // 部分命中不算整块命中 → 整块发给 LLM
    expect(sentChunks.map((c) => c.chunkId)).toEqual(['c1']);
  });
});

describe('fail-open 与跳过条件', () => {
  it('lookup 失败 → 整批照常发 LLM', async () => {
    stub({});
    let sentChunks: BatchTranslateChunk[] = [];
    const llm = stubLlm((req) => { sentChunks = (req as { chunks: BatchTranslateChunk[] }).chunks; });
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/v1/cache/')) throw new Error('accel down');
      return new Response('{}', { status: 200 });
    }) as never;

    await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a'])] },
      () => {},
    );
    expect(sentChunks.map((c) => c.chunkId)).toEqual(['c1']);
  });

  it('未配置端点 → 不查缓存', async () => {
    stub({ accelEndpoint: null });
    const llm = stubLlm(() => {});
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as never;

    await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a'])] },
      () => {},
    );
    expect(fetchMock.mock.calls.map((c) => String(c[0])).some((u) => u.includes('/v1/cache/'))).toBe(false);
  });
});

describe('提交缓存', () => {
  it('LLM 翻译完成后按 part 提交缓存（一次请求写整块）', async () => {
    stub({});
    const llm = stubLlm(() => {});
    const providerMod = await import('../registry');
    vi.spyOn(providerMod, 'createProvider').mockReturnValue({
      id: 'user-llm',
      type: 'llm',
      translate: vi.fn(),
      test: vi.fn(),
      translateBatchStream: llm.translateBatchStream,
    } as never);

    const commitBodies: Array<{ items: Array<{ text: string; translatedText: string }> }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/v1/cache/lookup')) {
        return new Response(JSON.stringify({ hits: [] }), { status: 200 });
      }
      if (String(url).includes('/v1/cache/commit')) {
        commitBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }) as never;

    await translateBatchWithAdapterStream(
      { targetLang: 'zh-CN', chunks: [chunk('c1', ['a', 'b'])] },
      () => {},
    );
    await new Promise((r) => setTimeout(r, 0));

    expect(commitBodies).toHaveLength(1);
    // 每个 part 一条，原文与译文配对正确
    expect(commitBodies[0]!.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'a', translatedText: 'LLM:a' }),
        expect.objectContaining({ text: 'b', translatedText: 'LLM:b' }),
      ]),
    );
  });
});
