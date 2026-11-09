// Product language (en default, ko optional): stored in kv, mirrored into the i18n module and the brain.
import { DEFAULT_LOCALE, buildCandidateSlots, dateLabelL, dayHeaderLabel, pad2, timeLabelL } from '../../shared/constants';
import type { Locale, Slot } from '../../shared/types';
import { serverLocale, setServerLocale } from '../i18n';
import { ctx } from './ctx';

export const isLocale = (x: unknown): x is Locale => x === 'en' || x === 'ko';
export const getLocale = (): Locale => serverLocale();
export const isKo = (): boolean => serverLocale() === 'ko';

/** Which locale to boot with: explicit option > stored (kv, or inferred from seeded data) > TACHI_LOCALE > default 'en'. */
export function resolveBootLocale(explicit?: Locale): { locale: Locale; reseed: boolean } {
  let stored: Locale | undefined = ctx.db.kv.get<Locale>('locale');
  if (!isLocale(stored)) {
    const mom = ctx.db.users.get('mom');
    stored = mom ? (/[가-힣]/.test(mom.name) ? 'ko' : 'en') : undefined;
  }
  const env = isLocale(process.env.TACHI_LOCALE) ? (process.env.TACHI_LOCALE as Locale) : undefined;
  const locale = explicit ?? stored ?? env ?? DEFAULT_LOCALE;
  return { locale, reseed: !!stored && locale !== stored };
}

/** Apply a locale everywhere it is mirrored (server copy, brain prompts/templates, kv). */
export function applyLocale(l: Locale): void {
  setServerLocale(l);
  try { ctx.brain?.setLocale(l); } catch { /* brain without locale support */ }
  try { ctx.db?.kv.set('locale', l); } catch { /* db closed */ }
}

/** '11월 22일(일)' / 'Sun, Nov 22' */
export const dateL = (d: Date): string => dateLabelL(d, serverLocale());
/** '11월 9일 (월)' / 'Mon, Nov 9' */
export const dayL = (d: Date): string => (serverLocale() === 'ko' ? dayHeaderLabel(d) : dateLabelL(d, 'en'));
export const timeL = (d: Date): string => timeLabelL(d, serverLocale());

/** Candidate poll slots with labels in the active language (same slots/ids/order as buildCandidateSlots). */
export function candidateSlots(now: Date): Slot[] {
  return buildCandidateSlots(now).map(s => {
    const d = new Date(s.startsAt);
    return { ...s, label: `${dateL(d)} ${pad2(d.getHours())}:00` };
  });
}
