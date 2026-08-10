// 共享目标语言目录单元测试（#78）
// 目录为静态数据：不随翻译源变化；查找与搜索过滤逻辑在此锁定契约。
import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_CATALOG,
  filterLanguages,
  findLanguageByCode,
  resolveInitialTargetLang,
} from '../language-catalog';

describe('LANGUAGE_CATALOG — 目录结构', () => {
  it('覆盖约 50 种主流语言及地区变体', () => {
    expect(LANGUAGE_CATALOG.length).toBeGreaterThanOrEqual(50);
  });

  it('每项均含非空的 code / 中文名 / 原文名', () => {
    for (const entry of LANGUAGE_CATALOG) {
      expect(entry.code.trim().length).toBeGreaterThan(0);
      expect(entry.zhName.trim().length).toBeGreaterThan(0);
      expect(entry.nativeName.trim().length).toBeGreaterThan(0);
    }
  });

  it('语言代码唯一', () => {
    const codes = LANGUAGE_CATALOG.map((e) => e.code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('包含常见语言与必要地区变体', () => {
    const codes = LANGUAGE_CATALOG.map((e) => e.code.toLowerCase());
    for (const required of ['zh-cn', 'zh-tw', 'en', 'ja', 'ko', 'fr', 'de', 'es']) {
      expect(codes).toContain(required);
    }
  });
});

describe('findLanguageByCode — 目录查找', () => {
  it('按代码精确命中（大小写不敏感）', () => {
    expect(findLanguageByCode('zh-CN')?.zhName).toBe('简体中文');
    expect(findLanguageByCode('zh-cn')?.zhName).toBe('简体中文');
    expect(findLanguageByCode('EN')?.nativeName).toBe('English');
  });

  it('未收录代码返回 undefined', () => {
    expect(findLanguageByCode('xx-XX')).toBeUndefined();
    expect(findLanguageByCode('')).toBeUndefined();
  });

  it('返回值是目录内的同一条目（含原文名）', () => {
    const entry = findLanguageByCode('ja');
    expect(entry).toEqual({ code: 'ja', zhName: '日语', nativeName: '日本語' });
  });
});

describe('filterLanguages — 搜索过滤', () => {
  it('空查询（含纯空白）返回完整目录', () => {
    expect(filterLanguages('')).toEqual(LANGUAGE_CATALOG);
    expect(filterLanguages('   ')).toEqual(LANGUAGE_CATALOG);
  });

  it('按代码子串匹配（大小写不敏感）', () => {
    const result = filterLanguages('ZH-');
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.every((e) => e.code.toLowerCase().includes('zh-'))).toBe(true);
    expect(filterLanguages('en').some((e) => e.code.toLowerCase() === 'en')).toBe(true);
  });

  it('按中文名匹配', () => {
    const result = filterLanguages('简体');
    expect(result.map((e) => e.code)).toContain('zh-CN');
    expect(result.every((e) => e.zhName.includes('简体'))).toBe(true);
  });

  it('按原文名匹配', () => {
    const result = filterLanguages('français');
    expect(result.map((e) => e.code)).toContain('fr');
  });

  it('匹配命中任一字段即保留（code / 中文名 / 原文名）', () => {
    // '日本' 命中中文名与原文名；'ko' 命中代码
    expect(filterLanguages('日本').map((e) => e.code)).toContain('ja');
    expect(filterLanguages('ko').map((e) => e.code)).toContain('ko');
  });

  it('无匹配时返回空数组', () => {
    expect(filterLanguages('不存在的语言xyz')).toEqual([]);
  });
});

describe('resolveInitialTargetLang — 会话初始值解析', () => {
  it('设置值命中目录代码（大小写不敏感）→ 使用该条目', () => {
    expect(resolveInitialTargetLang('ja', 'en-US').code).toBe('ja');
    expect(resolveInitialTargetLang('  zh-CN  ', 'en-US').code).toBe('zh-CN');
  });

  it('设置值为空或无效 → 跟随浏览器首选语言（代码命中目录）', () => {
    expect(resolveInitialTargetLang('', 'ja-JP').code).toBe('ja');
    expect(resolveInitialTargetLang('无效值', 'fr-FR').code).toBe('fr');
    expect(resolveInitialTargetLang('en-US', 'de-DE').code).toBe('de');
  });

  it('浏览器语言带地区后缀 → 按主语言匹配目录', () => {
    expect(resolveInitialTargetLang('', 'zh-CN').code).toBe('zh-CN');
    expect(resolveInitialTargetLang('', 'pt-BR').code).toBe('pt');
  });

  it('浏览器语言未收录 → 回退 English', () => {
    expect(resolveInitialTargetLang('', 'xx-XX').code).toBe('en');
    expect(resolveInitialTargetLang('', '').code).toBe('en');
  });
});
