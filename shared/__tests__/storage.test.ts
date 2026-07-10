// 存储模块 on-read 迁移单元测试 — 覆盖旧 type(openai-compatible/ollama)→ 新 type(llm)+responseStyle 迁移
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProviders } from '../storage';
import type { ProviderConfig } from '../types';

// Mock browser.storage.local
function mockStorage(providers: ProviderConfig[] | null): void {
  const store: Record<string, unknown> = {};
  if (providers !== null) {
    store['llm_translator:providers'] = providers;
  }
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: store[key] })),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  });
}

describe('getProviders — on-read 迁移', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('旧 type=ollama → type=llm + responseStyle=ollama', async () => {
    mockStorage([
      { id: 'p1', name: 'my-ollama', type: 'ollama' as string, baseUrl: 'http://localhost:11434/api/chat', model: 'llama3' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('ollama');
    expect(providers[0].baseUrl).toBe('http://localhost:11434/api/chat');
    expect(providers[0].model).toBe('llama3');
  });

  it('旧 type=openai-compatible 无 responseStyle → type=llm + responseStyle=openai(缺省)', async () => {
    mockStorage([
      { id: 'p2', name: 'my-openai', type: 'openai-compatible' as string, baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('openai');
  });

  it('旧 type=openai-compatible + responseStyle=anthropic → type=llm + responseStyle=anthropic(保留)', async () => {
    mockStorage([
      { id: 'p3', name: 'my-anthropic', type: 'openai-compatible' as string, baseUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-3', responseStyle: 'anthropic' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('anthropic');
  });

  it('旧 type=openai-compatible + responseStyle=openai → type=llm + responseStyle=openai(保留)', async () => {
    mockStorage([
      { id: 'p4', name: 'my-openai-explicit', type: 'openai-compatible' as string, baseUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', responseStyle: 'openai' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('openai');
  });

  it('新 type=llm → 不变(无迁移)', async () => {
    mockStorage([
      { id: 'p5', name: 'already-new', type: 'llm', baseUrl: 'http://x', model: 'm', responseStyle: 'anthropic' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('anthropic');
  });

  it('传统源 type=google → 不变(无迁移)', async () => {
    mockStorage([
      { id: 'p6', name: 'google-src', type: 'google', baseUrl: 'https://translation.googleapis.com', model: '' },
    ]);
    const providers = await getProviders();
    expect(providers[0].type).toBe('google');
    expect(providers[0].responseStyle).toBeUndefined();
  });

  it('混合存量配置 → 各自正确迁移', async () => {
    mockStorage([
      { id: 'p7', name: 'ollama-old', type: 'ollama' as string, baseUrl: 'http://localhost:11434/api/chat', model: 'llama3' },
      { id: 'p8', name: 'openai-old', type: 'openai-compatible' as string, baseUrl: 'http://x', model: 'm' },
      { id: 'p9', name: 'google', type: 'google', baseUrl: 'http://g', model: '' },
      { id: 'p10', name: 'llm-new', type: 'llm', baseUrl: 'http://y', model: 'm', responseStyle: 'ollama' },
    ]);
    const providers = await getProviders();
    expect(providers).toHaveLength(4);
    expect(providers[0].type).toBe('llm');
    expect(providers[0].responseStyle).toBe('ollama');
    expect(providers[1].type).toBe('llm');
    expect(providers[1].responseStyle).toBe('openai');
    expect(providers[2].type).toBe('google');
    expect(providers[3].type).toBe('llm');
    expect(providers[3].responseStyle).toBe('ollama');
  });

  it('空存储 → 返回空数组', async () => {
    mockStorage(null);
    const providers = await getProviders();
    expect(providers).toEqual([]);
  });

  it('迁移不修改原始存储数据(on-read,不回写)', async () => {
    const original = [
      { id: 'p11', name: 'ollama-old', type: 'ollama' as string, baseUrl: 'http://localhost:11434/api/chat', model: 'llama3' },
    ];
    mockStorage(original);
    await getProviders();
    // 原始对象 type 不应被修改
    expect(original[0].type).toBe('ollama');
  });
});
