// LLM Provider — OpenAI 兼容 / Ollama 适配实现（迁移自 shared/llm.ts）
// content-script 不应直接 fetch 第三方接口，统一由 background 调用本模块。
import type {
  BatchTranslateRequest,
  BatchTranslateResult,
  BatchTranslatedChunk,
  ProviderConfig,
  TranslateChunk,
  TranslateRequest,
  TranslateResult,
} from '@/shared/types';
import type { TranslationProvider } from './types';
import {
  buildBatchInstructions,
  buildBatchPrompt,
  createBatchObjectStream,
} from './batch-object-stream';
import { classifyError } from './error';
import { normalizeLlmProtocol, resolveLlmEndpoint } from './llm-protocol';
import { createReasoningStreamFilter, sanitizeReasoningArtifacts } from './reasoning-filter';

const ANTHROPIC_SCALAR_MAX_TOKENS = 1024;
const ANTHROPIC_BATCH_MAX_TOKENS = 8192;

function buildPrompt(text: string, targetLang: string, sourceLang?: string): string {
  const source = sourceLang ? `from ${sourceLang} ` : '';
  return `Translate the following text ${source}into ${targetLang}. Output ONLY the translation, without explanation or quotes. If the source text is markdown, preserve its structure and markup (headings, lists, code blocks).\n\n${text}`;
}

/**
 * 调用 OpenAI Chat Completions 兼容接口。
 */
async function callOpenAICompletions(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'openai-completions');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: buildPrompt(req.text, req.targetLang, req.sourceLang) }],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return { translatedText: sanitizeReasoningArtifacts(translatedText) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

function redactApiKey(message: string, apiKey?: string): string {
  return apiKey ? message.split(apiKey).join('[REDACTED]') : message;
}

function extractResponsesStreamFailure(value: unknown, apiKey?: string): string | null {
  if (!isRecord(value)) return null;

  if (value.type === 'error') {
    const message = typeof value.message === 'string'
      ? value.message
      : 'OpenAI Responses stream error';
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
    const details = response && isRecord(response.incomplete_details)
      ? response.incomplete_details
      : null;
    const reason = details && typeof details.reason === 'string'
      ? details.reason
      : 'unknown reason';
    return redactApiKey(`OpenAI Responses stream incomplete: ${reason}`, apiKey);
  }

  return null;
}

async function callOpenAIResponses(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'openai-responses');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      input: buildPrompt(req.text, req.targetLang, req.sourceLang),
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data: unknown = await resp.json();
  return { translatedText: sanitizeReasoningArtifacts(extractResponsesText(data)) };
}

/**
 * 调用原生 Anthropic Messages API 端点
 * 鉴权用 x-api-key（非 Bearer）+ anthropic-version 头；翻译指令作顶层 system，原文作 user message。
 */
async function callAnthropic(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'anthropic');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: ANTHROPIC_SCALAR_MAX_TOKENS,
      system: buildPrompt(req.text, req.targetLang, req.sourceLang),
      messages: [{ role: 'user', content: req.text }],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.content?.[0]?.text?.trim() ?? '';
  return { translatedText: sanitizeReasoningArtifacts(translatedText) };
}

/**
 * 调用 Ollama 本地接口
 */
async function callOllama(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'ollama');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      think: false,
      messages: [{ role: 'user', content: buildPrompt(req.text, req.targetLang, req.sourceLang) }],
      options: { temperature: 0.3 },
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.message?.content?.trim() ?? '';
  return { translatedText: sanitizeReasoningArtifacts(translatedText) };
}

// ─── 流式实现 ───

type DeltaHandler = (delta: string) => void;

function createProviderDeltaFilter(onDelta: DeltaHandler): {
  push(delta: string): void;
  finish(): string;
  rethrowCallbackFailure(): void;
} {
  let callbackFailed = false;
  let callbackError: unknown;
  const filter = createReasoningStreamFilter((delta) => {
    try {
      onDelta(delta);
    } catch (err) {
      callbackFailed = true;
      callbackError = err;
      throw err;
    }
  });

  return {
    push: filter.push,
    finish: filter.finish,
    rethrowCallbackFailure() {
      if (callbackFailed) throw callbackError;
    },
  };
}

/**
 * 从 ReadableStream 读取全部内容并按行分割（支持跨 chunk 行拼接）。
 * 返回逐行 yield 的异步生成器。
 */
async function* readLines(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      // 刷出缓冲区中剩余的不完整行
      if (buffer) yield buffer;
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // 最后一段可能不完整，保留在 buffer
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      yield line;
    }
  }
}

/**
 * 调用 OpenAI 兼容接口（流式）
 * body 加 stream: true，SSE 按 data: 行解析 choices[0].delta.content，遇 data: [DONE] 结束。
 * 逐 chunk 经 onChunk 推送，累加 delta 得完整译文。
 */
async function callOpenAICompletionsPromptStream(
  provider: ProviderConfig,
  prompt: string,
  onDelta: DeltaHandler,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'openai-completions');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      stream: true,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const reader = resp.body!.getReader();
  const filter = createProviderDeltaFilter(onDelta);
  try {
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') break;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        // 跳过无法解析的行（可能是 SSE 注释行或不完整 JSON）
        continue;
      }
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (delta) {
        filter.push(delta);
      }
    }
  } catch (err) {
    filter.rethrowCallbackFailure();
    // 流读取中断：返回已收到的部分译文 + network 错误
    const errorType = classifyError(err);
    return {
      translatedText: filter.finish(),
      error: err instanceof Error ? err.message : String(err),
      errorType,
    };
  }
  return { translatedText: filter.finish() };
}

async function callOpenAIResponsesPromptStream(
  provider: ProviderConfig,
  prompt: string,
  onDelta: DeltaHandler,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'openai-responses');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      input: prompt,
      stream: true,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }

  const reader = resp.body!.getReader();
  const filter = createProviderDeltaFilter(onDelta);
  try {
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') break;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        // 兼容网关可能混入注释或无法解析的数据事件。
        continue;
      }
      if (!isRecord(parsed)) continue;
      const failure = extractResponsesStreamFailure(parsed, provider.apiKey);
      if (failure) {
        return {
          translatedText: filter.finish(),
          error: failure,
          errorType: 'unreachable',
        };
      }
      if (parsed.type === 'response.completed') break;
      if (
        parsed.type === 'response.output_text.delta'
        && typeof parsed.delta === 'string'
      ) {
        filter.push(parsed.delta);
      }
    }
  } catch (err) {
    filter.rethrowCallbackFailure();
    const errorType = classifyError(err);
    return {
      translatedText: filter.finish(),
      error: err instanceof Error ? err.message : String(err),
      errorType,
    };
  }
  return { translatedText: filter.finish() };
}

/**
 * 调用原生 Anthropic Messages API 端点（流式）
 * body 加 stream: true，SSE 解析 content_block_delta 事件取 delta.text，message_stop 结束。
 * 逐 chunk 经 onChunk 推送，累加 delta 得完整译文。
 */
async function callAnthropicPromptStream(
  provider: ProviderConfig,
  systemPrompt: string,
  onDelta: DeltaHandler,
  userContent: string = systemPrompt,
  maxTokens: number = ANTHROPIC_SCALAR_MAX_TOKENS,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'anthropic');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.3,
      stream: true,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const reader = resp.body!.getReader();
  const filter = createProviderDeltaFilter(onDelta);
  let currentEvent = '';
  try {
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed) {
        currentEvent = '';
        continue;
      }
      // SSE 事件行：event: xxx
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
        continue;
      }
      // SSE 数据行：data: {...}
      if (trimmed.startsWith('data:')) {
        const data = trimmed.slice(5).trim();
        if (currentEvent === 'message_stop') break;
        if (currentEvent === 'content_block_delta') {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            // 跳过无法解析的行
            continue;
          }
          const delta = parsed?.delta?.text;
          if (delta) {
            filter.push(delta);
          }
        }
      }
    }
  } catch (err) {
    filter.rethrowCallbackFailure();
    const errorType = classifyError(err);
    return {
      translatedText: filter.finish(),
      error: err instanceof Error ? err.message : String(err),
      errorType,
    };
  }
  return { translatedText: filter.finish() };
}

/**
 * 调用 Ollama 本地接口（流式）
 * body 改 stream: true，NDJSON 按行取 message.content，流结束。
 * 逐 chunk 经 onChunk 推送，累加 delta 得完整译文。
 */
async function callOllamaPromptStream(
  provider: ProviderConfig,
  prompt: string,
  onDelta: DeltaHandler,
): Promise<TranslateResult> {
  const url = resolveLlmEndpoint(provider.baseUrl, 'ollama');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      think: false,
      messages: [{ role: 'user', content: prompt }],
      options: { temperature: 0.3 },
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const reader = resp.body!.getReader();
  const filter = createProviderDeltaFilter(onDelta);
  try {
    for await (const line of readLines(reader)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        // 跳过无法解析的行
        continue;
      }
      const delta = parsed?.message?.content;
      if (delta) {
        filter.push(delta);
      }
      // Ollama 流结束信号：done=true 或 response 为空
      if (parsed?.done) break;
    }
  } catch (err) {
    filter.rethrowCallbackFailure();
    const errorType = classifyError(err);
    return {
      translatedText: filter.finish(),
      error: err instanceof Error ? err.message : String(err),
      errorType,
    };
  }
  return { translatedText: filter.finish() };
}

/**
 * 创建 LLM 翻译源 provider 实例
 * 按归一化后的 LLM 协议分发普通与流式请求。
 */
export function createLLMProvider(config: ProviderConfig): TranslationProvider {
  return {
    id: config.id,
    type: 'llm' as const,
    async translate(req: TranslateRequest): Promise<TranslateResult> {
      try {
        const protocol = normalizeLlmProtocol(config.responseStyle);
        if (protocol === 'openai-responses') return await callOpenAIResponses(config, req);
        if (protocol === 'ollama') return await callOllama(config, req);
        if (protocol === 'anthropic') return await callAnthropic(config, req);
        return await callOpenAICompletions(config, req);
      } catch (err) {
        const errorType = classifyError(err);
        return {
          translatedText: '',
          error: err instanceof Error ? err.message : String(err),
          errorType,
        };
      }
    },
    async test(req?: TranslateRequest): Promise<TranslateResult> {
      return this.translate(req ?? { text: 'hello', targetLang: '中文' });
    },
    async translateStream(req: TranslateRequest, onChunk: (chunk: TranslateChunk) => void): Promise<TranslateResult> {
      try {
        const protocol = normalizeLlmProtocol(config.responseStyle);
        const prompt = buildPrompt(req.text, req.targetLang, req.sourceLang);
        const onDelta = (deltaText: string) => onChunk({ deltaText });
        if (protocol === 'openai-responses') {
          return await callOpenAIResponsesPromptStream(config, prompt, onDelta);
        }
        if (protocol === 'ollama') return await callOllamaPromptStream(config, prompt, onDelta);
        if (protocol === 'anthropic') {
          return await callAnthropicPromptStream(config, prompt, onDelta, req.text);
        }
        return await callOpenAICompletionsPromptStream(config, prompt, onDelta);
      } catch (err) {
        const errorType = classifyError(err);
        return {
          translatedText: '',
          error: err instanceof Error ? err.message : String(err),
          errorType,
        };
      }
    },
    async translateBatchStream(
      req: BatchTranslateRequest,
      onChunk: (chunk: BatchTranslatedChunk) => void,
    ): Promise<BatchTranslateResult> {
      const parser = createBatchObjectStream(req.chunks, onChunk);
      try {
        const protocol = normalizeLlmProtocol(config.responseStyle);
        const prompt = buildBatchPrompt(req.targetLang, req.chunks);
        let streamResult: TranslateResult;
        if (protocol === 'openai-responses') {
          streamResult = await callOpenAIResponsesPromptStream(config, prompt, parser.push);
        } else if (protocol === 'ollama') {
          streamResult = await callOllamaPromptStream(config, prompt, parser.push);
        } else if (protocol === 'anthropic') {
          streamResult = await callAnthropicPromptStream(
            config,
            buildBatchInstructions(req.targetLang),
            parser.push,
            JSON.stringify(req.chunks),
            ANTHROPIC_BATCH_MAX_TOKENS,
          );
        } else {
          streamResult = await callOpenAICompletionsPromptStream(config, prompt, parser.push);
        }

        const result: BatchTranslateResult = { missingChunkIds: parser.finish() };
        if (streamResult.error) result.error = streamResult.error;
        if (streamResult.errorType) result.errorType = streamResult.errorType;
        return result;
      } catch (err) {
        return {
          missingChunkIds: parser.finish(),
          error: err instanceof Error ? err.message : String(err),
          errorType: classifyError(err),
        };
      }
    },
  };
}
