// English offline intent classification + availability parsing (mirror of intents.ts).
import type { Slot, User } from '../../../shared/types';
import type { FamilyIntent, SeniorIntent, SeniorIntentContext } from '../contract';
import { findPlaces, placeRegion } from '../../data/places';
import { parseBloodPressureEn } from './health';
import { STOPWORDS_EN, stemEn, tokensEn, yesNoEn } from './en';

const PHOTO_WORDS = /\b(?:photos?|pictures?|pics?|album|remember|memor(?:y|ies)|show|back then|old days|those days)\b/i;

export function seniorIntentEn(text: string, ctx: SeniorIntentContext): SeniorIntent {
  const t = text.trim();
  if (ctx.pending === 'share_confirm' || ctx.pending === 'trip_confirm') {
    const yn = yesNoEn(t);
    if (yn) return { type: yn };
  }
  if (ctx.pending === 'itinerary') {
    const sendWord = /\b(?:send|share|forward|tell)\b/i.test(t);
    if (/\b(?:go|come|travel|trip)\b[^.?!]{0,16}\b(?:with|together with)\b[^.?!]{0,12}\b(?:family|kids|children|everyone|everybody)\b|\ball (?:go )?together\b|\bfamily (?:trip|gathering|get-?together|reunion|outing)\b|\blet'?s all go\b|\bgo together\b|\bmake (?:it )?(?:a )?(?:family )?(?:gathering|plan|get-?together)\b|\binvite (?:the )?(?:family|kids)\b|\bwith (?:the )?(?:family|kids|children)\b/i.test(t) && !sendWord) return { type: 'make_gathering' };
    if (sendWord && /\b(?:family|kids|children|everyone)\b/i.test(t) && !/blood\s*pressure/i.test(t)) return { type: 'share_trip' };
    if (/\b(?:trip|plan|itinerary|schedule)\b[^.?!]{0,24}\b(?:send|share|forward)\b|\b(?:send|share|forward)\b[^.?!]{0,24}\b(?:trip|plan|itinerary)\b/i.test(t)) return { type: 'share_trip' };
  }
  if (/\b(?:send|share|forward|show)\b[^.?!]{0,16}\b(?:it|that|this|them|these)\b[^.?!]{0,12}\b(?:to|with)\b|\b(?:send|share|forward) (?:it|that|this|them)\b|\b(?:send|share|forward)\b[^.?!]{0,28}\b(?:kids|family|children|everyone)\b|\btell (?:the )?(?:kids|family|children)\b|\bshow (?:the )?(?:kids|family|children)\b/i.test(t) && !/blood\s*pressure/i.test(t)) return { type: 'ask_share' };
  const bp = parseBloodPressureEn(t);
  if (bp) return { type: 'health_log', ...bp, note: t };
  if (/\b(?:trip|travel|take a trip|go (?:back )?(?:somewhere|there)|would love to (?:go|visit)|want to (?:go|visit)|go for a (?:drive|ride|walk)|outing|getaway|vacation|get some fresh air|visit|(?:love|like|want|wish|would like) to (?:go|see) (?:back|there|again)|go back|go there)\b/i.test(t)) {
    // 'family trip photos' names a stored memory and asks to see it: recall wins over a trip proposal.
    if (PHOTO_WORDS.test(t)) {
      const rk = matchKeywordsEn(t, ctx.knownNodeNames);
      if (rk.length) return { type: 'recall', keywords: rk };
    }
    const pl = findPlaces(t)[0];
    return { type: 'trip', destination: pl ? placeRegion(pl) : undefined };
  }
  const kws = matchKeywordsEn(t, ctx.knownNodeNames);
  if (kws.length) return { type: 'recall', keywords: kws };
  if (/\b(?:remember|back then|old days|those days|memor(?:y|ies)|show me (?:the |that |an? )?(?:photo|picture|pic)|that (?:photo|picture)|old (?:photo|picture)s?)\b/i.test(t)) {
    const toks = tokensEn(t);
    return { type: 'recall', keywords: toks.slice(0, 4) };
  }
  return { type: 'smalltalk' };
}

const GENERIC_PART = new Set([...STOPWORDS_EN, 'pagoda', 'temple', 'beach', 'park', 'kim', 'lee', 'choi', 'jung', 'island', 'village', 'market', 'lake', 'palace', 'cathedral']);

/** Node names (also partial words of multi-word names, and text tokens contained in names) found in the text. */
export function matchKeywordsEn(text: string, names: string[]): string[] {
  const out: string[] = [];
  const add = (k: string) => { if (!out.some(o => o.toLowerCase() === k.toLowerCase())) out.push(k); };
  const low = text.toLowerCase();
  const hasWord = (w: string) => new RegExp(`(?<![a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z0-9])`, 'i').test(low);
  const toks = tokensEn(text);
  for (const n of names) {
    if (!n || n.length < 2) continue;
    if (hasWord(n)) { add(n); continue; }
    for (const part of n.split(/[\s,]+/)) {
      const p = part.replace(/[^\p{L}\p{N}'-]/gu, '');
      if (p.length >= 3 && !GENERIC_PART.has(p.toLowerCase()) && hasWord(p)) { add(p); break; }
    }
  }
  for (const t of toks) {
    if (t.length < 3 || out.some(o => o.toLowerCase().includes(t) || t.includes(o.toLowerCase()))) continue;
    if (names.some(n => n.length >= 3 && n.toLowerCase().split(/[\s,]+/).some(w => { const s = stemEn(w); return s.length >= 3 && !GENERIC_PART.has(s) && (s === t || s.startsWith(t) || (t.length > 4 && t.startsWith(s))); }))) add(t);
  }
  return out;
}

export function familyIntentEn(text: string, _asker: User): FamilyIntent {
  const t = text.trim();
  if (/\bfind (?:us |a |the )?(?:good |best |right )?(?:time|date|day|slot)\b|\b(?:pick|choose|set|settle on|lock in|arrange|coordinate|work out|figure out)\b[^.?!]{0,22}\b(?:time|date|day|schedule)\b|\bschedule (?:it|this|that|the|a|our|something)\b|\bwhen (?:should|can|could|shall|do) (?:we|everyone|all of us) (?:meet|all meet|get together|gather|go)\b|\bwhat time works\b|\btime that works\b|\bcan you schedule\b/i.test(t)) return { type: 'schedule' };
  const tachi = /\btachi\b/i.test(t);
  if (tachi && /\?/.test(t)) return { type: 'ask_tachi' };
  const noun = /\b(?:gathering|get-?together|reunion|birthday|trip|family|party|dinner|all go|everyone|together|outing|visit)\b/i.test(t);
  const proposal = /\blet'?s\b|\blet us\b|\bwe should\b|\bshall we\b|\bhow about\b|\bwhy don'?t we\b|\bwe could\b|\bshould we\b|\bwe can all\b|\blet's all\b|\bwhat if we\b/i.test(t);
  const pastOrQuestion = /\b(?:last|previous|where is|where are|what should|what to get|which|gift|present)\b|\bwhat'?s\b[^.?!]*\bgood\b/i.test(t);
  if (noun && proposal && !pastOrQuestion && !/\?/.test(t.replace(/(?:shall we|should we|how about)[^?]*\?$/i, ''))) {
    const pl = findPlaces(t)[0];
    return { type: 'gathering', topic: pl ? `${placeRegion(pl)} family gathering` : (/\bbirthday\b/i.test(t) ? "Mom's birthday gathering" : 'Family gathering') };
  }
  if (tachi) return { type: 'ask_tachi' };
  if (/\b(?:mom|mother|mum|mama|grandma|grandmother|nana)\b/i.test(t) && /\?|\b(?:how|what|when|where|is she|has she|does she|did she|blood pressure|medicine|pills?|health|sleep|slept|mood|feeling|lately|today|doing|eaten|ate)\b/i.test(t)) return { type: 'ask_tachi' };
  return { type: 'none' };
}

// ── availability ───────────────────────────────────────────────────────────
interface Constraint { dow?: number[]; hour?: number; date?: number; week?: number }

function clauseConstraintEn(c: string): Constraint | undefined {
  const k: Constraint = {};
  const dows: number[] = [];
  if (/\bsat(?:urday)?s?\b/i.test(c)) dows.push(6);
  if (/\bsun(?:day)?s?\b/i.test(c)) dows.push(0);
  if (/\bweekdays?\b/i.test(c)) dows.push(1, 2, 3, 4, 5);
  if (/\bweekends?\b/i.test(c)) dows.push(6, 0);
  if (dows.length) k.dow = dows;
  const dm = c.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i);
  if (dm) k.date = +dm[1];
  if (/\b(?:lunch|noon|midday|morning|afternoon|12\s*(?:pm|o'?clock)?|1\s*pm)\b/i.test(c)) k.hour = 12;
  if (/\b(?:dinner|evening|night|supper|6\s*pm|7\s*pm|18:00|6\s*o'?clock)\b/i.test(c)) k.hour = 18;
  if (/\bthis (?:week|coming|saturday|sunday|weekend)\b/i.test(c)) k.week = 0;
  if (/\bnext\b|\bfollowing\b|\bthe week after\b|\bin (?:two|2) weeks\b/i.test(c)) k.week = 1;
  return Object.keys(k).length ? k : undefined;
}

export function availabilityEn(text: string, slots: Slot[]): string[] {
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
  // 'none work' / 'no time works' / 'all of them are bad' -> nothing works
  if (/\bnone\b(?: of (?:them|these|those))?(?: (?:work|works|are|is))?|\bno (?:time|day|date|slot)s? (?:works?|is possible)|\bnothing works\b|\bcan'?t make (?:any|it)\b|\bcannot make (?:any|it)\b|\bnone of (?:them|these)\b|\b(?:all|every(?:thing|one)?) (?:of them )?(?:is|are|looks?) (?:bad|hard|difficult|tough|busy)/i.test(t) && !/\bexcept\b|\bbut\b/i.test(t)) return [];
  const allWords = /\b(?:any ?time|any (?:day|time|slot)|whenever|all (?:of them |of these |the )?(?:work|works|are fine|are good|are ok|are okay|look good|good|fine|ok|okay)|everything (?:works|is fine|is good|is ok)|every (?:day|slot) (?:works|is fine)|the rest|everything else|all the others|the others|any of them|either (?:works|is fine|one)|no preference|i'?m flexible|flexible)\b/i;
  const clauses = t.split(/[,.;!?]|\s(?:but|however|and|though|except)\s(?=(?:the |everything |all |any |i |sat|sun|next|this))/i).map(s => s.trim()).filter(Boolean);
  const neg = /\b(?:can'?t|cannot|won'?t|wouldn'?t|doesn'?t|don'?t|isn'?t|not|busy|unavailable|except|other than|excluding|booked|no (?=sat|sun|week|lunch|dinner|morning|evening|time|day)|conflict|difficult|hard)\b|n'?t work\b/i;
  const mealTalk = /\b(?:ate|eaten|eating|had (?:my )?(?:breakfast|lunch|dinner)|having (?:lunch|dinner|breakfast))\b/i;
  const availWord = /\b(?:work|works|fine|ok|okay|good|can|could|available|free|possible|great|perfect|prefer|best|better)\b/i;
  let positive: Set<string> | undefined;
  const negative = new Set<string>();
  let any = false;
  let hasAllWord = false;
  for (const c of clauses) {
    if (mealTalk.test(c) && !allWords.test(c) && !availWord.test(c)) continue; // meal talk, not availability
    const isNeg = neg.test(c) && !/\bno preference\b/i.test(c);
    if (allWords.test(c) && !isNeg) { hasAllWord = true; any = true; continue; }
    const k = clauseConstraintEn(c);
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
