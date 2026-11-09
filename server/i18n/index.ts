// Server-side copy (system messages, fixed Tachi lines, card labels) in the active product language.
// The orchestrator sets the locale at boot / on 'locale:set'; the brain has its own setLocale for prompts & templates.
import type { Locale } from '../../shared/types';
import { DEFAULT_LOCALE } from '../../shared/constants';
import strings from './strings';

let current: Locale = (process.env.TACHI_LOCALE === 'ko' || process.env.TACHI_LOCALE === 'en') ? process.env.TACHI_LOCALE : DEFAULT_LOCALE;

export function setServerLocale(l: Locale): void { current = l; }
export function serverLocale(): Locale { return current; }

export type Vars = Record<string, string | number | undefined>;
/** `st('share.done')` — server translation with `{var}` interpolation; falls back to English, then the key. */
export function st(key: string, vars?: Vars, locale: Locale = current): string {
  const raw = strings[locale][key] ?? strings.en[key] ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : String(vars[k]))) : raw;
}

/** Report topic for a session title: generic English labels become a natural noun phrase; anything else is kept. */
export function reportTopic(title: string, locale: Locale = current): string {
  if (locale !== 'en') return title;
  return strings.en[`report.topic.${title}`] ?? title;
}
