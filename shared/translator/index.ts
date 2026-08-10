// 适配层统一入口 — 上层（background）经此模块调用翻译，不感知具体源类型
import type {
  ActiveSourcesResult,
  BatchTranslateRequest,
  BatchTranslateResult,
  BatchTranslatedChunk,
  ProviderConfig,
  TranslationCapabilities,
  TranslateChunk,
  TranslateRequest,
  TranslateResult,
} from '@/shared/types';
import { getProviders, getSettings, setSettings } from '@/shared/storage';
import { createProvider } from './registry';
import { errorTypeMessage } from './error';
import {
  BUILTIN_FREE_SOURCES,
  DEFAULT_ACTIVE_SOURCE_ID,
  getBuiltinSourceById,
} from './builtin-sources';

/** Resolves the active user or builtin provider consistently for every translation entry point. */
async function resolveActiveProviderConfig(): Promise<ProviderConfig | null> {
  const [settings, providers] = await Promise.all([getSettings(), getProviders()]);
  const activeId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID;
  return providers.find((provider) => provider.id === activeId)
    ?? getBuiltinSourceById(activeId)
    ?? null;
}

/**
 * 翻译：经适配层路由到当前生效源
 * 读取 settings.activeProviderId + providers + 内置免费源，从注册表创建 provider 并调用 translate。
 * - activeProviderId 为 null 时解析为默认 builtin:microsoft（显式默认值，非隐式回退）。
 * - 先在用户已配置源中查找，未命中再查内置免 Key 免费源。
 * - 均未命中才返回 no-config 错误。
 */
export async function translateWithAdapter(req: TranslateRequest): Promise<TranslateResult> {
  const config = await resolveActiveProviderConfig();

  if (!config) {
    return {
      translatedText: '',
      error: errorTypeMessage('no-config'),
      errorType: 'no-config',
    };
  }

  const provider = createProvider(config);
  return provider.translate(req);
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
): Promise<TranslateResult> {
  const config = await resolveActiveProviderConfig();

  if (!config) {
    return {
      translatedText: '',
      error: errorTypeMessage('no-config'),
      errorType: 'no-config',
    };
  }

  const provider = createProvider(config);

  // provider 支持流式 → 调流式方法
  if (provider.translateStream) {
    return provider.translateStream(req, onChunk, signal);
  }

  // 传统源回退：调 translate() 一次性返回，完整译文作单 chunk 推送
  const result = await provider.translate(req, signal);
  if (!result.error && result.translatedText) {
    onChunk({ deltaText: result.translatedText });
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
  const config = await resolveActiveProviderConfig();

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

  return provider.translateBatchStream(req, onChunk);
}

/**
 * 连通性测试：对指定 provider 配置测试
 * 直接创建 provider 实例并调用 test，不依赖 settings 中的当前生效源。
 */
export async function testWithAdapter(config: ProviderConfig): Promise<TranslateResult> {
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
