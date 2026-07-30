// getTargetLang 单元测试 — 目标语言解析：用户配置优先（trim 非空），否则回退 navigator.language 映射
// 该函数自 entrypoints/content.ts 机械提取至 shared/target-lang.ts，本测试锁定其行为契约（划词与全文翻译共用）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTargetLang } from '../target-lang';

/** Mock browser.storage.local（settings 键），沿用 storage.test.ts 的 stub 模式 */
function mockSettings(defaultTargetLang: string | undefined): void {
  const settings =
    defaultTargetLang === undefined
      ? undefined
      : { activeProviderId: null, defaultTargetLang };
  const store: Record<string, unknown> = {};
  if (settings !== undefined) {
    store['llm_translator:settings'] = settings;
  }
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      },
    },
  });
}

/** Stub navigator.language（函数内运行时读取） */
function mockNavigatorLanguage(language: string): void {
  vi.stubGlobal('navigator', { language });
}

describe('getTargetLang — 目标语言解析', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('用户配置非空 → 原样返回配置值', async () => {
    mockSettings('简体中文');
    mockNavigatorLanguage('en-US');
    await expect(getTargetLang()).resolves.toBe('简体中文');
  });

  it('用户配置含首尾空白 → trim 后返回', async () => {
    mockSettings('  日本語  ');
    mockNavigatorLanguage('en-US');
    await expect(getTargetLang()).resolves.toBe('日本語');
  });

  it('用户配置为空白字符串 → 回退 navigator.language 映射', async () => {
    mockSettings('   ');
    mockNavigatorLanguage('zh-CN');
    await expect(getTargetLang()).resolves.toBe('简体中文');
  });

  it('无 settings 存储 → 回退 navigator.language 映射', async () => {
    mockSettings(undefined);
    mockNavigatorLanguage('zh-CN');
    await expect(getTargetLang()).resolves.toBe('简体中文');
  });

  it('zh-TW / zh-HK → 繁體中文', async () => {
    mockSettings('');
    mockNavigatorLanguage('zh-TW');
    await expect(getTargetLang()).resolves.toBe('繁體中文');
    mockNavigatorLanguage('zh-HK');
    await expect(getTargetLang()).resolves.toBe('繁體中文');
  });

  it('带区域后缀的语言（en-US）→ 按主语言映射（English）', async () => {
    mockSettings('');
    mockNavigatorLanguage('en-US');
    await expect(getTargetLang()).resolves.toBe('English');
  });

  it('主语言命中映射（fr）→ Français', async () => {
    mockSettings('');
    mockNavigatorLanguage('fr');
    await expect(getTargetLang()).resolves.toBe('Français');
  });

  it('未命中映射的语言（pt-BR）→ 原样返回小写值', async () => {
    mockSettings('');
    mockNavigatorLanguage('pt-BR');
    await expect(getTargetLang()).resolves.toBe('pt-br');
  });

  it('navigator.language 为空 → 回退 en → English', async () => {
    mockSettings('');
    mockNavigatorLanguage('');
    await expect(getTargetLang()).resolves.toBe('English');
  });
});
