// LLM Provider 错误路径单元测试 — 覆盖 network / rate-limit / unreachable 三类（no-config 在 adapter 层测试）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLLMProvider } from '../llm-provider';
import type { ProviderConfig } from '@/shared/types';

function makeOpenAIConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'test-llm',
    name: 'test-llm',
    type: 'openai-compatible',
    baseUrl: 'http://localhost:9999/v1/chat/completions',
    model: 'test-model',
    ...overrides,
  };
}

const baseReq = { text: 'hello', targetLang: '中文' };

describe('LLM Provider 错误归一化', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetch 抛 TypeError → network 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
    expect(result.error).toContain('Failed to fetch');
  });

  it('429 状态码 → rate-limit 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
    expect(result.error).toContain('429');
  });

  it('500 状态码 → unreachable 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toContain('500');
  });

  it('404 状态码 → unreachable 错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
  });

  it('成功响应 → 返回译文，无 errorType', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好,世界' } }],
      }),
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.error).toBeUndefined();
    expect(result.errorType).toBeUndefined();
  });

  it('Ollama 类型成功响应 → 返回译文', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: '你好,世界' },
      }),
    }));
    const provider = createLLMProvider(makeOpenAIConfig({ type: 'ollama' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
  });

  it('test() 默认发送 hello → 中文 请求', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(makeOpenAIConfig());
    const result = await provider.test();
    expect(result.translatedText).toBe('你好');
    // 验证请求体包含 hello
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.messages[0].content).toContain('hello');
  });
});

// anthropic 响应风格测试 — 覆盖请求构建 + 响应解析 + 错误归类
describe('LLM Provider anthropic 响应风格', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('anthropic 风格成功 → 解析 data.content[0].text，请求头含 x-api-key + anthropic-version', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: '你好,世界' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(
      makeOpenAIConfig({ responseStyle: 'anthropic', apiKey: 'test-key' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.error).toBeUndefined();
    expect(result.errorType).toBeUndefined();

    // 验证请求头：x-api-key（非 Bearer）+ anthropic-version
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['x-api-key']).toBe('test-key');
    expect(callHeaders['anthropic-version']).toBe('2023-06-01');
    expect(callHeaders['Authorization']).toBeUndefined();

    // 验证请求体：max_tokens + 顶层 system + 原文作 user message
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.max_tokens).toBe(1024);
    expect(callBody.system).toContain('into 中文');
    expect(callBody.messages[0].role).toBe('user');
    expect(callBody.messages[0].content).toBe('hello');
    expect(callBody.temperature).toBe(0.3);
  });

  it('anthropic 风格无 apiKey → 不发送 x-api-key 头，端点 401 → unreachable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(
      makeOpenAIConfig({ responseStyle: 'anthropic', apiKey: '' }),
    );
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    // 无 apiKey 时不应携带 x-api-key
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['x-api-key']).toBeUndefined();
  });

  it('anthropic 风格 429 → rate-limit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    }));
    const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'anthropic' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
    expect(result.error).toContain('429');
  });

  it('anthropic 风格 500 → unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'anthropic' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toContain('500');
  });

  it('anthropic 风格 fetch TypeError → network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'anthropic' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
    expect(result.error).toContain('Failed to fetch');
  });

  it('anthropic 风格响应 content 为空数组 → 返回空译文（不抛异常）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    }));
    const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'anthropic' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBeUndefined();
  });
});

// openai 风格回归 — 确保 responseStyle 缺省 / 显式 openai 均走原 OpenAI 路径
describe('LLM Provider responseStyle 回归', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('responseStyle 缺省 → 走 openai 路径（Authorization Bearer + choices 解析）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(makeOpenAIConfig({ apiKey: 'openai-key' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    // openai 路径用 Authorization Bearer，无 x-api-key / anthropic-version
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['Authorization']).toBe('Bearer openai-key');
    expect(callHeaders['x-api-key']).toBeUndefined();
    expect(callHeaders['anthropic-version']).toBeUndefined();
    // openai 路径无 max_tokens / system
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.max_tokens).toBeUndefined();
    expect(callBody.system).toBeUndefined();
  });

  it('responseStyle 显式 openai → 走 openai 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { role: 'assistant', content: '你好' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createLLMProvider(makeOpenAIConfig({ responseStyle: 'openai' }));
    const result = await provider.translate(baseReq);
    expect(result.translatedText).toBe('你好');
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['anthropic-version']).toBeUndefined();
  });
});

// 流式翻译单元测试 — 覆盖 OpenAI SSE / Anthropic SSE / Ollama NDJSON / 错误路径
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

describe('LLM Provider 流式翻译', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('OpenAI SSE 流式 — 多 chunk 累加 + [DONE] 终止 + 跳过非 data 行 + 跨 chunk 行缓冲', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{', // partial line — tests buffering
        '"delta":{"content":"好"}}]}\n\n', // completes the partial line
        ': SSE comment, should be skipped\n\n',
        '\n', // empty line, should be skipped
        'data: {"choices":[{"delta":{"content":",世界"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createLLMProvider(makeOpenAIConfig());
    const chunks: string[] = [];
    const result = await provider.translateStream!(baseReq, (c) => chunks.push(c.deltaText));

    expect(chunks).toEqual(['你', '好', ',世界']);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
    expect(result.error).toBeUndefined();

    // 验证请求体含 stream: true
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.stream).toBe(true);
  });

  it('Anthropic SSE 流式 — content_block_delta 提取 delta.text + message_stop 终止 + 跳过其他事件', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        'event: message_start\n',
        'data: {"type":"message_start","message":{"id":"msg_1"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}\n\n',
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好,世界"}}\n\n',
        'event: message_stop\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createLLMProvider(
      makeOpenAIConfig({ responseStyle: 'anthropic', apiKey: 'test-key' }),
    );
    const chunks: string[] = [];
    const result = await provider.translateStream!(baseReq, (c) => chunks.push(c.deltaText));

    // message_start 不产出 chunk,content_block_delta 产出两个
    expect(chunks).toEqual(['你', '好,世界']);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
    expect(result.error).toBeUndefined();

    // 验证 stream: true + anthropic 请求头
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.stream).toBe(true);
    const callHeaders = fetchMock.mock.calls[0][1].headers;
    expect(callHeaders['x-api-key']).toBe('test-key');
    expect(callHeaders['anthropic-version']).toBe('2023-06-01');
  });

  it('Ollama NDJSON 流式 — 每行 message.content 提取 + done:true 终止 + 多 chunk 累加', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeReadableStream([
        '{"model":"test","message":{"content":"你"},"done":false}\n',
        '{"model":"test","message":{"content":"好"},"done":false}\n',
        '{"model":"test","message":{"content":",世界"},"done":false}\n',
        '{"model":"test","message":{"content":""},"done":true}\n',
      ]),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createLLMProvider(makeOpenAIConfig({ type: 'ollama' }));
    const chunks: string[] = [];
    const result = await provider.translateStream!(baseReq, (c) => chunks.push(c.deltaText));

    // done:true 行 content 为空,不产出 chunk
    expect(chunks).toEqual(['你', '好', ',世界']);
    expect(result.translatedText).toBe('你好,世界');
    expect(result.errorType).toBeUndefined();
    expect(result.error).toBeUndefined();

    // 验证请求体含 stream: true
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.stream).toBe(true);
  });

  it('流式 429 → rate-limit 错误,不调 onChunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const onChunk = vi.fn();
    const result = await provider.translateStream!(baseReq, onChunk);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('rate-limit');
    expect(result.error).toContain('429');
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('流式 500 → unreachable 错误,不调 onChunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const onChunk = vi.fn();
    const result = await provider.translateStream!(baseReq, onChunk);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('unreachable');
    expect(result.error).toContain('500');
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('流式 fetch 抛 TypeError → network 错误,不调 onChunk', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const provider = createLLMProvider(makeOpenAIConfig());
    const onChunk = vi.fn();
    const result = await provider.translateStream!(baseReq, onChunk);
    expect(result.translatedText).toBe('');
    expect(result.errorType).toBe('network');
    expect(result.error).toContain('Failed to fetch');
    expect(onChunk).not.toHaveBeenCalled();
  });

  it('流式读取中断 → 返回部分译文 + network 错误', async () => {
    // 模拟流在第一次读取后中断:第二次 pull 时 error
    let pullCount = 0;
    const errorStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pullCount++;
        const encoder = new TextEncoder();
        if (pullCount === 1) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n\n'),
          );
        } else {
          controller.error(new TypeError('Network error'));
        }
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: errorStream,
    }));
    const provider = createLLMProvider(makeOpenAIConfig());
    const chunks: string[] = [];
    const result = await provider.translateStream!(baseReq, (c) => chunks.push(c.deltaText));
    expect(chunks).toEqual(['部分']);
    expect(result.translatedText).toBe('部分');
    expect(result.errorType).toBe('network');
    expect(result.error).toContain('Network error');
  });
});
