// 适配层统一入口 — 上层（background）经此模块调用翻译，不感知具体源类型
import type {
  ActiveSourcesResult,
  ProviderConfig,
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

/**
 * 翻译：经适配层路由到当前生效源
 * 读取 settings.activeProviderId + providers + 内置免费源，从注册表创建 provider 并调用 translate。
 * - activeProviderId 为 null 时解析为默认 builtin:microsoft（显式默认值，非隐式回退）。
 * - 先在用户已配置源中查找，未命中再查内置免 Key 免费源。
 * - 均未命中才返回 no-config 错误。
 */
export async function translateWithAdapter(req: TranslateRequest): Promise<TranslateResult> {
  const settings = await getSettings();
  const providers = await getProviders();
  const activeId = settings.activeProviderId ?? DEFAULT_ACTIVE_SOURCE_ID;

  // 先查用户已配置源，再查内置免 Key 免费源
  const config =
    providers.find((p) => p.id === activeId) ?? getBuiltinSourceById(activeId);

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
