// 缓存身份里的语言标签规范化。
//
// 背景（2026-11-13 生产诊断）：同一段原文的 targetLang 在不同入口/设备上可能是
// - '简体中文'（全文翻译跟随 navigator.language 时的显示名）
// - 'zh-CN'（popup 文本翻译 / 设置页显式选择的目录代码）
// - '中文'（navigator.language 为 zh 时的映射）
// 服务端 key 直接哈希这个字符串，于是同一段译文被拆成多条缓存、跨设备永远不命中。
//
// 这里把目录里的代码/中文名/原文名统一映射到 BCP-47 代码，只用于加速层的
// lookup/commit 身份；翻译请求本身仍按原 targetLang 发送，避免改变翻译行为。

import { LANGUAGE_CATALOG } from '@/shared/language-catalog';

const BY_LABEL = new Map<string, string>();

for (const entry of LANGUAGE_CATALOG) {
  for (const label of [entry.code, entry.zhName, entry.nativeName]) {
    BY_LABEL.set(label.trim().toLowerCase(), entry.code);
  }
}

/**
 * 目录之外的常见写法。
 * '中文' 是 navigator.language === 'zh' 的兜底映射；简体/繁体两种字形都收。
 */
const EXTRA_ALIASES: Record<string, string> = {
  '中文': 'zh-CN',
  '简体': 'zh-CN',
  '繁体': 'zh-TW',
  '繁體': 'zh-TW',
  '繁体中文': 'zh-TW',
  '简体中文（中国）': 'zh-CN',
  '中文（简体）': 'zh-CN',
  '中文（繁體）': 'zh-TW',
};

/**
 * 把语言标签规范成稳定的缓存身份。
 * - undefined 原样返回（表示「未传」，服务端按空串处理，与显式空串区分）
 * - 已知显示名 / 代码 → 目录里的 BCP-47 代码
 * - 未知值 → trim 后原样返回，避免悄悄改变自建节点的语义
 */
export function canonicalAccelLang(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  const label = trimmed.toLowerCase();
  return BY_LABEL.get(label) ?? EXTRA_ALIASES[label] ?? trimmed;
}
