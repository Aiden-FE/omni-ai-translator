// 加速配置裁决 — 决定「这次翻译要不要走加速节点」。
//
// 见 ADR-0002 / CONTEXT.md §3.14–3.16：
// - accelEndpoint 为空 → 不使用加速（默认）
// - accelScope='builtin'（默认）→ 只对免 Key 内置源走加速，用户自有源不外发原文
// - 配置了非默认 customPrompt → 整体跳过（个性化提示词不进共享缓存）

import type { ProviderConfig, Settings } from '@/shared/types';
import { isBuiltinSourceId } from '@/shared/translator/builtin-sources';

/** 官方加速端点。选「官方」即等价于把该 URL 写入 accelEndpoint，不引入 preset 字段。 */
export const OFFICIAL_ACCEL_ENDPOINT = 'https://omni-trans.makabonka.com';

/** 加速范围：仅免 Key 内置源 / 所有翻译源。 */
export type AccelScope = 'builtin' | 'all';

export const DEFAULT_ACCEL_SCOPE: AccelScope = 'builtin';

/**
 * 归一化用户输入的端点：trim + 去尾部斜杠。
 * 空串 / 空白 / 非法值 → null（不使用加速）。
 *
 * 只接受 http/https 绝对 URL：协议白名单是必要的最小校验，
 * 避免 `javascript:` 之类的输入被当成端点。
 */
export function normalizeAccelEndpoint(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return trimmed;
}

/** 从设置中解出归一化后的端点与范围（读取侧归一化，不依赖存储层深合并）。 */
export function deriveAccelSettings(settings: Settings): {
  endpoint: string | null;
  scope: AccelScope;
} {
  return {
    endpoint: normalizeAccelEndpoint(settings.accelEndpoint),
    scope: settings.accelScope === 'all' ? 'all' : DEFAULT_ACCEL_SCOPE,
  };
}

/** 是否需要跳过加速：任一条件命中即跳过。 */
export interface AccelEligibilityInput {
  endpoint: string | null;
  scope: AccelScope;
  /** 当前生效源配置；null 表示无可用源。 */
  activeConfig: ProviderConfig | null;
  customPrompt?: string;
}

/**
 * 判定是否对当前源启用加速。
 * customPrompt 非空即视为「个性化提示词」——本项目默认不带 customPrompt，
 * 因此任何非空值都意味着用户要求了特定风格，其结果不应进入共享缓存。
 */
export function isAccelEligible(input: AccelEligibilityInput): boolean {
  const { endpoint, scope, activeConfig, customPrompt } = input;
  if (endpoint === null) return false;
  if (activeConfig === null) return false;
  if (typeof customPrompt === 'string' && customPrompt.trim() !== '') return false;
  if (scope === 'builtin' && !isBuiltinSourceId(activeConfig.id)) return false;
  return true;
}
