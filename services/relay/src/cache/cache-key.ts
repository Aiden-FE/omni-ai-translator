// 缓存身份 — 规范化与哈希全部在服务端完成，插件不实现哈希算法。
//
// 见 ADR-0002：缓存条目身份 = 规范化原文 + 源语言 + 目标语言。
// 刻意不含 model / customPrompt 指纹——那属于用户个性化场景，不进共享缓存。

import { createHash } from 'node:crypto';

/** Redis key 前缀，便于自建者与其他数据共存于同一实例。 */
export const CACHE_KEY_PREFIX = 'omni:accel:v1:';

/** 缓存条目的身份三元组。 */
export interface CacheIdentity {
  text: string;
  targetLang: string;
  sourceLang?: string;
}

/**
 * 原文规范化：先 NFKC 归一（统一全角/半角、兼容字符），再 trim 去除首尾空白，
 * 最后折叠连续空白。折叠空白是因为 "a  b" 与 "a b" 在渲染上等价，
 * 不折叠会让同一段落因 HTML 缩进差异产生两条缓存。
 */
export function normalizeText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/**
 * 语言标签规范化：NFKC + trim + 小写。空串保留为空串（表示自动检测），
 * 不能与 undefined 混为一谈——前者是显式「自动检测」，后者是「未传」。
 */
function normalizeLang(lang: string | undefined): string {
  if (lang === undefined) return '';
  return lang.normalize('NFKC').trim().toLowerCase();
}

/**
 * 计算缓存键。语言用分隔符包裹，避免 "zh" + "CN" 与 "zhC" + "N" 之类的拼接歧义。
 */
export function buildCacheKey(identity: CacheIdentity): string {
  const text = normalizeText(identity.text);
  const target = normalizeLang(identity.targetLang);
  const source = normalizeLang(identity.sourceLang);

  const digest = createHash('sha256').update(text, 'utf8').digest('hex');
  return `${CACHE_KEY_PREFIX}${digest}:${source}:${target}`;
}
