// 内置免 Key 免费翻译源单元测试
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_FREE_SOURCES,
  DEFAULT_ACTIVE_SOURCE_ID,
  getBuiltinSourceById,
  isBuiltinSourceId,
} from '../builtin-sources';

describe('BUILTIN_FREE_SOURCES', () => {
  it('包含 microsoft 与 google 两个免 Key 源', () => {
    const types = BUILTIN_FREE_SOURCES.map((s) => s.type).sort();
    expect(types).toEqual(['google', 'microsoft']);
  });

  it('每个内置源 category 为 traditional 且有稳定 ID', () => {
    for (const s of BUILTIN_FREE_SOURCES) {
      expect(s.category).toBe('traditional');
      expect(s.id).toMatch(/^builtin:(microsoft|google)$/);
      expect(s.baseUrl).toBeTruthy();
    }
  });

  it('microsoft 在列表中（默认源存在）', () => {
    expect(BUILTIN_FREE_SOURCES.some((s) => s.id === 'builtin:microsoft')).toBe(true);
  });
});

describe('DEFAULT_ACTIVE_SOURCE_ID', () => {
  it('默认生效源为 builtin:microsoft（显式默认值）', () => {
    expect(DEFAULT_ACTIVE_SOURCE_ID).toBe('builtin:microsoft');
  });
});

describe('getBuiltinSourceById', () => {
  it('命中 builtin:microsoft 返回配置', () => {
    const src = getBuiltinSourceById('builtin:microsoft');
    expect(src).toBeDefined();
    expect(src?.type).toBe('microsoft');
  });

  it('命中 builtin:google 返回配置', () => {
    const src = getBuiltinSourceById('builtin:google');
    expect(src).toBeDefined();
    expect(src?.type).toBe('google');
  });

  it('未命中返回 undefined', () => {
    expect(getBuiltinSourceById('non-existent')).toBeUndefined();
    expect(getBuiltinSourceById('builtin:openai')).toBeUndefined();
  });
});

describe('isBuiltinSourceId', () => {
  it('内置源 ID 返回 true', () => {
    expect(isBuiltinSourceId('builtin:microsoft')).toBe(true);
    expect(isBuiltinSourceId('builtin:google')).toBe(true);
  });

  it('非内置源 ID 返回 false', () => {
    expect(isBuiltinSourceId('user-provider-1')).toBe(false);
    expect(isBuiltinSourceId('')).toBe(false);
  });
});
