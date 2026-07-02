// 传统翻译 Provider — Google / 微软 免 Key 免费翻译源实现
// 端点为内置常量（builtin-sources.ts），不可由用户编辑。
// 调用非官方公共端点，解析非标准响应结构（嵌套数组 / JSON），失败经 classifyError 归类。
// 语义：用户可选的免费翻译源，不是兜底源；无隐式自动回退。
import type { ProviderConfig, TranslateRequest, TranslateResult } from '@/shared/types';
import type { TranslationProvider } from './types';
import { classifyError } from './error';
import {
  GOOGLE_ENDPOINT,
  MICROSOFT_AUTH_ENDPOINT,
  MICROSOFT_TRANSLATE_ENDPOINT,
} from './builtin-sources';

/**
 * 人类可读语言名 → 语言代码映射（targetLang 在上层为人类可读名如「简体中文」，
 * 传统翻译端点需要语言代码如 zh-CN）。覆盖 options.vue defaultTargetLang 常见值。
 * 未命中时回退 'en'。
 */
const LANG_NAME_TO_CODE: Record<string, string> = {
  简体中文: 'zh-CN',
  繁體中文: 'zh-TW',
  中文: 'zh-CN',
  English: 'en',
  日本語: 'ja',
  한국어: 'ko',
  Français: 'fr',
  Deutsch: 'de',
  Español: 'es',
};

/** 将人类可读语言名解析为语言代码，未知回退 en */
function resolveLangCode(lang: string): string {
  if (!lang) return 'en';
  // 已是代码形式（如 en、zh-CN）直接返回
  if (LANG_NAME_TO_CODE[lang]) return LANG_NAME_TO_CODE[lang];
  if (/^[a-z]{2}(-[A-Za-z]+)?$/.test(lang)) return lang;
  return 'en';
}

/**
 * 调用 Google 翻译免 Key 公共端点
 * GET translate_a/single?client=gtx&sl=<src>&tl=<target>&dt=t&q=<text>
 * 响应为嵌套数组：data[0] 是译文段数组，每段 [0] 为译文，拼接即得完整译文。
 */
async function callGoogle(req: TranslateRequest): Promise<TranslateResult> {
  const sl = req.sourceLang ? resolveLangCode(req.sourceLang) : 'auto';
  const tl = resolveLangCode(req.targetLang);
  const url = `${GOOGLE_ENDPOINT}?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(
    tl,
  )}&dt=t&q=${encodeURIComponent(req.text)}`;

  const resp = await fetch(url, { method: 'GET' });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return { translatedText: '', error: `Google HTTP ${resp.status}: ${await resp.text()}`, errorType };
  }
  const data = await resp.json();
  // data[0] = [["译文","原文",...], ...]，拼接所有段译文
  const segments = Array.isArray(data?.[0]) ? data[0] : [];
  const translatedText = segments
    .map((seg: unknown) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : ''))
    .join('')
    .trim();
  if (!translatedText) {
    return {
      translatedText: '',
      error: 'Google 翻译响应解析失败',
      errorType: 'unreachable',
    };
  }
  return { translatedText };
}

/**
 * 调用微软翻译免 Key 端点
 * 1. GET edge.microsoft.com/translate/auth 获取 JWT token（免 Key）
 * 2. POST api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=<target>
 *    header Authorization: Bearer <token>，body [{"Text": text}]
 * 响应：[{ translations: [{ text, to }] }]
 */
async function callMicrosoft(req: TranslateRequest): Promise<TranslateResult> {
  // 1. 取 token
  const authResp = await fetch(MICROSOFT_AUTH_ENDPOINT, { method: 'GET' });
  if (!authResp.ok) {
    const errorType = classifyError(null, authResp.status);
    return {
      translatedText: '',
      error: `微软翻译鉴权失败 HTTP ${authResp.status}`,
      errorType,
    };
  }
  const token = (await authResp.text()).trim();
  if (!token) {
    return {
      translatedText: '',
      error: '微软翻译鉴权返回空 token',
      errorType: 'unreachable',
    };
  }

  // 2. 调用翻译
  const to = resolveLangCode(req.targetLang);
  const params = new URLSearchParams({ 'api-version': '3.0', to });
  if (req.sourceLang) {
    params.set('from', resolveLangCode(req.sourceLang));
  }
  const url = `${MICROSOFT_TRANSLATE_ENDPOINT}?${params.toString()}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: req.text }]),
  });
  if (!resp.ok) {
    const errorType = classifyError(null, resp.status);
    return {
      translatedText: '',
      error: `微软翻译 HTTP ${resp.status}: ${await resp.text()}`,
      errorType,
    };
  }
  const data = await resp.json();
  const translatedText = data?.[0]?.translations?.[0]?.text?.trim() ?? '';
  if (!translatedText) {
    return {
      translatedText: '',
      error: '微软翻译响应解析失败',
      errorType: 'unreachable',
    };
  }
  return { translatedText };
}

/**
 * 创建传统翻译源 provider 实例
 * 按 config.type 路由到 Google / 微软免 Key 实现。
 * 端点使用内置常量（不读 config.baseUrl，因免费源端点不可编辑）。
 * 失败经 classifyError 归类为 network / rate-limit / unreachable，不自动回退。
 */
export function createTraditionalProvider(config: ProviderConfig): TranslationProvider {
  return {
    id: config.id,
    type: 'traditional' as const,
    async translate(req: TranslateRequest): Promise<TranslateResult> {
      try {
        if (config.type === 'google') return await callGoogle(req);
        if (config.type === 'microsoft') return await callMicrosoft(req);
        // 未知传统源类型
        return {
          translatedText: '',
          error: `未知的传统翻译源类型：${config.type}`,
          errorType: 'unreachable',
        };
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
