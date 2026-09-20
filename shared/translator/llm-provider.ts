// LLM Provider — 工厂层；负责 protocol 分发、timeout、错误归一化、reasoning 过滤。
// 协议差异（headers / body / SSE 解析）收敛在 llm-adapters.ts 的 LlmProtocolAdapter 中。
//
// content-script 不应直接 fetch 第三方接口，统一由 background 调用本模块。
import type {
  BatchTranslateRequest,
  BatchTranslateResult,
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
import { normalizeLlmProtocol } from './llm-protocol';
import { sanitizeReasoningArtifacts, createReasoningStreamFilter } from './reasoning-filter';
import {
  buildLlmUrl,
  getLlmProtocolAdapter,
  type AnthropicStreamOptions,
} from './llm-adapters';

const LLM_REQUEST_TIMEOUT_MS = 60_000;
const LLM_REQUEST_TIMEOUT_MESSAGE = '翻译请求超时（60 秒）';

async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    abortFromCaller();
  } else {
    externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, LLM_REQUEST_TIMEOUT_MS);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (timedOut) throw new Error(LLM_REQUEST_TIMEOUT_MESSAGE);
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
}

function buildPrompt(text: string, targetLang: string, sourceLang?: string): string {
  const source = sourceLang ? `from ${sourceLang} ` : '';
  return `Translate the following text ${source}into ${targetLang}. Output ONLY the translation, without explanation or quotes. If the source text is markdown, preserve its structure and markup (headings, lists, code blocks).\n\n${text}`;
}

type DeltaHandler = (delta: string) => void;

interface ProviderDeltaFilter {
  push(delta: string): void;
  finish(): string;
  rethrowCallbackFailure(): void;
}

function createProviderDeltaFilter(onDelta: DeltaHandler): ProviderDeltaFilter {
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
 * 非流式调用模板：fetch → 错误归一化 → adapter 解析。
 */
async function callScalar(
  config: ProviderConfig,
  req: TranslateRequest,
  signal: AbortSignal,
): Promise<TranslateResult> {
  const protocol = normalizeLlmProtocol(config.responseStyle);
  const adapter = getLlmProtocolAdapter(protocol);
  const url = buildLlmUrl(config.baseUrl, protocol);
  const prompt = buildPrompt(req.text, req.targetLang, req.sourceLang);
  const resp = await fetch(url, {
    method: 'POST',
    headers: adapter.buildHeaders(config),
    signal,
    body: JSON.stringify(adapter.buildScalarBody(config, prompt, req.text)),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return {
      translatedText: '',
      error: `HTTP ${resp.status}: ${await resp.text()}`,
      errorType,
    };
  }
  const data: unknown = await resp.json();
  const text = sanitizeReasoningArtifacts(adapter.parseScalarResponse(data));
  return { translatedText: text };
}

/**
 * 流式调用模板：fetch → 创建 delta 过滤 → adapter.readStream 推送增量 → 收尾。
 * 失败信息由 adapter 在 readStream 返回值里提供，不抛。
 */
async function callStream(
  config: ProviderConfig,
  req: TranslateRequest,
  onChunk: (chunk: TranslateChunk) => void,
  signal: AbortSignal,
  streamOpts?: AnthropicStreamOptions,
): Promise<TranslateResult> {
  const protocol = normalizeLlmProtocol(config.responseStyle);
  const adapter = getLlmProtocolAdapter(protocol);
  const url = buildLlmUrl(config.baseUrl, protocol);
  const prompt = buildPrompt(req.text, req.targetLang, req.sourceLang);
  const resp = await fetch(url, {
    method: 'POST',
    headers: adapter.buildHeaders(config),
    signal,
    body: JSON.stringify(adapter.buildStreamBody(config, prompt, streamOpts)),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return {
      translatedText: '',
      error: `HTTP ${resp.status}: ${await resp.text()}`,
      errorType,
    };
  }
  const reader = resp.body!.getReader();
  const filter = createProviderDeltaFilter((delta) => onChunk({ deltaText: delta }));
  try {
    const result = await adapter.readStream(reader, filter.push, config);
    if (result.failure) {
      return {
        translatedText: filter.finish(),
        error: result.failure,
        errorType: result.errorType ?? 'unreachable',
      };
    }
  } catch (err) {
    filter.rethrowCallbackFailure();
    if (signal.aborted) throw err;
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
 * 在工厂里按归一化的 protocol 选择一个 LlmProtocolAdapter；三种调用模式（translate /
 * translateStream / translateBatchStream）都走同一 adapter，不再各自 if/else 分发。
 */
export function createLLMProvider(config: ProviderConfig): TranslationProvider {
  return {
    id: config.id,
    type: 'llm' as const,
    async translate(req: TranslateRequest, externalSignal?: AbortSignal): Promise<TranslateResult> {
      try {
        return await withRequestDeadline(
          (signal) => callScalar(config, req, signal),
          externalSignal,
        );
      } catch (err) {
        return {
          translatedText: '',
          error: err instanceof Error ? err.message : String(err),
          errorType: classifyError(err),
        };
      }
    },
    async test(req?: TranslateRequest): Promise<TranslateResult> {
      return this.translate(req ?? { text: 'hello', targetLang: '中文' });
    },
    async translateStream(
      req: TranslateRequest,
      onChunk: (chunk: TranslateChunk) => void,
      externalSignal?: AbortSignal,
    ): Promise<TranslateResult> {
      try {
        return await withRequestDeadline(
          (signal) => callStream(config, req, onChunk, signal),
          externalSignal,
        );
      } catch (err) {
        return {
          translatedText: '',
          error: err instanceof Error ? err.message : String(err),
          errorType: classifyError(err),
        };
      }
    },
    async translateBatchStream(
      req: BatchTranslateRequest,
      onChunk: (chunk: import('@/shared/types').BatchTranslatedChunk) => void,
    ): Promise<BatchTranslateResult> {
      const parser = createBatchObjectStream(req.chunks, onChunk);
      const protocol = normalizeLlmProtocol(config.responseStyle);
      const adapter = getLlmProtocolAdapter(protocol);
      try {
        const streamResult = await withRequestDeadline(async (signal) => {
          const url = buildLlmUrl(config.baseUrl, protocol);
          const headers = adapter.buildHeaders(config);
          // Anthropic 流式 batch 走 system=buildBatchInstructions、userContent=JSON.stringify(chunks)、
          // max_tokens=8192 的覆盖路径；其它协议忽略 opts 走默认 prompt。
          const streamOpts: AnthropicStreamOptions = {
            userContent: JSON.stringify(req.chunks),
            maxTokens: 8192,
          };
          const body = JSON.stringify(
            protocol === 'anthropic'
              ? adapter.buildStreamBody(config, buildBatchInstructions(req.targetLang), streamOpts)
              : adapter.buildStreamBody(config, buildBatchPrompt(req.targetLang, req.chunks)),
          );
          const resp = await fetch(url, { method: 'POST', headers, signal, body });
          if (!resp.ok) {
            const errorType = classifyError(null, resp.status);
            return {
              translatedText: '',
              error: `HTTP ${resp.status}: ${await resp.text()}`,
              errorType,
            } as TranslateResult;
          }
          const reader = resp.body!.getReader();
          const filter = createProviderDeltaFilter((delta) => parser.push(delta));
          try {
            const result = await adapter.readStream(reader, filter.push, config);
            if (result.failure) {
              return {
                translatedText: filter.finish(),
                error: result.failure,
                errorType: result.errorType ?? 'unreachable',
              } as TranslateResult;
            }
          } catch (err) {
            filter.rethrowCallbackFailure();
            if (signal.aborted) throw err;
            return {
              translatedText: filter.finish(),
              error: err instanceof Error ? err.message : String(err),
              errorType: classifyError(err),
            } as TranslateResult;
          }
          return { translatedText: filter.finish() } as TranslateResult;
        });

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
