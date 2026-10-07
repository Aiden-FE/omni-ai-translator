import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCEL_SCOPE,
  OFFICIAL_ACCEL_ENDPOINT,
  deriveAccelSettings,
  isAccelEligible,
  normalizeAccelEndpoint,
} from '../config';
import type { ProviderConfig, Settings } from '@/shared/types';

const baseSettings: Settings = { activeProviderId: null, defaultTargetLang: 'zh' };

const builtinConfig: ProviderConfig = {
  id: 'builtin:microsoft',
  name: '微软翻译（免费）',
  type: 'microsoft',
  baseUrl: 'https://edge.microsoft.com/translate/translatetext',
  model: '',
};

const customConfig: ProviderConfig = {
  id: 'user-1',
  name: '自建 LLM',
  type: 'llm',
  baseUrl: 'https://api.example.com/v1',
  model: 'gpt-4',
  responseStyle: 'openai-completions',
};

describe('normalizeAccelEndpoint', () => {
  it('trim 并去掉尾部斜杠', () => {
    expect(normalizeAccelEndpoint('  https://accel.example.com/  ')).toBe('https://accel.example.com');
  });

  it('空串与纯空白 → null（不使用加速）', () => {
    expect(normalizeAccelEndpoint('')).toBeNull();
    expect(normalizeAccelEndpoint('   ')).toBeNull();
  });

  it('null / undefined → null', () => {
    expect(normalizeAccelEndpoint(null)).toBeNull();
    expect(normalizeAccelEndpoint(undefined)).toBeNull();
  });

  it('非 http/https 协议 → null（避免 javascript: 之类被当端点）', () => {
    expect(normalizeAccelEndpoint('javascript:alert(1)')).toBeNull();
    expect(normalizeAccelEndpoint('ftp://example.com')).toBeNull();
  });

  it('非法 URL → null', () => {
    expect(normalizeAccelEndpoint('not a url')).toBeNull();
  });

  it('官方端点自身可归一化', () => {
    expect(normalizeAccelEndpoint(OFFICIAL_ACCEL_ENDPOINT)).toBe(OFFICIAL_ACCEL_ENDPOINT);
  });

  it('保留路径前缀（不误删）', () => {
    expect(normalizeAccelEndpoint('https://example.com/accel/')).toBe('https://example.com/accel');
  });
});

describe('deriveAccelSettings', () => {
  it('未配置 → 端点 null、范围 builtin', () => {
    expect(deriveAccelSettings(baseSettings)).toEqual({ endpoint: null, scope: DEFAULT_ACCEL_SCOPE });
  });

  it('存量设置缺字段（undefined）等同未配置', () => {
    const legacy = { activeProviderId: 'x', defaultTargetLang: 'zh' } as Settings;
    expect(deriveAccelSettings(legacy).endpoint).toBeNull();
  });

  it('scope 只接受 all，其余回退 builtin', () => {
    expect(deriveAccelSettings({ ...baseSettings, accelScope: 'all' }).scope).toBe('all');
    expect(deriveAccelSettings({ ...baseSettings, accelScope: 'builtin' }).scope).toBe('builtin');
    // 脏数据
    expect(
      deriveAccelSettings({ ...baseSettings, accelScope: 'bogus' as never }).scope,
    ).toBe('builtin');
  });
});

describe('isAccelEligible', () => {
  const endpoint = 'https://accel.example.com';

  it('未配置端点 → 不启用', () => {
    expect(
      isAccelEligible({ endpoint: null, scope: 'all', activeConfig: builtinConfig }),
    ).toBe(false);
  });

  it('无可用源 → 不启用', () => {
    expect(
      isAccelEligible({ endpoint, scope: 'all', activeConfig: null }),
    ).toBe(false);
  });

  it('scope=builtin 且当前是内置源 → 启用', () => {
    expect(
      isAccelEligible({ endpoint, scope: 'builtin', activeConfig: builtinConfig }),
    ).toBe(true);
  });

  it('scope=builtin 且当前是自有源 → 不启用（原文不外发）', () => {
    expect(
      isAccelEligible({ endpoint, scope: 'builtin', activeConfig: customConfig }),
    ).toBe(false);
  });

  it('scope=all 且当前是自有源 → 启用', () => {
    expect(
      isAccelEligible({ endpoint, scope: 'all', activeConfig: customConfig }),
    ).toBe(true);
  });

  it('配置了非空 customPrompt → 整体跳过（个性化提示词不进共享缓存）', () => {
    expect(
      isAccelEligible({
        endpoint,
        scope: 'all',
        activeConfig: builtinConfig,
        customPrompt: '用文言文翻译',
      }),
    ).toBe(false);
  });

  it('customPrompt 为空白串视为未配置', () => {
    expect(
      isAccelEligible({
        endpoint,
        scope: 'all',
        activeConfig: builtinConfig,
        customPrompt: '   ',
      }),
    ).toBe(true);
  });
});
