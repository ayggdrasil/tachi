import { nanoid } from 'nanoid';
import { pad2 } from '../../shared/constants';

export const uid = (prefix: string): string => `${prefix}-${nanoid(8)}`;
export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Virtual demo clock (minutes). Single source of truth; core.now() and nowIso() both read it.
let clockOffsetMinutes = 0;
export const getClockOffsetMinutes = (): number => clockOffsetMinutes;
export const setClockOffsetMinutes = (m: number): void => { clockOffsetMinutes = Number.isFinite(m) ? m : 0; };
export const clockNow = (): Date => new Date(Date.now() + clockOffsetMinutes * 60000);
export const nowIso = (): string => clockNow().toISOString();
/** Local 'YYYY-MM-DD' */
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const sameDay = (a: Date, b: Date): boolean => ymd(a) === ymd(b);
export function clip(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
export function log(...a: unknown[]): void { console.log('[tachi]', ...a); }
export function warn(...a: unknown[]): void { console.warn('[tachi:warn]', ...a); }
