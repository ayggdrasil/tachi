// Tiny i18n: English is the default product language; Korean is available.
// The active locale comes from the server (Bootstrap.locale / DemoState.locale) so the agent's replies,
// seed data and UI always agree. Dictionaries live in web/src/i18n/*.ts (one module per owner area).
import type { Locale } from '../../../shared/types';
import { useTachi, getState } from './store';
import kit from '../i18n/kit';
import app from '../i18n/app';

type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = {
  en: { ...kit.en, ...app.en },
  ko: { ...kit.ko, ...app.ko },
};

export type Vars = Record<string, string | number | undefined>;

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = DICTS[locale][key] ?? DICTS.en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k]))) : raw;
}

/** Current locale (re-renders on change). Before bootstrap, falls back to ?lang= or the browser language. */
export function useLocale(): Locale {
  return useTachi(s => s.locale);
}

/** `const t = useT(); t('composer.placeholder')` — re-renders when the locale changes. */
export function useT(): (key: string, vars?: Vars) => string {
  const locale = useLocale();
  return (key, vars) => translate(locale, key, vars);
}

/** Non-hook access (event handlers, utilities). */
export function t(key: string, vars?: Vars): string {
  return translate(getState().locale, key, vars);
}
