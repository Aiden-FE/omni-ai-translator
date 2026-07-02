// 适配层统一入口 — 上层（background）经此模块调用翻译，不感知具体源类型
import type { ProviderConfig, TranslateRequest, TranslateResult } from '@/shared/types';
import { getProviders, getSettings } from '@/shared/storage';
import { createProvider } from './registry';
import { errorTypeMessage } from './error';

/**
 * 翻译：经适配层路由到当前生效源
 * 读取 settings.activeProviderId + providers，从注册表创建 provider 并调用 translate。
 * 无可用源时返回 no-config 错误。
 */
export async function translateWithAdapter(req: TranslateRequest): Promise<TranslateResult> {
  const settings = await getSettings();
  const providers = await getProviders();
  const config = providers.find((p) => p.id === settings.activeProviderId);

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
