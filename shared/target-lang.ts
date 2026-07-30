// 目标语言解析 — 划词翻译与全文翻译共用的默认目标语言推导
// 自 entrypoints/content.ts 机械提取（行为不变）：用户配置优先，回退浏览器首选语言映射。

import { getSettings } from './storage';

export async function getTargetLang(): Promise<string> {
  // 优先使用用户在设置页配置的默认目标语言（trim 后非空）
  const settings = await getSettings();
  const configured = settings.defaultTargetLang?.trim();
  if (configured) return configured;
  // 留空则回退浏览器首选语言，如 "zh-CN" → "中文" 简化映射；未命中则原样返回
  const lang = (navigator.language || 'en').toLowerCase();
  const map: Record<string, string> = {
    'zh-cn': '简体中文',
    'zh-tw': '繁體中文',
    'zh-hk': '繁體中文',
    zh: '中文',
    en: 'English',
    ja: '日本語',
    ko: '한국어',
    fr: 'Français',
    de: 'Deutsch',
    es: 'Español',
  };
  return map[lang] ?? map[lang.split('-')[0]] ?? lang;
}
