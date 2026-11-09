// Offline intent classification + availability parsing.
import type { Slot, User } from '../../../shared/types';
import type { FamilyIntent, SeniorIntent, SeniorIntentContext } from '../contract';
import { findPlaces } from '../../data/places';
import { parseBloodPressure } from './health';
import { stemToken, tokens, yesNo } from './ko';


export function seniorIntent(text: string, ctx: SeniorIntentContext): SeniorIntent {
  const t = text.trim();
  if (ctx.pending === 'share_confirm' || ctx.pending === 'trip_confirm') {
    const yn = yesNo(t);
    if (yn) return { type: yn };
  }
  if (ctx.pending === 'itinerary') {
    if (/가족\s*(?:과|이랑|하고|들과|들이랑)\s*(?:함께|같이)|(?:애들|아이들|식구들)(?:이랑|하고|과)\s*(?:함께|같이)|다\s*같이\s*(?:가|모|해)|가족\s*모임|함께\s*가기|같이\s*가기/.test(t) && !/보내|공유/.test(t)) return { type: 'make_gathering' };
    if (/(?:보내|공유)/.test(t) && /(?:가족|애들|아이들|식구)/.test(t) && !/혈압/.test(t)) return { type: 'share_trip' };
    if (/(?:여행|계획|일정).{0,12}(?:보내|공유)/.test(t)) return { type: 'share_trip' };
  }
  if (/보내\s*줘|보내줘|공유|애들한테|아이들한테|가족한테|가족에게|식구들한테/.test(t) && !/혈압/.test(t)) return { type: 'ask_share' };
  const bp = parseBloodPressure(t);
  if (bp) return { type: 'health_log', ...bp, note: t };
  if (/여행|가보고\s*싶|가 보고\s*싶|놀러|나들이|바람\s*쐬/.test(t)) {
    // '가족여행 사진' names a stored memory and asks to see it: recall wins over a trip proposal.
    if (/사진|앨범|기억|추억|보여|그때|옛날/.test(t)) {
      const rk = matchKeywords(t, ctx.knownNodeNames);
      if (rk.length) return { type: 'recall', keywords: rk };
    }
    const pl = findPlaces(t)[0];
    return { type: 'trip', destination: pl?.region };
  }
  const kws = matchKeywords(t, ctx.knownNodeNames);
  if (kws.length) return { type: 'recall', keywords: kws };
  if (/기억|그때|사진\s*보여|옛날|추억/.test(t)) {
    const toks = tokens(t).filter(w => !/^(기억|그때|사진|보여|옛날|추억|나니|나요|하니|혹시)$/.test(w));
    return { type: 'recall', keywords: toks.slice(0, 4) };
  }
  return { type: 'smalltalk' };
}

/** Node names (also partial words of multi-word names, and text tokens contained in names) found in the text. */
export function matchKeywords(text: string, names: string[]): string[] {
  const out: string[] = [];
  const add = (k: string) => { if (!out.includes(k)) out.push(k); };
  const toks = tokens(text);
  for (const n of names) {
    if (!n || n.length < 2) continue;
    if (text.includes(n)) { add(n); continue; }
    for (const part of n.split(/\s+/)) {
      if (part.length >= 2 && text.includes(part)) { add(part); break; }
    }
  }
  for (const t of toks) {
    if (t.length < 2 || out.some(o => o.includes(t) || t.includes(o))) continue;
    if (names.some(n => n.length >= 2 && (n.includes(t) || (t.length > 2 && t.includes(n))))) add(t);
  }
  return out;
}

export function familyIntent(text: string, _asker: User): FamilyIntent {
  const t = text.trim();
  if (/시간\s*(?:좀\s*)?(?:잡|정|맞)|일정\s*(?:좀\s*)?(?:맞|조율|잡|정)|날짜\s*(?:좀\s*)?(?:정|잡)|언제\s*모일|언제\s*(?:만날|볼까)|스케줄/.test(t)) return { type: 'schedule' };
  // A tachi-addressed question is a question for tachi, never a proposal.
  if (/타치/.test(t) && /[?？]/.test(t)) return { type: 'ask_tachi' };
  const noun = /모임|생신|생일|여행|가족|다\s*같이/.test(t);
  const proposal = /가자|모이자|하자|어때요\s*[?？]?|어떨까|뭉치자/.test(t);
  const pastOrQuestion = /지난|어디\s*있|뭐가\s*좋|선물/.test(t);
  if (noun && proposal && !pastOrQuestion) {
    const pl = findPlaces(t)[0];
    return { type: 'gathering', topic: pl ? `${pl.region} 가족 모임` : (/생신/.test(t) ? '어머니 생신 모임' : '가족 모임') };
  }
  if (/타치/.test(t)) return { type: 'ask_tachi' };
  if (/엄마|어머니|어머님|할머니|할머님/.test(t) && /[?？]|까\b|까요|니$|나요|어때|괜찮|혈압|약|건강|잠|기분|식사|밥|요즘|오늘|뭐|언제|어디|몇/.test(t)) return { type: 'ask_tachi' };
  return { type: 'none' };
}

// ── availability ───────────────────────────────────────────────────────────
interface Constraint { dow?: number[]; hour?: number; date?: number; week?: number }

function clauseConstraint(c: string): Constraint | undefined {
  const k: Constraint = {};
  const dows: number[] = [];
  if (/토요일|토요/.test(c) || /(?<![가-힣\d])토(?![가-힣])/.test(c) || /(?<![가-힣\d])토(?=[은는이도에만엔나랑])/.test(c)) dows.push(6);
  if (/일요일|일요/.test(c) || /(?<![가-힣\d])일(?![가-힣])/.test(c) || /(?<![가-힣\d])일(?=[은는이도에만엔나랑](?![가-힣]))/.test(c)) dows.push(0);
  if (/평일/.test(c)) dows.push(1, 2, 3, 4, 5);
  if (/주말/.test(c)) dows.push(6, 0);
  if (dows.length) k.dow = dows;
  const dm = c.match(/(\d{1,2})\s*일(?!요)/);
  if (dm) k.date = +dm[1];
  if (/점심|낮|정오|오전|12\s*시|열두\s*시|한\s*시|1\s*시/.test(c)) k.hour = 12;
  if (/저녁|밤|6\s*시|18\s*시|여섯\s*시|7\s*시|오후\s*6/.test(c)) k.hour = 18;
  if (/이번/.test(c)) k.week = 0;
  if (/다음|담\s*주|다다음|2\s*주\s*(?:후|뒤)/.test(c)) k.week = 1;
  return Object.keys(k).length ? k : undefined;
}

export function availability(text: string, slots: Slot[]): string[] {
  const t = text.trim();
  if (!t) return [];
  const firstWeekEnd = slots.length ? new Date(slots[0].startsAt).getTime() + 3 * 86400000 : 0;
  const matches = (s: Slot, k: Constraint): boolean => {
    const d = new Date(s.startsAt);
    if (k.dow && !k.dow.includes(d.getDay())) return false;
    if (k.hour !== undefined && (k.hour === 12 ? d.getHours() >= 17 : d.getHours() < 17)) return false;
    if (k.date !== undefined && d.getDate() !== k.date) return false;
    if (k.week !== undefined && ((d.getTime() > firstWeekEnd ? 1 : 0) !== k.week)) return false;
    return true;
  };
  const allWords = /다\s*(?:돼|되|괜찮|좋)|아무\s*(?:때|날)나?|언제든|언제나|상관\s*없|전부\s*(?:돼|되|좋)|아무때/;
  const clauses = t.split(/[,.;!?]|\s(?:근데|그런데|하지만|그리고|대신)\s|(?<=요)\s+(?=[가-힣])/).map(s => s.trim()).filter(Boolean);
  const neg = /안\s*돼|안\s*되|못\s*(?:가|와|해|나|갈|올|하)|어려|힘들|불가|빼고|제외|말고|곤란|약속|바빠|바쁘/;
  let positive: Set<string> | undefined;
  const negative = new Set<string>();
  let any = false;
  let hasAllWord = false;
  for (const c of clauses) {
    const isNeg = neg.test(c);
    if (allWords.test(c) && !isNeg) { hasAllWord = true; any = true; continue; }
    const k = clauseConstraint(c);
    if (!k) continue;
    any = true;
    const ids = slots.filter(s => matches(s, k)).map(s => s.id);
    if (isNeg) ids.forEach(i => negative.add(i));
    else { positive ??= new Set(); ids.forEach(i => positive!.add(i)); }
  }
  if (!any) return [];
  const base = positive ? slots.filter(s => positive!.has(s.id)) : (hasAllWord || negative.size ? slots : []);
  return base.filter(s => !negative.has(s.id)).map(s => s.id);
}

export { stemToken };
