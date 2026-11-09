// Korean / ISO time expressions → Date (local time, relative to the demo clock passed in as `now`).
import { dateLabel, pad2 } from '../../shared/constants';

const KO_NUM: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12,
};
const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const num = (s: string): number => (/^\d+$/.test(s) ? Number(s) : KO_NUM[s] ?? NaN);
const KO_NUM_RE = '열한|열두|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열';

const startOfDay = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number): Date => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Day offset named in the text (오늘/내일/모레/글피, N요일, M월 D일, 다음 주 X요일), or undefined. */
export function parseDay(text: string, now: Date): Date | undefined {
  const t = text;
  const today = startOfDay(now);
  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(t);
  if (md) {
    const d = new Date(today); d.setMonth(Number(md[1]) - 1, Number(md[2]));
    if (d.getTime() < today.getTime()) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  if (/글피/.test(t)) return addDays(today, 3);
  if (/모레/.test(t)) return addDays(today, 2);
  if (/내일/.test(t)) return addDays(today, 1);
  if (/오늘/.test(t)) return today;
  const dw = /(다음\s*주|담주|이번\s*주)?\s*([일월화수목금토])요일/.exec(t);
  if (dw) {
    const target = DOW[dw[2]];
    let diff = (target - today.getDay() + 7) % 7;
    if (dw[1] && /다음|담/.test(dw[1])) {
      // next week's weekday: the occurrence in the Mon–Sun week after this one
      const toNextMon = ((8 - today.getDay()) % 7) || 7;
      diff = toNextMon + ((target + 6) % 7);
    }
    return addDays(today, diff);
  }
  return undefined;
}

/** Hour/minute named in the text ('오후 3시 반', '8시 30분', '14:00', '저녁'), or undefined. `explicitPeriod` tells whether 오전/오후-like words were used. */
export function parseClock(text: string): { h: number; m: number; explicitPeriod: boolean } | undefined {
  const hm = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/.exec(text);
  if (hm && Number(hm[1]) < 24 && Number(hm[2]) < 60) return { h: Number(hm[1]), m: Number(hm[2]), explicitPeriod: true };
  const re = new RegExp(`(오전|오후|아침|점심|낮|저녁|밤|새벽)?\\s*(\\d{1,2}|${KO_NUM_RE})\\s*시(?!간)\\s*(반|(\\d{1,2})\\s*분)?`);
  const m = re.exec(text);
  if (m) {
    let h = num(m[2]);
    if (!Number.isFinite(h) || h > 24) return undefined;
    const min = m[3] === '반' ? 30 : m[4] ? Math.min(59, Number(m[4])) : 0;
    const p = m[1];
    if (p && /오후|저녁|밤/.test(p) && h < 12) h += 12;
    if (p && /점심|낮/.test(p) && h < 6) h += 12;
    if (p && /오전|아침|새벽|밤/.test(p) && h === 12) h = 24; // midnight: rolls to the next day below
    return { h, m: min, explicitPeriod: !!p || h >= 13 };
  }
  if (/아침/.test(text)) return { h: 8, m: 0, explicitPeriod: true };
  if (/점심/.test(text)) return { h: 12, m: 0, explicitPeriod: true };
  if (/저녁/.test(text)) return { h: 18, m: 0, explicitPeriod: true };
  if (/밤/.test(text)) return { h: 21, m: 0, explicitPeriod: true };
  return undefined;
}

/**
 * A point in time from ISO ('2026-11-10T08:00', '2026-11-10 08:00', with or without offset) or Korean
 * ('내일 아침 8시', '오후 3시 반', '30분 뒤', '두 시간 후', '금요일 10시'). Undefined when no time is named.
 * A bare hour that already passed today means later today (pm) or tomorrow.
 */
export function parseWhen(text: string, now: Date): Date | undefined {
  const t = String(text ?? '').trim();
  if (!t) return undefined;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(t);
  if (iso) {
    if (iso[6]) { const d = new Date(t); return Number.isNaN(d.getTime()) ? undefined : d; }
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 9), Number(iso[5] ?? 0), 0, 0);
  }
  const rel = new RegExp(`(\\d+|${KO_NUM_RE})\\s*(분|시간)\\s*(?:뒤|후|있다가)`).exec(t);
  if (rel) {
    const n = num(rel[1]);
    if (Number.isFinite(n)) return new Date(now.getTime() + n * (rel[2] === '분' ? 60000 : 3600000));
  }
  const day = parseDay(t, now);
  const clock = parseClock(t);
  if (!clock) return undefined;
  const base = day ?? startOfDay(now);
  const d = new Date(base); d.setHours(clock.h, clock.m, 0, 0);
  if (!day && d.getTime() <= now.getTime()) {
    if (!clock.explicitPeriod && clock.h < 12) {
      const pm = new Date(d); pm.setHours(clock.h + 12);
      if (pm.getTime() > now.getTime()) return pm;
      // nobody means 2 a.m. by a bare '2시': tomorrow afternoon for 1–6, tomorrow morning otherwise
      if (clock.h >= 1 && clock.h <= 6) return addDays(pm, 1);
    }
    return addDays(d, 1);
  }
  return d;
}

/** '11월 10일(화) 오전 8:00' */
export function whenLabel(d: Date): string {
  const h = d.getHours();
  return `${dateLabel(d)} ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad2(d.getMinutes())}`;
}
