// Korean parsing utilities for the offline demo brain.
import { FAMILY_ALIASES } from '../../../shared/constants';
import type { MemoryPerson } from '../../../shared/types';
import { resolvePlace } from '../../data/places';

// ── tiny helpers ───────────────────────────────────────────────────────────
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function pick<T>(seed: string, arr: T[]): T { return arr[hash(seed) % arr.length]; }

const isHangul = (c: string | undefined) => !!c && /[가-힣]/.test(c);
export function hasBatchim(s: string): boolean {
  const c = s.trim().slice(-1).charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}
/** '지은' → '지은이' (name + 이 for batchim-less given names, used as casual call form) */
export function callName(full: string): string {
  const given = full.length >= 3 ? full.slice(1) : full;
  return hasBatchim(given) ? `${given}이` : given;   // 지은(no batchim) → 지은 ; 민준(ㄴ) → 민준이
}
export function withJosa(word: string, withBatchim: string, without: string): string {
  return `${word}${hasBatchim(word) ? withBatchim : without}`;
}

// ── numbers ────────────────────────────────────────────────────────────────
const KN: Record<string, number> = { 영: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
export function parseKoreanNumber(s: string): number | undefined {
  if (!s || !/^[영일이삼사오육칠팔구십백천]+$/.test(s)) return undefined;
  let total = 0, cur = 0;
  for (const ch of s) {
    if (ch in KN) { cur = KN[ch]; }
    else {
      const unit = ch === '십' ? 10 : ch === '백' ? 100 : 1000;
      total += (cur || 1) * unit; cur = 0;
    }
  }
  return total + cur;
}

export const decadeEra = (year: number) => `${Math.floor(year / 10) * 10}년대`;

export interface WhenInfo { year?: number; era?: string }
export function parseWhen(text: string): WhenInfo {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/(?<!\d)(1[89]\d{2}|20[0-2]\d)\s*년(?!\s*대)/))) { const y = +m[1]; return { year: y, era: decadeEra(y) }; }
  if ((m = text.match(/(?<!\d)(1[89]\d{2}|20[0-2]\d)\s*년대/))) { return { era: decadeEra(+m[1]) }; }
  if ((m = text.match(/(?<!\d)(\d{2})\s*년\s*대/))) { const n = +m[1]; const y = n >= 30 ? 1900 + n : 2000 + n; return { era: decadeEra(y) }; }
  if ((m = text.match(/(?<!\d)(\d{2})\s*년(?!\s*(?:전|동안|간|만|째|쯤\s*전))/))) { const n = +m[1]; const y = n >= 30 ? 1900 + n : 2000 + n; return { year: y, era: decadeEra(y) }; }
  // Korean numerals
  if ((m = text.match(/([영일이삼사오육칠팔구십백천]+)\s*년\s*대/))) {
    const n = parseKoreanNumber(m[1]);
    if (n !== undefined) { const y = n >= 1000 ? n : n >= 30 ? 1900 + n : 2000 + n; return { era: decadeEra(y) }; }
  }
  if ((m = text.match(/([영일이삼사오육칠팔구십백천]{2,})\s*년(?!\s*(?:전|동안|간|만|째))/))) {
    const n = parseKoreanNumber(m[1]);
    if (n !== undefined) {
      if (n >= 1900 && n <= 2030) return { year: n, era: decadeEra(n) };
      if (n >= 30 && n <= 99) { const y = 1900 + n; return { year: y, era: decadeEra(y) }; }
    }
  }
  // '70년대쯤' handled above (\d{2}년대); also bare '70대'? skip
  return {};
}

export function parseSeason(text: string): string | undefined {
  if (/봄|벚꽃|개나리|진달래/.test(text)) return '봄';
  if (/여름|피서|해수욕|장마|수박|튜브/.test(text)) return '여름';
  if (/가을|단풍|추석|코스모스/.test(text)) return '가을';
  if (/겨울|함박눈|눈이 (?:오|내|왔)|눈사람|눈썰매|스키|김장/.test(text)) return '겨울';
  return undefined;
}

// ── people ─────────────────────────────────────────────────────────────────
const TRAIL_OK = /^(?:이|가|은|는|을|를|랑|이랑|하고|와|과|도|의|한테|에게|께|께서|씨|분|아|야|만|들|네|나|이나|이도|이가|이는|이를|이와|이고|이며|,|\.|\s|$)/;
const GENERIC_RELATIONS: { re: RegExp; name: string; relation: string }[] = [
  { re: /친구들?|동무/, name: '친구들', relation: '친구' },
  { re: /동창들?/, name: '동창들', relation: '친구' },
  { re: /시어머니|시어머님/, name: '시어머니', relation: '시어머니' },
  { re: /시아버지|시아버님/, name: '시아버지', relation: '시아버지' },
  { re: /친정어머니|친정엄마/, name: '친정어머니', relation: '어머니' },
  { re: /(?<![가-힣])(?:어머니|엄마)(?![가-힣]*께서 말)/, name: '어머니', relation: '어머니' },
  { re: /(?<![가-힣])(?:아버지|아빠)/, name: '아버지', relation: '아버지' },
  { re: /이모/, name: '이모', relation: '이모' },
  { re: /고모/, name: '고모', relation: '고모' },
  { re: /언니/, name: '언니', relation: '언니' },
  { re: /오빠/, name: '오빠', relation: '오빠' },
  { re: /(?<![가-힣])동생/, name: '동생', relation: '동생' },
  { re: /형님/, name: '형님', relation: '형님' },
  { re: /사돈/, name: '사돈', relation: '사돈' },
  { re: /이웃/, name: '이웃', relation: '이웃' },
  { re: /선생님/, name: '선생님', relation: '선생님' },
  { re: /사위/, name: '정상호', relation: '사위' },
  { re: /아이들|애들|자식들/, name: '아이들', relation: '자녀' },
];

export function parsePeople(text: string): MemoryPerson[] {
  const out: MemoryPerson[] = [];
  const taken: [number, number][] = [];
  const keys = Object.keys(FAMILY_ALIASES).sort((a, b) => b.length - a.length);
  const found: { start: number; person: MemoryPerson }[] = [];
  // full names first
  const fullNames = new Map<string, MemoryPerson>();
  for (const v of Object.values(FAMILY_ALIASES)) fullNames.set(v.name, { name: v.name, relation: v.relation });
  for (const [n, p] of fullNames) { const i = text.indexOf(n); if (i >= 0) { taken.push([i, i + n.length]); found.push({ start: i, person: p }); } }
  for (const k of keys) {
    let from = 0;
    while (true) {
      const i = text.indexOf(k, from);
      if (i < 0) break;
      from = i + k.length;
      if (taken.some(([s, e]) => i < e && i + k.length > s)) continue;
      if (!TRAIL_OK.test(text.slice(i + k.length))) continue;
      taken.push([i, i + k.length]);
      const v = FAMILY_ALIASES[k];
      found.push({ start: i, person: { name: v.name, relation: v.relation } });
    }
  }
  // generic
  for (const g of GENERIC_RELATIONS) {
    const m = g.re.exec(text);
    if (!m) continue;
    const i = m.index;
    if (taken.some(([s, e]) => i < e && i + m[0].length > s)) continue;
    taken.push([i, i + m[0].length]);
    found.push({ start: i, person: { name: g.name, relation: g.relation } });
  }
  found.sort((a, b) => a.start - b.start);
  for (const f of found) if (!out.some(o => o.name === f.person.name)) out.push(f.person);
  return out;
}

// ── events / emotions / topics ─────────────────────────────────────────────
const EVENTS: [RegExp, string][] = [
  [/수학여행/, '수학여행'], [/신혼여행/, '신혼여행'], [/가족\s*여행/, '가족여행'], [/결혼식|혼례|결혼/, '결혼식'],
  [/환갑|회갑/, '환갑'], [/칠순|고희/, '칠순'], [/돌잔치|돌잡이/, '돌잔치'], [/졸업식|졸업/, '졸업식'], [/입학식|입학/, '입학식'],
  [/소풍/, '소풍'], [/피서|해수욕/, '피서'], [/설날|추석|명절/, '명절'], [/생일|생신/, '생일'], [/여행/, '여행'], [/나들이/, '나들이'],
];
export function parseEvent(text: string): string | undefined {
  for (const [re, name] of EVENTS) if (re.test(text)) return name;
  return undefined;
}

const EMOTIONS: [RegExp, string][] = [
  [/웃었|웃음|웃고|즐거|재미|신나|신났|깔깔/, '즐거움'],
  [/행복|기뻤|기쁘|좋았|좋은 시절/, '행복'],
  [/그립|보고 싶|보고싶|생각나|그때가|옛날|아련|추억/, '그리움'],
  [/설레|두근|떨렸/, '설렘'],
  [/뿌듯|자랑스|대견/, '뿌듯함'],
  [/아쉽|아깝|못 가|못했|서운/, '아쉬움'],
  [/고마|감사|덕분/, '감사'],
  [/평온|편안|한가|고요|평화|예뻤|예쁘|아름|푸근|포근/, '평온'],
];
export const EMOTION_LABELS = ['행복', '그리움', '즐거움', '설렘', '뿌듯함', '아쉬움', '감사', '평온'];
export function parseEmotions(text: string, year?: number, nowYear = 2026): string[] {
  const out: string[] = [];
  for (const [re, name] of EMOTIONS) if (re.test(text) && !out.includes(name)) out.push(name);
  if (!out.includes('그리움') && ((year && nowYear - year >= 20) || /그때|옛날/.test(text))) out.push('그리움');
  if (!out.length) out.push('그리움');
  return out.slice(0, 3);
}

export const TOPICS = ['다보탑', '석가탑', '벚꽃', '바다', '기차', '도시락', '한복', '교복', '자전거', '사진기', '수박', '튜브', '단풍', '눈사람',
  '김밥', '삶은 계란', '사이다', '라디오', '카메라', '버스', '배', '모래', '조개', '해물탕', '막걸리', '온천', '케이블카', '절', '탑', '연꽃',
  '찹쌀떡', '송편', '떡국', '김치', '된장찌개', '꽃신', '양산', '모자', '운동회', '합창', '노래', '춤', '기타', '피아노'];
export function parseTopics(text: string): string[] {
  const out: string[] = [];
  for (const t of TOPICS) {
    if (t === '배' || t === '절' || t === '탑' || t === '모자') { if (new RegExp(`(?<![가-힣])${t}(?![가-힣])`).test(text) || new RegExp(`(?<![가-힣])${t}[을를이가은는]`).test(text)) out.push(t); continue; }
    if (text.includes(t) && !out.includes(t)) out.push(t);
  }
  // drop generic if specific present
  return out.filter(t => !(t === '탑' && out.some(o => o.endsWith('탑') && o !== '탑')));
}

// ── yes / no ───────────────────────────────────────────────────────────────
const YES_RE = /^(?:응|어|그래|그려|그럼|그렇게|좋아|좋지|좋네|좋아요|네|예|넵|맞아|맞다|오냐|부탁|해줘|해 줘|보내줘|보내 줘|보내|공유해|알겠|가자|그러자|그러지)/;
const NO_RE = /^(?:아니|아냐|싫어|싫다|나중에|됐어|됐다|괜찮아|괜찮다|안 할|안할|하지 마|말아|그만|다음에|아직)/;
export function yesNo(text: string): 'yes' | 'no' | undefined {
  const t = text.trim().replace(/^[\s.,!~…]+/, '');
  if (NO_RE.test(t)) return 'no';
  if (YES_RE.test(t)) return 'yes';
  if (/^(?:보내|공유).{0,6}(?:줘|해|주세요)/.test(t)) return 'yes';
  return undefined;
}

// ── tokens ─────────────────────────────────────────────────────────────────
const PARTICLES = ['이랑', '하고', '에서', '으로', '에게', '한테', '이나', '이', '가', '은', '는', '을', '를', '에', '랑', '의', '도', '로', '과', '와', '만', '요', '야', '아'];
export function stemToken(t: string): string {
  const s = t.replace(/[^\p{L}\p{N}]/gu, '');
  for (const p of PARTICLES) if (s.length > p.length + 1 && s.endsWith(p)) return s.slice(0, -p.length);
  return s;
}
export function tokens(text: string): string[] {
  return text.split(/[\s,.!?~…]+/).map(stemToken).filter(t => t.length >= 2);
}

export { resolvePlace };

// ── whole-answer analysis ──────────────────────────────────────────────────
export interface Analysis {
  year?: number; era?: string; season?: string;
  place?: string; placeId?: string;
  people: MemoryPerson[]; event?: string; emotions: string[]; topics: string[];
}
export function analyze(text: string): Analysis {
  const w = parseWhen(text);
  const pl = resolvePlace(text);
  // don't treat '아이들'-generic as person when explicit kids present
  let people = parsePeople(text);
  if (people.some(p => p.name !== '아이들' && (p.relation === '딸' || p.relation === '아들'))) people = people.filter(p => p.name !== '아이들');
  return {
    ...w,
    season: parseSeason(text),
    place: pl?.display, placeId: pl?.place.id,
    people, event: parseEvent(text),
    emotions: parseEmotions(text, w.year),
    topics: parseTopics(text),
  };
}
