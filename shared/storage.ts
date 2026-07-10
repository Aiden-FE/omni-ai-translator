// 存储模块 — 统一封装 browser.storage.local 访问
// Key 严禁外泄，仅存本地。详见 knowledges/context/development/coding-standard.md

import type { ProviderConfig, Settings } from './types';

const PROVIDERS_KEY = 'llm_translator:providers';
const SETTINGS_KEY = 'llm_translator:settings';

const DEFAULT_SETTINGS: Settings = {
  activeProviderId: null,
  // 空字符串表示使用浏览器首选语言（navigator.language）
  defaultTargetLang: '',
};

async function get<T>(key: string, fallback: T): Promise<T> {
  const result = await browser.storage.local.get(key);
  return (result[key] as T) ?? fallback;
}

async function set<T>(key: string, value: T): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

/**
 * 存量配置 on-read 迁移：将旧 type 子分组(openai-compatible/ollama)收敛为新 type='llm' + responseStyle。
 * - 旧 type='ollama' → type='llm' + responseStyle='ollama'
 * - 旧 type='openai-compatible' → type='llm' + responseStyle 取原值(anthropic 保留,缺省 openai)
 * - type='llm' → 不变(已是新形态)
 * 迁移在读出时即时完成，不回写存储，用户无感知。
 * 注意:旧 type 值('openai-compatible'/'ollama')不在当前 ProviderType 联合中,
 * 但可能存在于存量 browser.storage.local 数据,因此按 string 比较。
 */
function migrateProvider(p: ProviderConfig): ProviderConfig {
  const rawType = p.type as string;
  if (rawType === 'ollama') {
    return { ...p, type: 'llm', responseStyle: 'ollama' };
  }
  if (rawType === 'openai-compatible') {
    return { ...p, type: 'llm', responseStyle: p.responseStyle ?? 'openai' };
  }
  return p;
}

export async function getProviders(): Promise<ProviderConfig[]> {
  const value = await get<ProviderConfig[] | null>(PROVIDERS_KEY, null);
  return Array.isArray(value) ? value.map(migrateProvider) : [];
}

export async function setProviders(providers: ProviderConfig[]): Promise<void> {
  // 强制转为纯数组,避免 Vue reactive proxy 经结构化克隆后变异
  const plain = Array.from(providers);
  await set(PROVIDERS_KEY, plain);
}

export async function getSettings(): Promise<Settings> {
  return get<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export async function setSettings(settings: Settings): Promise<void> {
  await set(SETTINGS_KEY, settings);
}
