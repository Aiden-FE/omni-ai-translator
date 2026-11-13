// 缓存语言标签规范化单测 — 同一段译文不能因为入口/设备不同被拆成多个 key。
import { describe, expect, it } from 'vitest';
import { canonicalAccelLang } from '../lang';

describe('canonicalAccelLang', () => {
  it('目录代码原样（大小写/空白归一）', () => {
    expect(canonicalAccelLang('zh-CN')).toBe('zh-CN');
    expect(canonicalAccelLang('  ZH-cn ')).toBe('zh-CN');
    expect(canonicalAccelLang('en')).toBe('en');
  });

  it('浏览器兜底产生的显示名映射回 BCP-47', () => {
    // shared/target-lang.ts 的 navigator.language 映射
    expect(canonicalAccelLang('简体中文')).toBe('zh-CN');
    expect(canonicalAccelLang('繁體中文')).toBe('zh-TW');
    expect(canonicalAccelLang('中文')).toBe('zh-CN');
    expect(canonicalAccelLang('English')).toBe('en');
    expect(canonicalAccelLang('日本語')).toBe('ja');
  });

  it('繁体两种写法归一到同一 key', () => {
    expect(canonicalAccelLang('繁体中文')).toBe('zh-TW');
    expect(canonicalAccelLang('繁體中文')).toBe('zh-TW');
  });

  it('undefined / 空串保留语义区别', () => {
    expect(canonicalAccelLang(undefined)).toBeUndefined();
    expect(canonicalAccelLang('')).toBe('');
    expect(canonicalAccelLang('   ')).toBe('');
  });

  it('未知语言原样返回，不擅自改写', () => {
    expect(canonicalAccelLang('Klingon')).toBe('Klingon');
  });
});
