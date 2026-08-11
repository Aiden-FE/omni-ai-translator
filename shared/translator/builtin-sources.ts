// 内置免 Key 免费翻译源 — Google / 微软
// 端点为内置常量，不可由用户编辑；UI 只暴露整体兜底链或用户自有源。
// 本模块定义内置源配置与默认生效源 ID，供适配层路由与 getActiveSources 合并返回。
// 语义：UI 将内置源作为一个「免 Key 兜底」暴露，内部按 Microsoft → Google 顺序回退。
import type { ProviderConfig } from '@/shared/types';

/**
 * 内置免 Key 翻译源端点常量（非官方公共端点，不可编辑）
 * 端点可能限流/封禁/地域不可达，由 classifyError 归类并交给默认链回退。
 */
// Google 翻译免 Key 公共端点（网页端点，GET，返回嵌套数组）
export const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

// 微软免 Key 翻译：Edge 的无鉴权文本端点（POST）
export const MICROSOFT_KEYLESS_TRANSLATE_ENDPOINT =
  'https://edge.microsoft.com/translate/translatetext';
// 微软官方 Azure Translator 端点（用户配置 Key 时使用）
export const MICROSOFT_TRANSLATE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate';

/**
 * 全新安装、用户未配置自有源时的默认链首源。
 * activeProviderId === null 时先解析为此值，失败再由适配层调用 DEFAULT_FALLBACK_SOURCE_ID。
 */
export const DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft';

/** 默认 Microsoft 不可用时透明尝试的免 Key 后备源。 */
export const DEFAULT_FALLBACK_SOURCE_ID = 'builtin:google';

/**
 * 内置免 Key 免费翻译源列表（供适配层组链，不可删除/编辑）。
 * baseUrl 字段存端点常量供信息展示，实际请求由 traditional-provider 按常量发起。
 */
export const BUILTIN_FREE_SOURCES: ProviderConfig[] = [
  {
    id: 'builtin:microsoft',
    name: '微软翻译（免费）',
    type: 'microsoft',
    category: 'traditional',
    baseUrl: MICROSOFT_TRANSLATE_ENDPOINT,
    model: '',
  },
  {
    id: 'builtin:google',
    name: 'Google 翻译（免费）',
    type: 'google',
    category: 'traditional',
    baseUrl: GOOGLE_ENDPOINT,
    model: '',
  },
];

/**
 * 按 ID 查找内置免 Key 源配置。
 * @returns 命中返回 ProviderConfig，未命中返回 undefined
 */
export function getBuiltinSourceById(id: string): ProviderConfig | undefined {
  return BUILTIN_FREE_SOURCES.find((s) => s.id === id);
}

/**
 * 判断 ID 是否为内置免 Key 源。
 */
export function isBuiltinSourceId(id: string): boolean {
  return BUILTIN_FREE_SOURCES.some((s) => s.id === id);
}
