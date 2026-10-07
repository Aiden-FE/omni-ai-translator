// 适配层统一入口 — 上层（background）经此模块调用翻译，不感知具体源类型
import type {
  ActiveSourcesResult,
  AccelRequestOptions,
  BatchTranslateChunk,
  BatchTranslateRequest,
  BatchTranslateResult,
  BatchTranslatedChunk,
  BatchTranslatedPart,
  ProviderConfig,
  Settings,
  TranslationCapabilities,
  TranslateChunk,
  TranslateRequest,
  TranslateResult,
} from '@/shared/types';
import { getProviders, getSettings, setSettings } from '@/shared/storage';
import {
  accelCommit,
  accelLookup,
  deriveAccelSettings,
  isAccelEligible,
  newAccelId,
  type AccelLookupQuery,
} from '@/shared/accel';
import { MAX_ITEMS_PER_REQUEST } from '@/services/relay/src/contracts';
import { createProvider } from './registry';
import { errorTypeMessage } from './error';
import {
  BUILTIN_FREE_SOURCES,
  DEFAULT_ACTIVE_SOURCE_ID,
  DEFAULT_FALLBACK_SOURCE_ID,
  getBuiltinSourceById,
} from './builtin-sources';

/**
 * 一次读出「生效源 + 设置」。加速裁决与 provider 创建共用同一次存储读取，
 * 避免两条路径读到不同的快照。
 */
async function resolveTarget(): Promise<{ config: ProviderConfig | null; settings: Settings }> {
  const [settings, providers] = await Promise.all([getSettings(), getProviders()]);
  const activeId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID;
  const config = providers.find((provider) => provider.id === activeId)
    ?? getBuiltinSourceById(activeId)
    ?? null;
  return { config, settings };
}

/** Resolves the active user or builtin provider consistently for every translation entry point. */
async function resolveActiveProviderConfig(): Promise<ProviderConfig | null> {
  return (await resolveTarget()).config;
}

/**
 * 解析本次翻译可用的加速端点（不可用时返回 null）。
 * 裁决规则见 shared/accel/config.ts：端点为空 / 源不符合 scope / 配置了 customPrompt 都跳过。
 */
function resolveAccelEndpoint(
  settings: Settings,
  config: ProviderConfig | null,
): string | null {
  const { endpoint, scope } = deriveAccelSettings(settings);
  const eligible = isAccelEligible({
    endpoint,
    scope,
    activeConfig: config,
    customPrompt: settings.customPrompt,
  });
  return eligible ? endpoint : null;
}

/**
 * 单条查缓存。命中返回译文，未命中 / 跳过 / 任何异常返回 null。
 * `skipLookup` 为真时直接跳过（「重试」语义，见 AccelRequestOptions）。
 */
async function accelLookupText(
  endpoint: string,
  req: TranslateRequest,
  options?: AccelRequestOptions,
): Promise<string | null> {
  if (options?.skipLookup) return null;
  const id = newAccelId();
  const hits = await accelLookup(endpoint, [
    { id, text: req.text, targetLang: req.targetLang, sourceLang: req.sourceLang },
  ]);
  return hits.find((hit) => hit.id === id)?.translatedText ?? null;
}

/** LLM provider 返回的 chunk 中相邻两条命中之间的关系 id：回填用。 */
function chunkAccelId(chunkId: string, partId: number, sliceIndex: number): string {
  return `${chunkId}\u0000${partId}\u0000${sliceIndex}`;
}

/**
 * 批量查缓存，返回「整块全命中」的 chunk → 已翻译 chunk 映射，以及需要发 LLM 的 chunk 列表。
 * lookup 按 ≤200 条一组分批（服务端契约上限）。
 */
async function accelLookupChunks(
  endpoint: string,
  chunks: BatchTranslateChunk[],
  targetLang: string,
): Promise<{
  hitsByChunkId: Map<string, BatchTranslatedChunk>;
  missChunks: BatchTranslateChunk[];
}> {
  // 收集全部 part 的查询条目
  const queries: AccelLookupQuery[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.parts) {
      queries.push({
        id: chunkAccelId(chunk.chunkId, part.partId, part.sliceIndex),
        text: part.text,
        targetLang,
      });
    }
  }
  if (queries.length === 0) return { hitsByChunkId: new Map(), missChunks: chunks };

  const hitMap = new Map<string, string>();
  for (let start = 0; start < queries.length; start += MAX_ITEMS_PER_REQUEST) {
    const slice = queries.slice(start, start + MAX_ITEMS_PER_REQUEST);
    const hits = await accelLookup(endpoint, slice);
    for (const hit of hits) hitMap.set(hit.id, hit.translatedText);
  }

  const hitsByChunkId = new Map<string, BatchTranslatedChunk>();
  const missChunks: BatchTranslateChunk[] = [];
  for (const chunk of chunks) {
    const translatedParts: BatchTranslatedPart[] = [];
    let allHit = true;
    for (const part of chunk.parts) {
      const cached = hitMap.get(chunkAccelId(chunk.chunkId, part.partId, part.sliceIndex));
      if (cached === undefined) {
        allHit = false;
        break;
      }
      translatedParts.push({ partId: part.partId, sliceIndex: part.sliceIndex, text: cached });
    }
    if (allHit) {
      hitsByChunkId.set(chunk.chunkId, { chunkId: chunk.chunkId, translatedParts });
    } else {
      missChunks.push(chunk);
    }
  }
  return { hitsByChunkId, missChunks };
}

/**
 * 翻译完成的 chunk 逐 part 写缓存（fire-and-forget，一次请求写整块）。
 * 译文里只有 partId/sliceIndex，需要 `sourceTexts` 提供原文才能构成缓存身份。
 */
function commitTranslatedChunk(
  endpoint: string,
  chunk: BatchTranslatedChunk,
  targetLang: string,
  sourceTexts: Map<string, string>,
): void {
  const items = chunk.translatedParts.flatMap((part) => {
    const key = chunkAccelId(chunk.chunkId, part.partId, part.sliceIndex);
    const text = sourceTexts.get(key);
    if (text === undefined) return [];
    return [{ id: newAccelId(), text, targetLang, translatedText: part.text }];
  });
  if (items.length > 0) accelCommit(endpoint, items);
}

/** 建立 `${chunkId}-${partId}-${sliceIndex}` → 原文 的查表，供 commit 还原缓存身份。 */
function buildSourceTextIndex(chunks: BatchTranslateChunk[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const chunk of chunks) {
    for (const part of chunk.parts) {
      index.set(chunkAccelId(chunk.chunkId, part.partId, part.sliceIndex), part.text);
    }
  }
  return index;
}

/** 单条存缓存（fire-and-forget）。 */
function commitAccelText(endpoint: string, req: TranslateRequest, translatedText: string): void {
  accelCommit(endpoint, [
    {
      id: newAccelId(),
      text: req.text,
      targetLang: req.targetLang,
      sourceLang: req.sourceLang,
      translatedText,
    },
  ]);
}

/** Only the built-in keyless chain may switch providers without explicit user selection. */
async function translateWithDefaultFallback(
  config: ProviderConfig,
  req: TranslateRequest,
  signal?: AbortSignal,
): Promise<TranslateResult> {
  const primaryResult = await createProvider(config).translate(req, signal);
  const fallbackEligible = primaryResult.errorType === 'network'
    || primaryResult.errorType === 'rate-limit'
    || primaryResult.errorType === 'unreachable';

  if (
    config.id !== DEFAULT_ACTIVE_SOURCE_ID
    || !fallbackEligible
    || signal?.aborted
  ) {
    return primaryResult;
  }

  const fallbackConfig = getBuiltinSourceById(DEFAULT_FALLBACK_SOURCE_ID);
  if (!fallbackConfig) return primaryResult;
  return createProvider(fallbackConfig).translate(req, signal);
}

/**
 * 翻译：经适配层路由到当前生效源
 * 读取 settings.activeProviderId + providers + 内置免费源，从注册表创建 provider 并调用 translate。
 * - activeProviderId 为 null 时走默认免 Key 链：builtin:microsoft 失败后回退 builtin:google。
 * - 先在用户已配置源中查找，未命中再查内置免 Key 免费源。
 * - 均未命中才返回 no-config 错误。
 */
export async function translateWithAdapter(
  req: TranslateRequest,
  accelOptions?: AccelRequestOptions,
): Promise<TranslateResult> {
  const { config, settings } = await resolveTarget();

  if (!config) {
    return {
      translatedText: '',
      error: errorTypeMessage('no-config'),
      errorType: 'no-config',
    };
  }

  const accelEndpoint = resolveAccelEndpoint(settings, config);
  if (accelEndpoint) {
    const cached = await accelLookupText(accelEndpoint, req, accelOptions);
    if (cached !== null) return { translatedText: cached };
  }

  const result = await translateWithDefaultFallback(config, req);
  // 仅成功且有译文时提交缓存；失败译文不入缓存。
  if (accelEndpoint && !result.error && result.translatedText) {
    commitAccelText(accelEndpoint, req, result.translatedText);
  }
  return result;
}

/**
 * 流式翻译：经适配层路由到当前生效源
 * 读取生效源配置（同 translateWithAdapter），创建 provider。
 * - provider 实现 translateStream → 调流式方法，逐 chunk 经 onChunk 上抛，返回最终结果。
 * - provider 未实现 translateStream（传统源）→ 回退调 translate(req)，将完整译文作为单 chunk 经 onChunk 推送一次，再返回结果（非流式源对上层表现为「一次性流」）。
 * - 无可用源返回 TranslateResult{ errorType: 'no-config' }（不调 onChunk）。
 */
export async function translateWithAdapterStream(
  req: TranslateRequest,
  onChunk: (chunk: TranslateChunk) => void,
  signal?: AbortSignal,
  accelOptions?: AccelRequestOptions,
): Promise<TranslateResult> {
  const { config, settings } = await resolveTarget();

  if (!config) {
    return {
      translatedText: '',
      error: errorTypeMessage('no-config'),
      errorType: 'no-config',
    };
  }

  const accelEndpoint = resolveAccelEndpoint(settings, config);

  // 缓存命中：整段译文一次性推送，不模拟流式（CONTEXT.md §3.13）。
  if (accelEndpoint) {
    const cached = await accelLookupText(accelEndpoint, req, accelOptions);
    if (cached !== null) {
      onChunk({ deltaText: cached });
      return { translatedText: cached };
    }
  }

  const provider = createProvider(config);

  // provider 支持流式 → 调流式方法（提交在流结束后由 onChunk 收尾触发）
  if (provider.translateStream) {
    const result = await provider.translateStream(req, onChunk, signal);
    if (accelEndpoint && !result.error && result.translatedText) {
      commitAccelText(accelEndpoint, req, result.translatedText);
    }
    return result;
  }

  // 传统源一次性返回；默认免 Key 源在 Microsoft 失败时先尝试 Google。
  const result = await translateWithDefaultFallback(config, req, signal);
  if (!result.error && result.translatedText) {
    onChunk({ deltaText: result.translatedText });
    if (accelEndpoint) {
      commitAccelText(accelEndpoint, req, result.translatedText);
    }
  }
  return result;
}

/** Reports only the active source capability required by the full-page orchestrator. */
export async function getTranslationCapabilities(): Promise<TranslationCapabilities> {
  const config = await resolveActiveProviderConfig();
  if (!config) return { batchStream: false };

  return { batchStream: Boolean(createProvider(config).translateBatchStream) };
}

/**
 * Routes a full-page batch stream to the active LLM provider.
 * Traditional providers are rejected explicitly; scalar fallback would defeat batching semantics.
 */
export async function translateBatchWithAdapterStream(
  req: BatchTranslateRequest,
  onChunk: (chunk: BatchTranslatedChunk) => void,
): Promise<BatchTranslateResult> {
  const missingChunkIds = req.chunks.map((chunk) => chunk.chunkId);
  const { config, settings } = await resolveTarget();

  if (!config) {
    return {
      missingChunkIds,
      error: errorTypeMessage('no-config'),
      errorType: 'no-config',
    };
  }

  const provider = createProvider(config);
  if (!provider.translateBatchStream) {
    return {
      missingChunkIds,
      error: '当前翻译源不支持批量流式翻译',
      errorType: 'unreachable',
    };
  }

  // 加速接入：按 chunk 整体命中才短路。
  // 缓存身份仍是「单条原文 + 语言」（ADR-0002）——这里按 part 逐条查缓存，
  // 但只有 chunk 的**全部** part 都命中才整块短路。原因在池侧：
  // validateTranslatedChunk 要求返回的 parts 数量与请求完全一致（整段全有或全无），
  // 部分命中若只回部分 parts 会被判为非法而丢弃，导致该段永不 settle。
  const accelEndpoint = resolveAccelEndpoint(settings, config);
  if (accelEndpoint) {
    const { hitsByChunkId, missChunks } = await accelLookupChunks(
      accelEndpoint,
      req.chunks,
      req.targetLang,
    );

    // 命中块直接以「完整 chunk」形态回给池
    for (const chunk of req.chunks) {
      const hit = hitsByChunkId.get(chunk.chunkId);
      if (hit) onChunk(hit);
    }

    // 全部命中 → 不发起任何 LLM 请求
    if (missChunks.length === 0) return { missingChunkIds: [] };

    const sourceTexts = buildSourceTextIndex(missChunks);
    const result = await provider.translateBatchStream(
      { targetLang: req.targetLang, chunks: missChunks },
      (chunk) => {
        onChunk(chunk);
        commitTranslatedChunk(accelEndpoint, chunk, req.targetLang, sourceTexts);
      },
    );
    return result;
  }

  return provider.translateBatchStream(req, onChunk);
}

/**
 * 连通性测试：默认免 Key 入口测试整条回退链，其他配置只测试指定 provider。
 * 不依赖 settings 中的当前生效源。
 */
export async function testWithAdapter(config: ProviderConfig): Promise<TranslateResult> {
  if (config.id === DEFAULT_ACTIVE_SOURCE_ID) {
    return translateWithDefaultFallback(config, { text: 'hello', targetLang: '中文' });
  }
  const provider = createProvider(config);
  return provider.test();
}

/**
 * 获取可用源列表与当前生效源（供 #4 配置页消费）
 * 合并内置免 Key 免费源 + 用户已配置源，返回当前生效源 ID。
 * activeProviderId 为 null 时解析为默认 builtin:microsoft。
 */
export async function getActiveSources(): Promise<ActiveSourcesResult> {
  const settings = await getSettings();
  const providers = await getProviders();
  const activeSourceId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID;
  return {
    sources: [...BUILTIN_FREE_SOURCES, ...providers],
    activeSourceId,
  };
}

/**
 * 切换生效源（供 #4 配置页消费）
 * id 可为内置免 Key 源 ID（builtin:microsoft / builtin:google）或用户已配置源 ID。
 * 仅写入 settings.activeProviderId，不校验 id 是否存在（由调用方保证）。
 */
export async function setActiveSource(id: string): Promise<void> {
  const settings = await getSettings();
  await setSettings({ ...settings, activeProviderId: id });
}
