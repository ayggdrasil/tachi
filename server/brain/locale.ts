// Active product language for every prompt, offline template and parser (default from TACHI_LOCALE, else English).
import type { Locale } from '../../shared/types';

let current: Locale = process.env.TACHI_LOCALE === 'ko' ? 'ko' : 'en';
export const getLocale = (): Locale => current;
export const setLocale = (l: Locale): void => { current = l === 'ko' ? 'ko' : 'en'; };
export const isEn = (l: Locale = current): boolean => l === 'en';
/** Pick by locale. */
export const byLocale = <T>(ko: T, en: T, l: Locale = current): T => (l === 'ko' ? ko : en);
/** Korean prose limits are scaled up for English strings. */
export const lim = (n: number): number => (current === 'en' ? Math.ceil(n * 1.9) : n);
