// 共享目标语言目录（#78）
// 静态目录：语言代码 / 中文名 / 原文名；供文本翻译与设置复用，内容不随当前翻译源变化。
// 语言值统一使用稳定的 BCP 47 代码（父工单 #76 决定）；传统翻译端点接受该形式
// （shared/translator/traditional-provider.ts:resolveLangCode 已支持代码直通）。
export interface LanguageEntry {
  /** 稳定的 BCP 47 语言代码（如 zh-CN、en） */
  code: string;
  /** 中文名 */
  zhName: string;
  /** 原文名（该语言自称写法） */
  nativeName: string;
}

/**
 * 首版目标语言目录：约 50 种主流语言及必要地区变体。
 * 静态常量，与翻译源、用户配置、浏览器语言均无关。
 */
export const LANGUAGE_CATALOG: readonly LanguageEntry[] = [
  { code: 'zh-CN', zhName: '简体中文', nativeName: '简体中文' },
  { code: 'zh-TW', zhName: '繁體中文', nativeName: '繁體中文' },
  { code: 'en', zhName: '英语', nativeName: 'English' },
  { code: 'ja', zhName: '日语', nativeName: '日本語' },
  { code: 'ko', zhName: '韩语', nativeName: '한국어' },
  { code: 'fr', zhName: '法语', nativeName: 'Français' },
  { code: 'de', zhName: '德语', nativeName: 'Deutsch' },
  { code: 'es', zhName: '西班牙语', nativeName: 'Español' },
  { code: 'pt', zhName: '葡萄牙语', nativeName: 'Português' },
  { code: 'ru', zhName: '俄语', nativeName: 'Русский' },
  { code: 'it', zhName: '意大利语', nativeName: 'Italiano' },
  { code: 'nl', zhName: '荷兰语', nativeName: 'Nederlands' },
  { code: 'pl', zhName: '波兰语', nativeName: 'Polski' },
  { code: 'uk', zhName: '乌克兰语', nativeName: 'Українська' },
  { code: 'cs', zhName: '捷克语', nativeName: 'Čeština' },
  { code: 'sk', zhName: '斯洛伐克语', nativeName: 'Slovenčina' },
  { code: 'sl', zhName: '斯洛文尼亚语', nativeName: 'Slovenščina' },
  { code: 'sv', zhName: '瑞典语', nativeName: 'Svenska' },
  { code: 'da', zhName: '丹麦语', nativeName: 'Dansk' },
  { code: 'no', zhName: '挪威语', nativeName: 'Norsk' },
  { code: 'fi', zhName: '芬兰语', nativeName: 'Suomi' },
  { code: 'el', zhName: '希腊语', nativeName: 'Ελληνικά' },
  { code: 'ro', zhName: '罗马尼亚语', nativeName: 'Română' },
  { code: 'hu', zhName: '匈牙利语', nativeName: 'Magyar' },
  { code: 'bg', zhName: '保加利亚语', nativeName: 'Български' },
  { code: 'hr', zhName: '克罗地亚语', nativeName: 'Hrvatski' },
  { code: 'sr', zhName: '塞尔维亚语', nativeName: 'Српски' },
  { code: 'lt', zhName: '立陶宛语', nativeName: 'Lietuvių' },
  { code: 'lv', zhName: '拉脱维亚语', nativeName: 'Latviešu' },
  { code: 'et', zhName: '爱沙尼亚语', nativeName: 'Eesti' },
  { code: 'tr', zhName: '土耳其语', nativeName: 'Türkçe' },
  { code: 'ar', zhName: '阿拉伯语', nativeName: 'العربية' },
  { code: 'he', zhName: '希伯来语', nativeName: 'עברית' },
  { code: 'fa', zhName: '波斯语', nativeName: 'فارسی' },
  { code: 'ur', zhName: '乌尔都语', nativeName: 'اردو' },
  { code: 'hi', zhName: '印地语', nativeName: 'हिन्दी' },
  { code: 'bn', zhName: '孟加拉语', nativeName: 'বাংলা' },
  { code: 'th', zhName: '泰语', nativeName: 'ไทย' },
  { code: 'vi', zhName: '越南语', nativeName: 'Tiếng Việt' },
  { code: 'id', zhName: '印尼语', nativeName: 'Bahasa Indonesia' },
  { code: 'ms', zhName: '马来语', nativeName: 'Bahasa Melayu' },
  { code: 'tl', zhName: '菲律宾语', nativeName: 'Filipino' },
  { code: 'sw', zhName: '斯瓦希里语', nativeName: 'Kiswahili' },
  { code: 'af', zhName: '南非荷兰语', nativeName: 'Afrikaans' },
  { code: 'sq', zhName: '阿尔巴尼亚语', nativeName: 'Shqip' },
  { code: 'hy', zhName: '亚美尼亚语', nativeName: 'Հայերեն' },
  { code: 'ka', zhName: '格鲁吉亚语', nativeName: 'ქართული' },
  { code: 'az', zhName: '阿塞拜疆语', nativeName: 'Azərbaycan dili' },
  { code: 'kk', zhName: '哈萨克语', nativeName: 'Қазақ тілі' },
  { code: 'mn', zhName: '蒙古语', nativeName: 'Монгол хэл' },
  { code: 'ne', zhName: '尼泊尔语', nativeName: 'नेपाली' },
  { code: 'ta', zhName: '泰米尔语', nativeName: 'தமிழ்' },
  { code: 'te', zhName: '泰卢固语', nativeName: 'తెలుగు' },
  { code: 'km', zhName: '高棉语', nativeName: 'ខ្មែរ' },
  { code: 'lo', zhName: '老挝语', nativeName: 'ລາວ' },
];

const CODE_INDEX = new Map<string, LanguageEntry>(
  LANGUAGE_CATALOG.map((entry) => [entry.code.toLowerCase(), entry]),
);

/** 按语言代码查找目录条目（大小写不敏感）；未收录返回 undefined */
export function findLanguageByCode(code: string): LanguageEntry | undefined {
  return CODE_INDEX.get(code.trim().toLowerCase());
}

/**
 * 按查询过滤目录：命中代码、中文名或原文名（大小写不敏感）即保留。
 * 空查询（含纯空白）返回完整目录；无匹配返回空数组。
 */
export function filterLanguages(query: string): LanguageEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...LANGUAGE_CATALOG];
  return LANGUAGE_CATALOG.filter(
    (entry) =>
      entry.code.toLowerCase().includes(q)
      || entry.zhName.toLowerCase().includes(q)
      || entry.nativeName.toLowerCase().includes(q),
  );
}

/**
 * 文本翻译会话初始目标语言解析（#78）：
 * 1. 设置中的默认目标语言命中目录代码 → 使用该条目；
 * 2. 否则跟随浏览器首选语言：完整代码 → 主语言子标签 → 目录未收录回退 English。
 * 临时选择不经过此函数；重新打开 popup 时重新从默认目标语言初始化。
 */
export function resolveInitialTargetLang(
  defaultTargetLang: string,
  browserLanguage: string,
): LanguageEntry {
  const configured = findLanguageByCode(defaultTargetLang);
  if (configured) return configured;

  const lang = browserLanguage.trim().toLowerCase();
  if (lang) {
    const exact = CODE_INDEX.get(lang);
    if (exact) return exact;
    const primary = CODE_INDEX.get(lang.split('-')[0]);
    if (primary) return primary;
  }
  return CODE_INDEX.get('en')!;
}
