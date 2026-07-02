// 内置免 Key 免费翻译源 — Google / 微软
// 端点为内置常量，不可由用户编辑（免费源只能选择/切换或被自有源替换为生效项）。
// 本模块定义内置源配置与默认生效源 ID，供适配层路由与 getActiveSources 合并返回。
// 语义：本任务实现的是「用户可选的免费翻译源」，不是「兜底源」；无隐式自动回退。
import type { ProviderConfig } from '@/shared/types';

/**
 * 内置免 Key 翻译源端点常量（非官方公共端点，不可编辑）
 * 实现时验证可达性；端点可能限流/封禁/地域不可达，由 classifyError 归类 + 人工切换应对。
 */
// Google 翻译免 Key 公共端点（网页端点，GET，返回嵌套数组）
export const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

// 微软翻译免 Key：先经 Edge auth 端点取 token，再调用认知服务翻译端点（POST）
export const MICROSOFT_AUTH_ENDPOINT = 'https://edge.microsoft.com/translate/auth';
export const MICROSOFT_TRANSLATE_ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate';

/**
 * 全新安装、用户未做选择时的默认生效源（显式默认值，保证开箱即用）。
 * activeProviderId === null 时解析为此值，非隐式回退。
 */
export const DEFAULT_ACTIVE_SOURCE_ID = 'builtin:microsoft';

/**
 * 内置免 Key 免费翻译源列表（始终可选，不可删除/编辑）。
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
