// LLM 适配层（兼容层）— 保留导出签名，内部委托适配层统一入口
// LLM 具体实现已迁移至 shared/translator/llm-provider.ts
// content-script 不应直接 fetch 第三方接口，统一由 background 调用适配层。
import type { ProviderConfig, TranslateRequest, TranslateResult } from './types';
import { createProvider } from './translator/registry';

/**
 * 翻译入口（兼容签名）— 委托适配层 createProvider + provider.translate
 * @deprecated 建议使用 shared/translator 的 translateWithAdapter 统一入口
 */
export async function translate(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  return createProvider(provider).translate(req);
}

/** 连通性测试：发送一条最小翻译请求 */
export async function testProvider(provider: ProviderConfig): Promise<TranslateResult> {
  return createProvider(provider).test();
}
