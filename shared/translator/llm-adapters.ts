// LlmProtocolAdapter — 把四种 LLM 协议（openai-completions / openai-responses /
// anthropic / ollama）的差异收敛成一个统一接口。
//
// 过去 llm-provider.ts 里每种协议各写两份调用（scalar + stream）= 8 个函数；createLLMProvider
// 又把协议分发重复 3 次（translate / translateStream / translateBatchStream）。任何横切
// 改动（超时、错误分类、reasoning 过滤）都得在 8+3 处同步修改。
//
// 现在每种协议实现一个 LlmProtocolAdapter 对象（buildHeaders / buildScalarBody /
// parseScalarResponse / buildStreamBody / readStream）。createLLMProvider 在工厂里
// 选一次 adapter，三种调用模式都走同一管道。新增第五种协议 = 新增一个 adapter 文件。

import type { ProviderConfig, ErrorType } from '@/shared/types';
import { resolveLlmEndpoint } from './llm-protocol';
import type { LlmProtocol } from '@/shared/types';

export const ANTHROPIC_SCALAR_MAX_TOKENS = 1024;
export const ANTHROPIC_BATCH_MAX_TOKENS = 8192;

/** Anthropic 流式 body 的覆盖选项（其它协议忽略 opts）。 */
export interface AnthropicStreamOptions {
  /** 单独的 user message 内容（不传则与系统提示相同）。 */
  userContent: string;
  /** max_tokens 上限（流式 batch 需 8192）。 */
  maxTokens: number;
}

export interface LlmProtocolAdapter {
  /** 鉴权 + content-type 头。 */
  buildHeaders(provider: ProviderConfig): Record<string, string>;
  /**
   * 非流式请求的 body（已 JSON.stringify 前的对象）。
   * Anthropic 把 `prompt` 作 system 提示、`userText` 作 user message；其它协议忽略
   * `userText`，把 `prompt` 作为唯一输入。
   */
  buildScalarBody(provider: ProviderConfig, prompt: string, userText: string): unknown;
  /** 从非流式 JSON 响应中提取译文。 */
  parseScalarResponse(data: unknown): string;
  /** 流式请求的 body；opts 仅 Anthropic 使用。 */
  buildStreamBody(
    provider: ProviderConfig,
    prompt: string,
    opts?: AnthropicStreamOptions,
  ): unknown;
  /**
   * 读取 SSE 流并经 onDelta 推送增量。
   * 返回 `{ failure, errorType }` 表示流中信号失败（不抛）；signal 中止或读错误由调用方处理。
   */
  readStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onDelta: (delta: string) => void,
    provider: ProviderConfig,
  ): Promise<{ failure?: string; errorType?: ErrorType }>;
}

// ─── 共享助手 ───

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function redactApiKey(message: string, apiKey?: string): string {
  return apiKey ? message.split(apiKey).join('[REDACTED]') : message;
}

/** 从 ReadableStream 逐行 yield（处理跨 chunk 行拼接）。 */
export async function* readLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer) yield buffer;
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      yield line;
    }
  }
}

/** 解析 SSE data: 行；空行 / 非 data: 行返回 null。 */
function parseDataLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) return null;
  return trimmed.slice(5).trim();
}

/** 尝试 JSON.parse，失败返回 null。 */
function tryParseJson<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── OpenAI Chat Completions ───

const openaiCompletionsAdapter: LlmProtocolAdapter = {
  buildHeaders: (provider) => ({
    'Content-Type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  }),
  buildScalarBody: (provider, prompt) => ({
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    reasoning_effort: 'none',
    temperature: 0.3,
  }),
  parseScalarResponse: (data) => {
    if (!isRecord(data)) return '';
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) return '';
    const first = choices[0];
    if (!isRecord(first)) return '';
    const message = first.message;
    if (!isRecord(message)) return '';
    const content = message.content;
    return typeof content === 'string' ? content.trim() : '';
  },
  buildStreamBody: (provider, prompt) => ({
    model: provider.model,
    messages: [{ role: 'user', content: prompt }],
    reasoning_effort: 'none',
    temperature: 0.3,
    stream: true,
  }),
  readStream: async (reader, onDelta) => {
    for await (const line of readLines(reader)) {
      const data = parseDataLine(line);
      if (!data) continue;
      if (data === '[DONE]') break;
      const parsed = tryParseJson(data);
      if (!isRecord(parsed)) continue;
      const choices = parsed.choices;
      if (!Array.isArray(choices) || choices.length === 0) continue;
      const first = choices[0];
      if (!isRecord(first) || !isRecord(first.delta)) continue;
      const content = first.delta.content;
      if (typeof content === 'string' && content) onDelta(content);
    }
    return {};
  },
};

// ─── OpenAI Responses ───

function extractResponsesText(value: unknown): string {
  if (!isRecord(value)) return '';
  if (typeof value.output_text === 'string') return value.output_text.trim();
  if (!Array.isArray(value.output)) return '';
  let translatedText = '';
  for (const outputItem of value.output) {
    if (!isRecord(outputItem) || !Array.isArray(outputItem.content)) continue;
    for (const contentItem of outputItem.content) {
      if (
        isRecord(contentItem)
        && contentItem.type === 'output_text'
        && typeof contentItem.text === 'string'
      ) {
        translatedText += contentItem.text;
      }
    }
  }
  return translatedText.trim();
}

function extractResponsesStreamFailure(value: unknown, apiKey?: string): string | null {
  if (!isRecord(value)) return null;
  if (value.type === 'error') {
    const message = typeof value.message === 'string' ? value.message : 'OpenAI Responses stream error';
    return redactApiKey(message, apiKey);
  }
  if (value.type === 'response.failed') {
    const response = isRecord(value.response) ? value.response : null;
    const error = response && isRecord(response.error) ? response.error : null;
    const message = error && typeof error.message === 'string'
      ? error.message
      : 'OpenAI Responses stream failed';
    return redactApiKey(message, apiKey);
  }
  if (value.type === 'response.incomplete') {
    const response = isRecord(value.response) ? value.response : null;
    const details = response && isRecord(response.incomplete_details) ? response.incomplete_details : null;
    const reason = details && typeof details.reason === 'string' ? details.reason : 'unknown reason';
    return redactApiKey(`OpenAI Responses stream incomplete: ${reason}`, apiKey);
  }
  return null;
}

const openaiResponsesAdapter: LlmProtocolAdapter = {
  buildHeaders: (provider) => ({
    'Content-Type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  }),
  buildScalarBody: (provider, prompt) => ({
    model: provider.model,
    input: prompt,
    reasoning: { effort: 'none' },
  }),
  parseScalarResponse: (data) => extractResponsesText(data),
  buildStreamBody: (provider, prompt) => ({
    model: provider.model,
    input: prompt,
    reasoning: { effort: 'none' },
    stream: true,
  }),
  readStream: async (reader, onDelta, provider) => {
    for await (const line of readLines(reader)) {
      const data = parseDataLine(line);
      if (!data) continue;
      if (data === '[DONE]') break;
      const parsed = tryParseJson(data);
      if (!isRecord(parsed)) continue;
      const failure = extractResponsesStreamFailure(parsed, provider.apiKey);
      if (failure) return { failure, errorType: 'unreachable' as ErrorType };
      if (parsed.type === 'response.completed') break;
      if (parsed.type === 'response.output_text.delta' && typeof parsed.delta === 'string') {
        onDelta(parsed.delta);
      }
    }
    return {};
  },
};

// ─── Anthropic ───

const anthropicAdapter: LlmProtocolAdapter = {
  buildHeaders: (provider) => ({
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
  }),
  buildScalarBody: (provider, prompt, userText) => {
    // Anthropic 用 system=完整提示、user=原文；其它协议忽略 userText。
    return {
      model: provider.model,
      max_tokens: ANTHROPIC_SCALAR_MAX_TOKENS,
      system: prompt,
      messages: [{ role: 'user', content: userText }],
      thinking: { type: 'disabled' },
      temperature: 0.3,
    };
  },
  parseScalarResponse: (data) => {
    if (!isRecord(data)) return '';
    const content = data.content;
    if (!Array.isArray(content) || content.length === 0) return '';
    const first = content[0];
    if (!isRecord(first)) return '';
    const text = first.text;
    return typeof text === 'string' ? text.trim() : '';
  },
  buildStreamBody: (provider, prompt, opts) => ({
    model: provider.model,
    max_tokens: opts?.maxTokens ?? ANTHROPIC_SCALAR_MAX_TOKENS,
    system: prompt,
    messages: [{ role: 'user', content: opts?.userContent ?? prompt }],
    thinking: { type: 'disabled' },
    temperature: 0.3,
    stream: true,
  }),
  readStream: async (reader, onDelta) => {
    let currentEvent = '';
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed) {
        currentEvent = '';
        continue;
      }
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }
      const data = parseDataLine(trimmed);
      if (data === null) continue;
      if (currentEvent === 'message_stop') break;
      if (currentEvent === 'content_block_delta') {
        const parsed = tryParseJson(data);
        if (!isRecord(parsed)) continue;
        const delta = parsed.delta;
        if (isRecord(delta) && typeof delta.text === 'string') {
          onDelta(delta.text);
        }
      }
    }
    return {};
  },
};

// ─── Ollama ───

const ollamaAdapter: LlmProtocolAdapter = {
  buildHeaders: () => ({
    'Content-Type': 'application/json',
  }),
  buildScalarBody: (provider, prompt) => ({
    model: provider.model,
    stream: false,
    think: false,
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0.3 },
  }),
  parseScalarResponse: (data) => {
    if (!isRecord(data)) return '';
    const message = data.message;
    if (!isRecord(message)) return '';
    const content = message.content;
    return typeof content === 'string' ? content.trim() : '';
  },
  buildStreamBody: (provider, prompt) => ({
    model: provider.model,
    stream: true,
    think: false,
    messages: [{ role: 'user', content: prompt }],
    options: { temperature: 0.3 },
  }),
  readStream: async (reader, onDelta) => {
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = tryParseJson(trimmed);
      if (!isRecord(parsed)) continue;
      const message = parsed.message;
      if (isRecord(message) && typeof message.content === 'string' && message.content) {
        onDelta(message.content);
      }
      if (parsed.done === true) break;
    }
    return {};
  },
};

const ADAPTERS: Record<LlmProtocol, LlmProtocolAdapter> = {
  'openai-completions': openaiCompletionsAdapter,
  'openai-responses': openaiResponsesAdapter,
  anthropic: anthropicAdapter,
  ollama: ollamaAdapter,
};

/** 按归一化后的 LLM 协议取适配器。 */
export function getLlmProtocolAdapter(protocol: LlmProtocol): LlmProtocolAdapter {
  return ADAPTERS[protocol];
}

/** 构造 fetch URL（含协议路径后缀）。 */
export function buildLlmUrl(baseUrl: string, protocol: LlmProtocol): string {
  return resolveLlmEndpoint(baseUrl, protocol);
}
