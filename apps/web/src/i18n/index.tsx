import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LocalizedName, RegionModule } from '@pmp/engine';
import { zh, type Dict, type TranslationKey } from './zh.js';
import { en } from './en.js';

export type Lang = 'zh' | 'en';

const DICTS: Record<Lang, Dict> = { zh, en };
const LANG_KEY = 'pmp.lang.v1';

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'zh', label: '中文' },
  { code: 'en', label: 'English' },
];

/**
 * Guess from the browser language on first visit; after that the user's explicit choice wins.
 * 首次访问时按浏览器语言猜一个，之后以用户的显式选择为准
 */
function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'zh' || stored === 'en') return stored;
  } catch {
    /* Unreadable in private mode; fall through to browser detection below. 隐私模式下读不到，走下面的浏览器探测 */
  }
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translate;
  /**
   * Pick the current language's side of a bilingual name supplied by the engine.
   * 取引擎给出的双语名称中当前语言的那一个
   */
  name: (n: LocalizedName) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* Can't persist in private mode; this session only. 隐私模式下存不了，仅本次会话有效 */
    }
  }, [lang]);

  const t = useCallback<Translate>(
    (key, params) => {
      const template = DICTS[lang][key] ?? zh[key] ?? key;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (_, k: string) =>
        params[k] === undefined ? `{${k}}` : String(params[k]),
      );
    },
    [lang],
  );

  const name = useCallback((n: LocalizedName) => (lang === 'zh' ? n.zh : n.en), [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, setLang: setLangState, t, name }), [lang, t, name]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 I18nProvider 内部使用');
  return ctx;
}

/**
 * Tax breakdown layer names vary by country (federal/state vs. comprehensive income); resolve them
 * in one place here.
 *
 * 税额明细的层级名称随国家而变（联邦/州 vs 综合所得），这里集中解析
 */
export function taxLayerKey(code: string, region: RegionModule['code']): TranslationKey {
  switch (code) {
    case 'national':
      return `tax.national.${region}` as TranslationKey;
    case 'regional':
      return `tax.regional.${region}` as TranslationKey;
    case 'local':
      return 'tax.local';
    case 'surtax':
      return 'tax.surtax';
    case 'bonus':
      return 'tax.bonus';
    default:
      return 'tax.credit';
  }
}

export type { TranslationKey, Dict };
