// 存储模块 — 统一封装 chrome.storage.local 访问
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
  const result = await chrome.storage.local.get(key);
  return (result[key] as T) ?? fallback;
}

async function set<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function getProviders(): Promise<ProviderConfig[]> {
  const value = await get<ProviderConfig[] | null>(PROVIDERS_KEY, null);
  return Array.isArray(value) ? value : [];
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
