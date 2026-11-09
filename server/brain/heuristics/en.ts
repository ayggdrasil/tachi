// English parsing utilities for the offline demo brain (mirror of ko.ts).
import { FAMILY_ALIASES_EN } from '../../../shared/constants';
import type { MemoryPerson } from '../../../shared/types';
import { resolvePlace } from '../../data/places';

export const decadeEraEn = (year: number): string => `${Math.floor(year / 10) * 10}s`;
export const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** 'A', 'A and B', 'A, B and C' */
export function listEn(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ── numbers / years ────────────────────────────────────────────────────────
const DECADE_WORDS: Record<string, number> = { tens: 10, twenties: 20, thirties: 30, forties: 40, fifties: 50, sixties: 60, seventies: 70, eighties: 80, nineties: 90 };
const TENS_WORDS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const fullYear = (n: number): number => (n >= 30 ? 1900 + n : 2000 + n);

export interface WhenInfo { year?: number; era?: string }
export function parseWhenEn(text: string): WhenInfo {
  let m: RegExpMatchArray | null;
  // '1980s', "1980's"
  if ((m = text.match(/(?<!\d)(1[89]\d0|20[0-2]0)'?s\b/))) return { era: decadeEraEn(+m[1]) };
  // "'80s", "the 80s"
  if ((m = text.match(/(?:'|\bthe\s+|\bin\s+the\s+|\bearly\s+|\blate\s+|\bmid[- ]?)(\d0)'?s\b/i))) return { era: decadeEraEn(fullYear(+m[1])) };
  // 'the eighties', 'nineteen eighties'
  if ((m = text.match(/\b(?:nineteen\s+)?(seventies|eighties|sixties|fifties|nineties|forties|thirties)\b/i))) {
    const n = DECADE_WORDS[m[1].toLowerCase()];
    return { era: decadeEraEn(fullYear(n)) };
  }
  // 'nineteen eighty-four'
  if ((m = text.match(/\bnineteen[\s-]+(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/i))) {
    const y = 1900 + TENS_WORDS[m[1].toLowerCase()] + (m[2] ? ONES_WORDS[m[2].toLowerCase()] : 0);
    return { year: y, era: decadeEraEn(y) };
  }
  // 1984
  if ((m = text.match(/(?<![\d/.:-])(1[89]\d{2}|20[0-2]\d)(?![\d/:-]|\.\d)/))) { const y = +m[1]; return { year: y, era: decadeEraEn(y) }; }
  // '84
  if ((m = text.match(/(?:^|[\s(])['’](\d{2})\b(?!s)/))) { const y = fullYear(+m[1]); return { year: y, era: decadeEraEn(y) }; }
  return {};
}

export function parseSeasonEn(text: string): string | undefined {
  // explicit season words win over implicit cues
  if (/\b(?:spring(?:time)?)\b/i.test(text)) return 'spring';
  if (/\bsummer\b/i.test(text)) return 'summer';
  if (/\b(?:autumn|(?:in|the|last|that) fall|fall (?:of|in|colou?rs|leaves))\b/i.test(text)) return 'autumn';
  if (/\bwinter\b/i.test(text)) return 'winter';
  if (/\b(?:cherry[- ]blossoms?|blossoms?|azaleas?|forsythia)\b/i.test(text)) return 'spring';
  if (/\b(?:swimming|monsoon|watermelon|swim ring)\b/i.test(text)) return 'summer';
  if (/\b(?:foliage|maple|chuseok|harvest)\b/i.test(text)) return 'autumn';
  if (/\b(?:snow(?:y|ing|ed)?|snowman|sledding|skiing|ski|kimjang)\b/i.test(text)) return 'winter';
  return undefined;
}

// ── people ─────────────────────────────────────────────────────────────────
interface Cand { re: RegExp; person: MemoryPerson }
const GENERIC: { re: string; name: string; relation: string }[] = [
  { re: 'friends?', name: 'Friends', relation: 'friend' },
  { re: 'classmates?', name: 'Classmates', relation: 'friend' },
  { re: 'mother-in-law', name: 'Mother-in-law', relation: 'mother-in-law' },
  { re: 'father-in-law', name: 'Father-in-law', relation: 'father-in-law' },
  { re: '(?:my )?(?:mother|mom|mum|mama)', name: 'Mother', relation: 'mother' },
  { re: '(?:my )?(?:father|dad|papa)', name: 'Father', relation: 'father' },
  { re: 'aunt', name: 'Aunt', relation: 'aunt' },
  { re: 'uncle', name: 'Uncle', relation: 'uncle' },
  { re: '(?:older|big|elder) sister', name: 'Older sister', relation: 'older sister' },
  { re: '(?:older|big|elder) brother', name: 'Older brother', relation: 'older brother' },
  { re: '(?:younger|little) brother', name: 'Younger brother', relation: 'younger brother' },
  { re: 'in-laws', name: 'In-laws', relation: 'in-laws' },
  { re: 'neighbou?rs?', name: 'Neighbors', relation: 'neighbor' },
  { re: 'teachers?', name: 'Teacher', relation: 'teacher' },
  { re: 'son-in-law', name: 'Sangho Jung', relation: 'son-in-law' },
  { re: '(?:the )?(?:kids|children)', name: 'The kids', relation: 'children' },
];
const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parsePeopleEn(text: string): MemoryPerson[] {
  const cands: Cand[] = [];
  const fullNames = new Map<string, MemoryPerson>();
  for (const v of Object.values(FAMILY_ALIASES_EN)) fullNames.set(v.name, { name: v.name, relation: v.relation });
  for (const [n, p] of fullNames) cands.push({ re: new RegExp(`(?<![A-Za-z])${escRe(n)}(?![A-Za-z])`, 'gi'), person: p });
  for (const [k, v] of Object.entries(FAMILY_ALIASES_EN)) cands.push({ re: new RegExp(`(?<![A-Za-z-])${escRe(k).replace(/-/g, '[- ]')}(?![A-Za-z]|-in-law)`, 'gi'), person: { name: v.name, relation: v.relation } });
  for (const g of GENERIC) cands.push({ re: new RegExp(`(?<![A-Za-z-])${g.re}(?![A-Za-z]|-in-law)`, 'gi'), person: { name: g.name, relation: g.relation } });
  const found: { start: number; len: number; person: MemoryPerson }[] = [];
  for (const c of cands) for (const m of text.matchAll(c.re)) found.push({ start: m.index!, len: m[0].length, person: c.person });
  found.sort((a, b) => b.len - a.len || a.start - b.start);
  const taken: [number, number][] = [];
  const kept: typeof found = [];
  for (const f of found) {
    if (taken.some(([s, e]) => f.start < e && f.start + f.len > s)) continue;
    taken.push([f.start, f.start + f.len]);
    kept.push(f);
  }
  kept.sort((a, b) => a.start - b.start);
  const out: MemoryPerson[] = [];
  for (const f of kept) if (!out.some(o => o.name === f.person.name)) out.push({ ...f.person });
  return out;
}

// ── events / emotions / topics ─────────────────────────────────────────────
const EVENTS: [RegExp, string][] = [
  [/\b(?:school|class|field) trip\b/i, 'school trip'], [/\bhoneymoon\b/i, 'honeymoon'], [/\bfamily (?:trip|vacation|holiday|outing)\b/i, 'family trip'],
  [/\bwedding\b|\bgot married\b/i, 'wedding'], [/\b(?:60th|sixtieth)\b|\bhwangap\b/i, '60th birthday'], [/\b(?:70th|seventieth)\b|\bchilsun\b/i, '70th birthday'],
  [/\bfirst birthday\b|\bdoljanchi\b|\bdol\b/i, 'first birthday'], [/\bgraduation\b|\bgraduated\b/i, 'graduation'], [/\bentrance ceremony\b|\bfirst day of school\b/i, 'entrance ceremony'],
  [/\bpicnic\b/i, 'picnic'], [/\bsummer vacation\b|\bbeach (?:trip|vacation|day)\b|\bswimming\b/i, 'summer vacation'], [/\b(?:chuseok|seollal|lunar new year|holiday)\b/i, 'holiday'],
  [/\bbirthday\b/i, 'birthday'], [/\btrip\b|\btravel(?:l?ed)?\b|\bvacation\b/i, 'trip'], [/\boutings?\b/i, 'outing'],
];
export function parseEventEn(text: string): string | undefined {
  for (const [re, name] of EVENTS) if (re.test(text)) return name;
  return undefined;
}

export const EMOTION_LABELS_EN = ['happiness', 'nostalgia', 'joy', 'excitement', 'pride', 'regret', 'gratitude', 'peace'];
const EMOTIONS: [RegExp, string][] = [
  [/\blaugh|\bgiggl|\bfun\b|\bjoy|\bhilarious|\bsilly\b|\bcracked up/i, 'joy'],
  [/\bhappy|\bhappiest|\bdelight|\bglad\b|\bwonderful (?:time|day)|\bgood old days|\bblessed\b/i, 'happiness'],
  [/\bmiss(?:ed|es)?\b|\bnostalg|\bthose days\b|\bback then\b|\bold days\b|\bgood times\b|\bwish I could go back/i, 'nostalgia'],
  [/\bexcite|\bthrill|\bbutterflies\b|\bcouldn't wait\b|\bnervous\b/i, 'excitement'],
  [/\bproud\b|\bpride\b/i, 'pride'],
  [/\bregret|\bwish (?:we|I) had\b|\bdisappoint|\btoo bad\b|\bcouldn't go\b|\bsad that\b/i, 'regret'],
  [/\bthank|\bgrateful\b|\bgratitude\b|\bthanks to\b/i, 'gratitude'],
  [/\bpeace|\bcalm\b|\bquiet\b|\bserene\b|\bbeautiful\b|\blovely\b|\bpretty\b|\bgorgeous\b|\bcozy\b|\bcosy\b|\bwarm\b/i, 'peace'],
];
export function parseEmotionsEn(text: string, year?: number, nowYear = 2026): string[] {
  const out: string[] = [];
  for (const [re, name] of EMOTIONS) if (re.test(text) && !out.includes(name)) out.push(name);
  if (!out.includes('nostalgia') && ((year && nowYear - year >= 20) || /\bback then\b|\bin those days\b|\bold days\b/i.test(text))) out.push('nostalgia');
  if (!out.length) out.push('nostalgia');
  return out.slice(0, 3);
}

const TOPICS: [RegExp, string][] = [
  [/\bdabo(?:tap)?(?: pagoda| tower)?\b/i, 'Dabotap Pagoda'], [/\bseokga(?:tap)?(?: pagoda| tower)?\b/i, 'Seokgatap Pagoda'],
  [/\bcherry[- ]blossoms?\b|\bcherry trees?\b/i, 'cherry blossoms'], [/\bautumn leaves\b|\bfall (?:leaves|colou?rs)\b|\bfoliage\b/i, 'autumn leaves'],
  [/\bthe sea\b|\bocean\b|\bseaside\b/i, 'sea'], [/\btrain\b/i, 'train'], [/\blunch ?box(?:es)?\b|\bpacked lunch\b/i, 'lunch box'], [/\bhanbok\b/i, 'hanbok'],
  [/\bschool uniform\b|\buniforms?\b/i, 'school uniform'], [/\bbicycles?\b|\bbikes?\b/i, 'bicycle'], [/\bcameras?\b/i, 'camera'], [/\bwatermelons?\b/i, 'watermelon'],
  [/\bswim ring\b|\binner tube\b|\btubes?\b/i, 'swim ring'], [/\bsnowman\b/i, 'snowman'], [/\bgimbap\b|\bkimbap\b/i, 'gimbap'], [/\bboiled eggs?\b/i, 'boiled eggs'],
  [/\bcider\b/i, 'cider'], [/\bradio\b/i, 'radio'], [/\bbus\b/i, 'bus'], [/\bboat\b|\bferry\b/i, 'boat'], [/\bsand\b/i, 'sand'], [/\bseashells?\b|\bclams?\b/i, 'seashells'],
  [/\bmakgeolli\b/i, 'makgeolli'], [/\bhot springs?\b/i, 'hot spring'], [/\bcable car\b/i, 'cable car'], [/\blotus\b/i, 'lotus'], [/\brice cakes?\b|\bchapssal\b/i, 'rice cakes'],
  [/\bsongpyeon\b/i, 'songpyeon'], [/\btteokguk\b/i, 'tteokguk'], [/\bkimchi\b/i, 'kimchi'], [/\bsports day\b/i, 'sports day'], [/\bchoir\b/i, 'choir'],
  [/\bsinging\b|\bsongs?\b/i, 'singing'], [/\bdanc(?:e|ing)\b/i, 'dancing'], [/\bguitar\b/i, 'guitar'], [/\bpiano\b/i, 'piano'], [/\bparasol\b|\bumbrella\b/i, 'parasol'],
  [/\bpagoda\b/i, 'pagoda'],
];
export function parseTopicsEn(text: string): string[] {
  const out: string[] = [];
  for (const [re, name] of TOPICS) if (re.test(text) && !out.includes(name)) out.push(name);
  return out.filter(t => !(t === 'pagoda' && out.some(o => o.endsWith('Pagoda'))));
}

// ── yes / no ───────────────────────────────────────────────────────────────
const YES_START = /^(?:yes|yeah|yep|yup|ya|yea|sure|okay|ok|k|alright|all right|of course|please do|please|go ahead|do it|send it|send them|share it|sounds? (?:good|great|lovely|nice|fine|perfect|wonderful)|that sounds (?:good|great|lovely|nice|fine|wonderful)|i(?:'d| would) (?:love|like) (?:to|that)|i(?:'d| would) love it|let'?s (?:do it|go|send it)|why not|absolutely|definitely|certainly|good idea|great idea|fine|that would be (?:nice|lovely|great|good|wonderful)|love to|by all means|please send|go for it|i(?:'m| am) (?:in|up for it))(?=$|[\s.,!~…?'’;:-])/i;
const NO_START = /^(?:no|nope|nah|not now|not yet|not really|not today|not this time|maybe later|later|another time|some other time|no thanks|no thank you|i'?d rather not|i would rather not|don'?t (?:send|share)|do not (?:send|share)|never mind|nevermind|skip|let'?s not|better not|not right now|stop)(?=$|[\s.,!~…?'’;:-])/i;
const NO_ANY = /\bkeep (?:it )?(?:private|to myself|just for me)\b|\bjust for me\b|\bonly for me\b|\bfor my eyes only\b|\bdon'?t (?:send|share)\b|\bdo not (?:send|share)\b|\bnot (?:for )?(?:the )?(?:kids|family|children)\b|\bkeep it (?:between us|secret)\b|\bprivate\b|\bsecret\b|\bnot ready\b|\bnot to share\b/i;
const NOT_CONSENT = /\?|\bremember\b|\bwhere\b|\bwhen\b|\bwho\b|\bwhat\b|\bwhy\b|\bhow\b|\bhurt|\bache|\bpain|\bknee|\bblood pressure\b|\bdizz|\bheadache|\d/i;
const MAX_CONSENT_LEN = 44;
export function yesNoEn(text: string): 'yes' | 'no' | undefined {
  const t = text.trim().replace(/^[\s.,!~…]+/, '');
  if (!t) return undefined;
  if ((NO_START.test(t) || NO_ANY.test(t)) && t.length <= 44) return 'no';
  if (t.length > MAX_CONSENT_LEN || NOT_CONSENT.test(t)) return undefined;
  if (YES_START.test(t)) return 'yes';
  return undefined;
}

// ── tokens ─────────────────────────────────────────────────────────────────
export const STOPWORDS_EN = new Set(('a an the and or but of in on at to for with from by about as is are was were be been am do does did have has had i me my mine we us our you your he she it its they them their this that these those ' +
  'what when where who why how which can could would should will shall may might must please tachi hey hello hi yes no not ok okay so very just really some any all more most much many too also then than there here now today tonight tomorrow ' +
  'show tell give let see look take get go going went come came want like love need know think remember recall find bring send share talk say said ask photo photos picture pictures pic album memory memories story stories one thing things something anything ' +
  'back then old days time times day days again again little bit lot lots park kim lee choi jung temple beach island city lake family trip').split(/\s+/));
export function stemEn(w: string): string {
  let s = w.toLowerCase().replace(/[’']s$/, '').replace(/[^\p{L}\p{N}-]/gu, '');
  if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  return s;
}
export function tokensEn(text: string): string[] {
  return text.split(/[\s,.!?~…;:()"]+/).map(w => w.trim()).filter(Boolean).map(stemEn).filter(t => t.length >= 3 && !STOPWORDS_EN.has(t));
}

export { resolvePlace };

// ── whole-answer analysis ──────────────────────────────────────────────────
export interface AnalysisEn {
  year?: number; era?: string; season?: string;
  place?: string; placeId?: string;
  people: MemoryPerson[]; event?: string; emotions: string[]; topics: string[];
}
export function analyzeEn(text: string): AnalysisEn {
  const w = parseWhenEn(text);
  const pl = resolvePlace(text);
  let people = parsePeopleEn(text);
  if (people.some(p => p.name !== 'The kids' && (p.relation === 'daughter' || p.relation === 'son'))) people = people.filter(p => p.name !== 'The kids');
  return {
    ...w,
    season: parseSeasonEn(text),
    place: pl?.display, placeId: pl?.place.id,
    people, event: parseEventEn(text),
    emotions: parseEmotionsEn(text, w.year),
    topics: parseTopicsEn(text),
  };
}

/** First name of an English full name ('Youngsu Park' -> 'Youngsu'). */
export const firstName = (full: string): string => full.trim().split(/\s+/)[0] ?? full;
