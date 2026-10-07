import { describe, expect, it } from 'vitest';
import { buildCacheKey, CACHE_KEY_PREFIX, normalizeText } from './cache-key.js';

describe('normalizeText', () => {
  it('NFKC 归一全角与兼容字符', () => {
    // 全角括号（（））经 NFKC 变半角；兼容字符 ① 变 1
    expect(normalizeText('（①）')).toBe('(1)');
  });

  it('trim 去除首尾空白', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('折叠连续空白为一个空格', () => {
    // 同一段落在不同 HTML 缩进下会得到 "a  b" 与 "a b"，
    // 不折叠会产生两条重复缓存
    expect(normalizeText('a  \n\t b')).toBe('a b');
  });
});

describe('buildCacheKey', () => {
  it('同一原文经不同缩进/全角变化后得到同一 key', () => {
    const a = buildCacheKey({ text: '  你好  世界 ', targetLang: 'zh' });
    const b = buildCacheKey({ text: '你好　世界', targetLang: 'zh' });
    expect(a).toBe(b);
  });

  it('目标语言不同 → key 不同', () => {
    const zh = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    const en = buildCacheKey({ text: 'hello', targetLang: 'en' });
    expect(zh).not.toBe(en);
  });

  it('源语言不同 → key 不同', () => {
    const auto = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    const en = buildCacheKey({ text: 'hello', targetLang: 'zh', sourceLang: 'en' });
    expect(auto).not.toBe(en);
  });

  it('源语言大小写/空白归一后等价', () => {
    const lower = buildCacheKey({ text: 'hello', targetLang: 'zh', sourceLang: 'en' });
    const upper = buildCacheKey({ text: 'hello', targetLang: 'zh', sourceLang: ' EN ' });
    expect(lower).toBe(upper);
  });

  it('空串源语言 ≠ undefined 之外的其他值，但都表示自动检测', () => {
    const empty = buildCacheKey({ text: 'hello', targetLang: 'zh', sourceLang: '' });
    const undef = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    expect(empty).toBe(undef);
  });

  it('语言用分隔符包裹，避免拼接歧义', () => {
    // 若直接拼接，"zh"+"CN" 与 "zhC"+"N" 会撞
    const zhcn = buildCacheKey({ text: 'x', targetLang: 'zh', sourceLang: 'CN' });
    const zhc = buildCacheKey({ text: 'x', targetLang: 'zhC', sourceLang: 'N' });
    expect(zhcn).not.toBe(zhc);
  });

  it('key 带前缀且原文不出现在 key 中（不泄露原文）', () => {
    const key = buildCacheKey({ text: '机密内容', targetLang: 'zh' });
    expect(key.startsWith(CACHE_KEY_PREFIX)).toBe(true);
    expect(key).not.toContain('机密内容');
  });

  it('不同原文 → 不同 key', () => {
    const a = buildCacheKey({ text: 'hello', targetLang: 'zh' });
    const b = buildCacheKey({ text: 'world', targetLang: 'zh' });
    expect(a).not.toBe(b);
  });
});
