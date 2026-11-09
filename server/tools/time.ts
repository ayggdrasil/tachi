// Korean / English / ISO time expressions → Date (local time, relative to the demo clock passed in as `now`).
import { dateLabelL, timeLabelL } from '../../shared/constants';
import { getLocale } from '../brain/locale';

const KO_NUM: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12,
};
const DOW: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
const num = (s: string): number => (/^\d+$/.test(s) ? Number(s) : KO_NUM[s] ?? NaN);
const KO_NUM_RE = '열한|열두|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열';
const EN_DOW: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const EN_MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const EN_NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty-five': 45 };
const EN_NUM_RE = 'an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five';
const numEn = (s: string): number => (/^\d+$/.test(s) ? Number(s) : EN_NUM[s.toLowerCase()] ?? NaN);

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
  const mdEn = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(t);
  if (mdEn) {
    const mon = EN_MON[(mdEn[1] ?? mdEn[4]).slice(0, 3).toLowerCase()];
    const day = Number(mdEn[2] ?? mdEn[3]);
    const d = new Date(today); d.setMonth(mon, day);
    if (d.getTime() < today.getTime()) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  if (/\bday after tomorrow\b/i.test(t)) return addDays(today, 2);
  if (/\btomorrow\b/i.test(t)) return addDays(today, 1);
  if (/\b(?:today|tonight|this (?:morning|afternoon|evening))\b/i.test(t)) return today;
  const dwEn = /\b(next\s+|this\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*day\b/i.exec(t);
  if (dwEn) {
    const target = EN_DOW[dwEn[2].toLowerCase()];
    let diff = (target - today.getDay() + 7) % 7;
    if (dwEn[1] && /next/i.test(dwEn[1])) { const toNextMon = ((8 - today.getDay()) % 7) || 7; diff = toNextMon + ((target + 6) % 7); }
    return addDays(today, diff);
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
  // English: '8am', '8:30 pm', '3 p.m.', 'noon', 'midnight'
  const ampm = /(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\b\.?/i.exec(text);
  if (ampm && Number(ampm[1]) >= 1 && Number(ampm[1]) <= 12) {
    let h = Number(ampm[1]) % 12;
    if (/p/i.test(ampm[3])) h += 12;
    return { h, m: ampm[2] ? Math.min(59, Number(ampm[2])) : 0, explicitPeriod: true };
  }
  if (/\bnoon\b|\bmidday\b/i.test(text)) return { h: 12, m: 0, explicitPeriod: true };
  if (/\bmidnight\b/i.test(text)) return { h: 24, m: 0, explicitPeriod: true };
  const hm = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/.exec(text);
  if (hm && Number(hm[1]) < 24 && Number(hm[2]) < 60) {
    let h = Number(hm[1]);
    if (/\b(?:evening|tonight|night|afternoon)\b/i.test(text) && h < 12) h += 12;
    return { h, m: Number(hm[2]), explicitPeriod: true };
  }
  const atEn = /\bat\s+(\d{1,2})(?:\s*o'?clock)?\b(?!\s*(?:min|hour|%|:))/i.exec(text);
  if (atEn && Number(atEn[1]) >= 1 && Number(atEn[1]) <= 12) {
    let h = Number(atEn[1]);
    const pm = /\b(?:evening|tonight|night|afternoon)\b/i.test(text), am = /\bmorning\b/i.test(text);
    if (pm && h < 12) h += 12;
    return { h, m: 0, explicitPeriod: pm || am };
  }
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
  if (/\bmorning\b/i.test(text)) return { h: 8, m: 0, explicitPeriod: true };
  if (/\bafternoon\b/i.test(text)) return { h: 15, m: 0, explicitPeriod: true };
  if (/\bevening\b/i.test(text)) return { h: 18, m: 0, explicitPeriod: true };
  if (/\btonight\b|\bat night\b/i.test(text)) return { h: 21, m: 0, explicitPeriod: true };
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
  const relEn = new RegExp(`\\bin\\s+(\\d+|${EN_NUM_RE})\\s*(min(?:ute)?s?|hours?|hrs?)\\b|\\b(\\d+|${EN_NUM_RE})\\s*(min(?:ute)?s?|hours?|hrs?)\\s+from now\\b|\\bin half an hour\\b`, 'i').exec(t);
  if (relEn) {
    if (/half an hour/i.test(relEn[0])) return new Date(now.getTime() + 30 * 60000);
    const n = numEn(relEn[1] ?? relEn[3]);
    const unit = (relEn[2] ?? relEn[4]).toLowerCase();
    if (Number.isFinite(n)) return new Date(now.getTime() + n * (unit.startsWith('h') ? 3600000 : 60000));
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

/** '11월 10일(화) 오전 8:00' / 'Tue, Nov 10 8:00 AM' (active product language) */
export function whenLabel(d: Date): string {
  const l = getLocale();
  return `${dateLabelL(d, l)} ${timeLabelL(d, l)}`;
}
