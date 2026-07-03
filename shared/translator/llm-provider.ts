// LLM Provider — OpenAI 兼容 / Ollama 适配实现（迁移自 shared/llm.ts）
// content-script 不应直接 fetch 第三方接口，统一由 background 调用本模块。
import type { ProviderConfig, TranslateRequest, TranslateResult } from '@/shared/types';
import type { TranslationProvider } from './types';
import { classifyError } from './error';

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
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return { translatedText };
}

/**
 * 调用原生 Anthropic Messages API 端点
 * baseUrl 需为用户填写的完整接口路径（如 https://api.anthropic.com/v1/messages），
 * 代码不追加固定 path，仅去除末尾多余斜杠后直接使用。
 * 鉴权用 x-api-key（非 Bearer）+ anthropic-version 头；翻译指令作顶层 system，原文作 user message。
 */
async function callAnthropic(
  provider: ProviderConfig,
  req: TranslateRequest,
): Promise<TranslateResult> {
  const url = provider.baseUrl.replace(/\/+$/, '');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: 1024,
      system: buildPrompt(req.text, req.targetLang, req.sourceLang),
      messages: [{ role: 'user', content: req.text }],
      temperature: 0.3,
    }),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.content?.[0]?.text?.trim() ?? '';
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
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  const translatedText = data?.message?.content?.trim() ?? '';
  return { translatedText };
}

/**
 * 创建 LLM 翻译源 provider 实例
 * 根据 provider.type 路由：ollama → callOllama；openai-compatible 按 responseStyle 分流
 * （anthropic → callAnthropic 原生 Anthropic Messages API；openai/缺省 → callOpenAICompatible）。
 * 迁移自 shared/llm.ts，行为不变：相同输入产出相同 TranslateResult（新增 errorType 字段）。
 */
export function createLLMProvider(config: ProviderConfig): TranslationProvider {
  return {
    id: config.id,
    type: 'llm' as const,
    async translate(req: TranslateRequest): Promise<TranslateResult> {
      try {
        if (config.type === 'ollama') return await callOllama(config, req);
        if (config.responseStyle === 'anthropic') return await callAnthropic(config, req);
        return await callOpenAICompatible(config, req);
      } catch (err) {
        const errorType = classifyError(err);
        return {
          translatedText: '',
          error: err instanceof Error ? err.message : String(err),
          errorType,
        };
      }
    },
    async test(req?: TranslateRequest): Promise<TranslateResult> {
      return this.translate(req ?? { text: 'hello', targetLang: '中文' });
    },
  };
}
