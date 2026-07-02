// LLM 适配层 — 抹平不同提供方请求差异
// content-script 不应直接 fetch 第三方接口，统一由 background 调用本模块。

import type { ProviderConfig, TranslateRequest, TranslateResult } from './types';

function buildPrompt(text: string, targetLang: string, sourceLang?: string): string {
  const source = sourceLang ? `from ${sourceLang} ` : '';
  return `Translate the following text ${source}into ${targetLang}. Output ONLY the translation, without explanation or quotes.\n\n${text}`;
}

/**
 * 调用 OpenAI 兼容接口
 * baseUrl 需为用户填写的完整接口路径（如 https://api.openai.com/v1/chat/completions），
 * 代码不再追加固定 path，仅去除末尾多余斜杠后直接使用。
 */
async function callOpenAICompatible(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = provider.baseUrl.replace(/\/+$/, '');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: buildPrompt(req.text, req.targetLang, req.sourceLang) }],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}` };
  }
  const data = await resp.json();
  const translatedText = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return { translatedText };
}

/**
 * 调用 Ollama 本地接口
 * baseUrl 需为用户填写的完整接口路径（如 http://localhost:11434/api/chat），
 * 代码不再追加固定 path，仅去除末尾多余斜杠后直接使用。
 */
async function callOllama(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = provider.baseUrl.replace(/\/+$/, '');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      messages: [{ role: 'user', content: buildPrompt(req.text, req.targetLang, req.sourceLang) }],
      options: { temperature: 0.3 },
    }),
  });
  if (!resp.ok) {
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}` };
  }
  const data = await resp.json();
  const translatedText = data?.message?.content?.trim() ?? '';
  return { translatedText };
}

export async function translate(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  try {
    if (provider.type === 'ollama') return await callOllama(provider, req);
    return await callOpenAICompatible(provider, req);
  } catch (err) {
    return { translatedText: '', error: err instanceof Error ? err.message : String(err) };
  }
}

/** 连通性测试：发送一条最小翻译请求 */
export async function testProvider(provider: ProviderConfig): Promise<TranslateResult> {
  return translate(provider, { text: 'hello', targetLang: '中文' });
}
