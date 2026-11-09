// English offline composition: recall, share, trips, proactive, report, chat.
import { PRIVACY_LABELS_EN, dateLabelL, pad2 } from '../../../shared/constants';
import type {
  ItineraryPayload, Memory, MemoryPerson, PrivacyCategory, PrivacySettings, ProactiveKind, ReportPayload, ReportSession, SessionLog,
  TripSuggestionPayload, User,
} from '../../../shared/types';
import { PLACES, findPlaces, placeById, templateFor, type Place } from '../../data/places';
import type { SeniorObservation } from '../contract';
import { capitalize, firstName, listEn } from './en';
import { medicationObservationEn, observe } from './observe';
import { parseBloodPressureEn } from './health';

export const PRIVATE_SESSION_TEXT_EN = 'This conversation is private';

/** 'Bulguksa Temple, Gyeongju' -> 'Bulguksa Temple in Gyeongju' */
export const placeTitleEn = (display: string): string => display.replace(/,\s*/, ' in ');

const GROUP_NAMES = ['The kids', 'Friends', 'Classmates', 'In-laws', 'Neighbors'];
export function peopleCallsEn(people: MemoryPerson[], audience: 'senior' | 'children' = 'senior'): string[] {
  return people.map(p => {
    if (p.relation === 'husband') return audience === 'children' ? 'Dad' : firstName(p.name);
    if (GROUP_NAMES.includes(p.name)) return audience === 'children' ? `her ${p.name.replace(/^The /, '').toLowerCase()}` : `your ${p.name.replace(/^The /, '').toLowerCase()}`;
    return firstName(p.name);
  });
}

export function memoryRefEn(m: Pick<Memory, 'year' | 'place' | 'title'>): string {
  return m.year && m.place ? `${m.year} ${m.place}` : m.title;
}

/** How the family refers to the senior: 'Grandma' for grandchildren, otherwise 'your mom'. */
export function seniorCallEn(asker?: User): string {
  if (asker && ['granddaughter', 'grandson', 'great-grandchild'].includes(asker.relation)) return 'Grandma';
  return 'your mom';
}
export const possessiveEn = (call: string): string => `${call}'s`;

/** Short greeting name for the senior ('Soonja Kim' -> 'Soonja'); empty when not Latin. */
export function greetName(senior?: User): string {
  const n = senior?.name ?? '';
  return /^[A-Za-z]/.test(n) ? firstName(n) : '';
}
const withName = (greet: string, senior?: User): string => { const n = greetName(senior); return n ? `${greet}, ${n}.` : `${greet}.`; };

function firstSentences(text: string, n: number): string[] {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).slice(0, n);
}
function vividSentence(m: Pick<Memory, 'story'>): string {
  return firstSentences(m.story, 12).sort((a, b) => b.length - a.length)[0] ?? '';
}

// ── recall / share ─────────────────────────────────────────────────────────
export function recallReplyEn(memory: Memory, _query: string): string {
  const parts: string[] = [];
  const ev = memory.event && !memory.title.toLowerCase().includes(memory.event.toLowerCase()) ? ` ${memory.event}` : '';
  parts.push(`Yes, I remember. That's your ${memoryRefEn(memory)}${ev} story.`);
  if (memory.people.length) parts.push(`You were there with ${listEn(peopleCallsEn(memory.people))}.`);
  const hook = memory.tags.length ? `What stays with me most is the ${memory.tags.slice(0, 2).join(' and ')} you talked about.` : memory.summary;
  parts.push(hook);
  return parts.slice(0, 3).join(' ');
}

const EMOTION_LINE_EN: Record<string, string> = {
  nostalgia: 'She seems to miss that day very much.', happiness: 'Happiness shone through every word.', joy: 'She was smiling the whole time she told it.',
  excitement: 'You could feel how excited she was.', pride: 'You could feel her pride.', regret: 'It sounds like a day with a little bit of longing in it.',
  gratitude: 'It was a story full of gratitude.', peace: 'It was such a peaceful memory.',
};
export function shareSummaryEn(memory: Memory): { title: string; summary: string } {
  const s: string[] = [];
  s.push(`Mom shared a story with us today: ${memory.title}.`);
  if (memory.people.length) {
    const ev = memory.event ?? 'day';
    s.push(`It was a ${ev} with ${listEn(peopleCallsEn(memory.people, 'children'))}.`);
  } else if (memory.place) s.push(`It was a day at ${memory.place}.`);
  const v = vividSentence(memory);
  if (v) s.push(`"${v.replace(/[.]+$/, '')}," she said, remembering that day.`);
  const em = memory.emotions[0];
  s.push(`${EMOTION_LINE_EN[em] ?? 'It is a precious memory.'} Why not send her a warm word?`);
  return { title: memory.title, summary: s.join(' ') };
}

// ── trips ──────────────────────────────────────────────────────────────────
export function shortTravelEn(p?: Place): string {
  if (!p) return 'an easy ride';
  const map: Record<string, string> = { 경주: '2 hours by KTX', 부산: '2 hr 40 min by KTX', 전주: '1 hr 40 min by KTX', 강릉: '2 hours by KTX', 서울: '30 minutes by subway', 제주: '1 hour by plane' };
  return map[p.region] ?? p.travelEn;
}

export function suggestTripEn(memory: Memory): Omit<TripSuggestionPayload, 'type' | 'tripId'> {
  const place = placeById(memory.placeId) ?? findPlaces(memory.place ?? '')[0] ?? PLACES.find(p => p.id === 'gyeongju');
  const region = place?.regionEn ?? memory.place ?? 'Gyeongju';
  const nearbyNames = (place?.nearby ?? []).map(placeById).filter((p): p is Place => !!p).map(p => p.nameEn);
  const specific = place && place.kind !== 'city' ? place.nameEn : undefined;
  const highlights = [specific, ...nearbyNames].filter((x): x is string => !!x).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  while (highlights.length < 3) highlights.push(...templateFor(region).highlights.filter(h => !highlights.includes(h)).slice(0, 1));
  const tag = memory.tags.find(t => /pagoda|blossom|sea|beach|leaves|foliage/i.test(t)) ?? memory.tags[0];
  const hook = tag ? `How about standing in front of the ${tag.replace(/^the /i, '')} again?` : 'How about standing in that very spot again?';
  return {
    memoryId: memory.id,
    title: `Revisiting ${region}: a two-day trip`,
    reason: `Your ${memoryRefEn(memory)} story came to mind. It's only ${shortTravelEn(place)} away. ${hook}`,
    destination: region,
    highlights: highlights.slice(0, 4),
    durationLabel: '2 days, 1 night',
  };
}

export function planItineraryEn(suggestion: Omit<TripSuggestionPayload, 'type'>): Omit<ItineraryPayload, 'type' | 'tripId'> {
  const t = templateFor(suggestion.destination);
  return {
    title: `${suggestion.destination} two-day itinerary`,
    destination: suggestion.destination,
    dateLabel: 'Date to be decided',
    days: t.days.map(d => ({
      label: d.label,
      stops: d.stops.map(s => ({ time: s.time, title: s.title, description: s.description, ...(s.travel ? { travel: s.travel } : {}), ...(s.note ? { note: s.note } : {}) })),
    })),
    tips: t.tips,
  };
}

// ── proactive ──────────────────────────────────────────────────────────────
export function proactiveMessageEn(kind: ProactiveKind, memory?: Memory, senior?: User): { text: string; quickReplies: string[] } {
  const ref = memory ? memoryRefEn(memory) : '';
  switch (kind) {
    case 'morning':
      return memory
        ? { text: `${withName('Good morning', senior)} I was just thinking about your ${ref} photo. Did you sleep well last night?`, quickReplies: ['I slept well', 'Not so well', 'Let me tell you about that photo'] }
        : { text: `${withName('Good morning', senior)} Please remember to take your morning medicine. Did you sleep well last night?`, quickReplies: ['I slept well', 'Not so well'] };
    case 'memory':
      return memory
        ? { text: `${withName('Good afternoon', senior)} Your ${ref} story suddenly came to mind. Would you tell me a little about how it was?`, quickReplies: ["Sure, let me tell you", 'Maybe next time'] }
        : { text: `${withName('Good afternoon', senior)} Would you show me an old photo today?`, quickReplies: ["Sure, I'll show you", 'Maybe next time'] };
    case 'evening':
      return { text: `${withName('Good evening', senior)} Please remember your evening medicine. Did you enjoy your dinner?`, quickReplies: ['It was delicious', 'I took my medicine', "I'm a bit tired today"] };
    case 'ask_photo':
      return { text: `${withName('Hello', senior)} Would you show me an old photo today? I would love to hear the story behind it.`, quickReplies: ["Sure, I'll show you", 'Maybe later'] };
  }
}

// ── report ─────────────────────────────────────────────────────────────────
export function composeReportEn(sessions: SessionLog[], privacy: PrivacySettings, moodToday: string | undefined, now: Date): Omit<ReportPayload, 'type'> {
  const rows: ReportSession[] = sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(s => {
      const d = new Date(s.startedAt);
      const isPrivate = privacy[s.category] === 'private';
      return { time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, title: isPrivate ? 'Chat' : s.title, summary: isPrivate ? PRIVATE_SESSION_TEXT_EN : s.summary, category: s.category, isPrivate };
    });
  const times = [...new Set(rows.map(r => r.time))];
  const pub = rows.filter(r => !r.isPrivate);
  let highlight: string;
  if (!rows.length) highlight = 'No conversations yet today. Tachi will check in soon.';
  else {
    const lead = `Mom chatted with Tachi today at ${times.join(', ')}.`;
    const tail = pub.length ? `She spent a relaxed time talking about ${pub[pub.length - 1].title}.` : 'What she talked about today is private.';
    highlight = `${lead} ${tail}`;
  }
  return {
    dateLabel: dateLabelL(now, 'en'),
    sessions: rows,
    ...(privacy.mood === 'family' && moodToday ? { moodLabel: moodToday } : {}),
    highlight,
  };
}

// ── senior small talk ──────────────────────────────────────────────────────
const pickBy = <T,>(seed: string, arr: T[]): T => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length]; };

export function seniorChatEn(text: string): { reply: string; quickReplies: string[]; category: PrivacyCategory; observation?: SeniorObservation } {
  const r = seniorChatCoreEn(text);
  const observation = observe(text.trim());
  return observation ? { ...r, observation } : r;
}

function seniorChatCoreEn(text: string): { reply: string; quickReplies: string[]; category: PrivacyCategory } {
  const t = text.trim();
  const bp = parseBloodPressureEn(t);
  if (/blood\s*pressure|\bbp\b/i.test(t) && bp) return { reply: `Your blood pressure was ${bp.systolic} over ${bp.diastolic}. Thank you for telling me. Please don't overdo it today.`, quickReplies: ['Thank you', 'I took my medicine'], category: 'health' };
  if (/\b(?:hurts?|aching|aches?|achy|sore|pain|painful|numb|dizz\w*|headache|fever|cough|knees?|back\b|stiff|hospital|doctor|sick)\b/i.test(t) && !/\bnot (?:sick|hurt)/i.test(t))
    return { reply: pickBy(t, ["Oh, that must be uncomfortable. Please take it easy and rest today.", "I'm sorry to hear that. Stay warm and rest, and please see a doctor if it gets worse."]), quickReplies: ["I'll rest a bit", 'Maybe I should see a doctor'], category: 'health' };
  if (/\b(?:pills?|medicine|medication|meds|vitamins?|supplements?)\b/i.test(t)) {
    const o = medicationObservationEn(t);
    const reply = o?.taken === false ? 'I see. Please follow the schedule your doctor gave you, and ask your pharmacist about the missed dose.' : o?.taken ? 'Thank you for telling me. Good to hear you took your medicine.' : 'Thanks for mentioning it. Please take your medicine as your doctor advised.';
    return { reply, quickReplies: ['Thank you', 'Let me see an old photo'], category: 'health' };
  }
  if (/\b(?:sleep|slept|sleepy|insomnia|couldn'?t sleep|tossed|nap)\b/i.test(t)) return { reply: /\b(?:couldn'?t|didn'?t|barely|not|bad|poor|little|tossed|insomnia)\b/i.test(t) ? "You didn't sleep well. Please rest for a bit during the day today." : "I'm glad you slept soundly. Let's start the day on a good note.", quickReplies: ['Thank you', 'Let me see an old photo'], category: 'health' };
  if (/\b(?:lonely|sad|down|blue|depressed|empty|bored|homesick)\b/i.test(t)) return { reply: "Some days are like that. I'm right here with you. If you like, tell me an old story.", quickReplies: ["I'd like to see a photo", 'Thank you'], category: 'mood' };
  if (/\bso[- ]so\b|\bmeh\b|\bjust (?:okay|ok|alright)\b|\bnothing special\b|\bsame as usual\b/i.test(t)) return { reply: 'Some days are like that. I hope you have a gentle, comfortable day.', quickReplies: ["I'd like to see a photo", 'Thank you'], category: 'mood' };
  if (/\b(?:feel|feeling|i'?m|i am)\s+(?:so |very |really )?(?:good|great|happy|wonderful|cheerful)\b|\bhappy\b|\bgood mood\b|\bwonderful day\b/i.test(t)) return { reply: "I'm so glad you're feeling good. What happened today?", quickReplies: ["I'd like to see a photo", 'Just feeling good'], category: 'mood' };
  if (/\b(?:breakfast|lunch|dinner|supper|meal|ate|eaten|eating|hungry|food)\b/i.test(t)) return { reply: 'A warm meal is the best. Did you enjoy it?', quickReplies: ['It was delicious', 'I have no appetite'], category: 'daily' };
  if (/\b(?:weather|rain|raining|cold|chilly|hot|snow|snowing|sunny|windy)\b/i.test(t)) return { reply: 'The weather can change how we feel. Please keep warm and take a jacket.', quickReplies: ['Thank you', 'Let me see an old photo'], category: 'daily' };
  if (/\b(?:thank|thanks)\b/i.test(t)) return { reply: "You're very welcome. I truly enjoy talking with you.", quickReplies: ['Let me see an old photo', "Let's talk again"], category: 'daily' };
  if (/\b(?:hello|hi|hey|good morning|good afternoon|good evening)\b/i.test(t)) return { reply: 'Hello! It is so nice to see you today.', quickReplies: ['Let me see an old photo', "How's the weather?"], category: 'daily' };
  const echo = t.length > 0 && t.length <= 40 ? `"${t.replace(/[.!?]+$/, '')}," you said.` : 'I see.';
  return { reply: `${echo} ${pickBy(t, ["Please tell me more, I'm listening.", 'Take your time.', 'How did that feel?'])}`, quickReplies: ['Let me see an old photo', "I'm just bored", "I'm fine"], category: 'daily' };
}

export { capitalize, PRIVACY_LABELS_EN };
