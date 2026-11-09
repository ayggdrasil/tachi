// Offline interview + memory extraction.
import type { Memory, MemoryPerson, User } from '../../../shared/types';
import type { ExtractedMemory, InterviewSlot, InterviewState, InterviewTurn } from '../contract';
import { analyze, callName, hasBatchim, pick, type Analysis } from './ko';
import { withCompanions } from './compose';
import { getLocale } from '../locale';
import { capitalize, firstName, listEn } from './en';
import { placeTitleEn } from './compose.en';

export const SLOT_ORDER: InterviewSlot[] = ['when', 'where', 'who', 'story'];

export const SLOT_QUESTION: Record<InterviewSlot, string> = {
  when: '이 사진은 언제쯤 찍으신 거예요?',
  where: '어디에서 찍으신 거예요?',
  who: '누구와 함께 계셨어요?',
  story: '그날 가장 기억나는 일이 있으세요?',
};
export const SLOT_CHIPS: Record<InterviewSlot, string[]> = {
  when: ['70년대쯤', '80년대쯤', '잘 기억이 안 나요'],
  where: ['경주', '부산 바닷가', '서울'],
  who: ['남편이랑', '아이들이랑', '친구들이랑'],
  story: ['그냥 즐거웠어', '잘 기억이 안 나'],
};
const SLOT_QUESTION_EN: Record<InterviewSlot, string> = {
  when: 'About when was this photo taken?',
  where: 'Where was it taken?',
  who: 'Who was with you?',
  story: 'Is there something from that day you remember most?',
};
const SLOT_CHIPS_EN: Record<InterviewSlot, string[]> = {
  when: ['Sometime in the 70s', 'Sometime in the 80s', "I don't remember"],
  where: ['Gyeongju', 'The beach in Busan', 'Seoul'],
  who: ['With my husband', 'With the kids', 'With friends'],
  story: ['It was just fun', "I don't remember much"],
};
export const FINAL_REPLY_EN = "What a precious story. I'll keep it safe as a memory.";
export const START_REPLY_EN = "Oh, what a lovely photo you've shared. About when was this photo taken?";
export const slotQuestion = (slot: InterviewSlot): string => (getLocale() === 'en' ? SLOT_QUESTION_EN : SLOT_QUESTION)[slot];
export const slotChips = (slot: InterviewSlot): string[] => (getLocale() === 'en' ? SLOT_CHIPS_EN : SLOT_CHIPS)[slot];

export const FINAL_REPLY = '정말 소중한 이야기예요. 추억으로 잘 담아 둘게요.';
export const START_REPLY = '어머, 귀한 사진을 보여주셨네요. 이 사진은 언제쯤 찍으신 거예요?';

export function freshState(input: { memoryId: string; photoUrl: string; photoPath?: string }): InterviewState {
  return { memoryId: input.memoryId, photoUrl: input.photoUrl, photoPath: input.photoPath, asked: [], answers: [], filled: {}, done: false };
}

export function startTurn(input: { memoryId: string; photoUrl: string; photoPath?: string }, observation?: string): InterviewTurn {
  const state = freshState(input);
  state.asked = ['when'];
  if (observation) state.photoObservation = observation;
  const en = getLocale() === 'en';
  const reply = observation ? `${observation} ${slotQuestion('when')}` : en ? START_REPLY_EN : START_REPLY;
  return { reply, quickReplies: slotChips('when'), state, done: false };
}

export function allText(state: InterviewState): string {
  return state.answers.map(a => a.text).join(' ');
}

/** Combine analysis of every answer (later answers override earlier scalars; people union). */
export function analyzeAll(state: InterviewState): Analysis {
  const a = analyze(allText(state));
  return a;
}

export function personCall(p: MemoryPerson): string {
  if (p.relation === '남편') return '남편분';
  if (['딸', '아들', '손녀', '손자', '며느리'].includes(p.relation ?? '') && /^[가-힣]{3}$/.test(p.name)) return callName(p.name);
  return p.name;
}
function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return items.join(', ');
}

export function whenLabelEn(a: Pick<Analysis, 'year' | 'era' | 'season'>, cap = true): string {
  const raw = a.year ? `${a.season ? `${a.season} ` : ''}${a.year}` : a.era ? `${a.season ? `${a.season} in the ` : 'the '}${a.era}` : a.season ?? '';
  return cap ? capitalize(raw) : raw;
}
export function personCallEn(p: MemoryPerson): string {
  if (['The kids', 'Friends', 'Classmates', 'In-laws', 'Neighbors'].includes(p.name)) return `your ${p.name.replace(/^The /, '').toLowerCase()}`;
  return firstName(p.name);
}
function ackForEn(prev: Analysis, now: Analysis, slot: InterviewSlot | 'extra', text: string): string {
  const when = whenLabelEn(now);
  const prevWhen = prev.year ?? prev.era;
  const newWhen = !prevWhen && (now.year ?? now.era);
  const newWhere = !prev.place && now.place;
  const newPeople = now.people.filter(p => !prev.people.some(q => q.name === p.name));
  if (newWhen && newWhere) return `${when}, ${now.place}. How lovely.`;
  if (newWhen) return `${when}, I see.`;
  if (newWhere) return `So it was ${now.place}.`;
  if (newPeople.length) return `With ${listEn(newPeople.map(personCallEn))}. How lovely.`;
  if (/don'?t (?:really )?remember|can'?t remember|not sure|no idea|forgot|hard to recall/i.test(text)) return "That's alright, take your time.";
  if (slot === 'when' && now.season) return `${capitalize(now.season)}, I see.`;
  return pick(text, ['I see.', 'Of course.', 'Oh, I see.']);
}

function ackFor(prev: Analysis, now: Analysis, slot: InterviewSlot | 'extra', text: string): string {
  if (getLocale() === 'en') return ackForEn(prev, now, slot, text);
  const parts: string[] = [];
  const when = now.year ? `${now.year}년${now.season ? ` ${now.season}` : ''}` : now.era ? `${now.era}${now.season ? ` ${now.season}` : ''}` : now.season ?? '';
  const prevWhen = prev.year ?? prev.era;
  const newWhen = !prevWhen && (now.year ?? now.era);
  const newWhere = !prev.place && now.place;
  const newPeople = now.people.filter(p => !prev.people.some(q => q.name === p.name));
  if (newWhen && newWhere) return `${when}, ${now.place}였군요.`;
  if (newWhen) return `${when}이었군요.`;
  if (newWhere) return `${now.place}였군요.`;
  if (newPeople.length) {
    const calls = newPeople.map(personCall);
    const last = calls[calls.length - 1];
    return `${listJoin(calls)}${hasBatchim(last) ? '과' : '와'} 함께였군요.`;
  }
  if (/기억이 안|기억 안|모르겠|글쎄|잘 몰/.test(text)) return '괜찮아요, 천천히 떠올려 봐요.';
  if (slot === 'when' && now.season) return `${now.season}이었군요.`;
  return pick(text, ['그렇군요.', '네, 알겠어요.', '아, 그랬군요.']);
}

export function nextTurn(state: InterviewState, answer: string): InterviewTurn {
  const prevAnalysis = analyzeAll(state);
  const lastAsked = state.asked[state.asked.length - 1];
  const answeredSlots = state.answers.filter(a => a.slot !== 'extra').length;
  const slot: InterviewSlot | 'extra' = lastAsked && answeredSlots < state.asked.length ? lastAsked : 'extra';
  const s: InterviewState = { ...state, asked: [...state.asked], answers: [...state.answers, { slot, text: answer }], filled: { ...state.filled } };
  const a = analyzeAll(s);
  const answeredSlot = (x: InterviewSlot) => s.answers.some(r => r.slot === x);
  s.filled.when = !!(a.year || a.era) || answeredSlot('when');
  s.filled.where = !!a.place || answeredSlot('where');
  s.filled.who = a.people.length > 0 || answeredSlot('who');
  s.filled.story = answeredSlot('story');
  const next = SLOT_ORDER.find(x => !s.filled[x] && !s.asked.includes(x));
  if (s.filled.story || !next || s.asked.length >= 4 && answeredSlots + 1 >= 4) {
    s.done = true;
    return { reply: getLocale() === 'en' ? FINAL_REPLY_EN : FINAL_REPLY, quickReplies: [], state: s, done: true };
  }
  s.asked.push(next);
  const ack = ackFor(prevAnalysis, a, slot, answer);
  return { reply: `${ack} ${slotQuestion(next)}`, quickReplies: slotChips(next), state: s, done: false };
}

/** Which slot to ask for the *next* turn if we had to — used to steer the LLM. */
export function planNext(state: InterviewState, answer: string): { turn: InterviewTurn; nextSlot?: InterviewSlot } {
  const turn = nextTurn(state, answer);
  const nextSlot = turn.done ? undefined : turn.state.asked[turn.state.asked.length - 1];
  return { turn, nextSlot };
}

// ── extraction ─────────────────────────────────────────────────────────────
function polite(sentence: string): string {
  let t = sentence.trim().replace(/[.!~]+$/, '');
  if (!t) return '';
  if (/(?:요|다|니다|까|죠)$/.test(t)) return t + '.';
  if (/(?:때|날|곳|거|것|데)야$/.test(t)) t = t.replace(/야$/, '예요');
  else if (/이야$/.test(t)) t = t.replace(/이야$/, '이에요');
  else if (/[았었였겠했갔왔]어$/.test(t)) t += '요';
  else if (/[았었였겠했갔왔]지$/.test(t)) t += '요';
  else if (/네$/.test(t)) t += '요';
  else if (/지$/.test(t)) t += '요';
  else if (/(?:어|아|해)$/.test(t)) t += '요';
  return t + '.';
}

function cleanStory(state: InterviewState, a: Analysis): string {
  const chunks = state.answers
    .map(r => r.text.trim())
    .filter(t => t && !/^(잘 기억이 안 나요?|그냥 즐거웠어|\d+년대쯤)$/.test(t));
  const sentences = chunks.map(c => (/[.!?]$/.test(c) ? c : c + '.')).join(' ').split(/(?<=[.!?])\s+|\n+/).map(polite).filter(Boolean);
  return sentences.join(' ') || `${a.place ?? '그곳'}에서의 소중한 하루였어요.`;
}

const CHIP_ANSWER_EN = /^(?:I don'?t (?:really )?remember(?: much)?|It was just fun|Sometime in the \d0s|I don'?t know)[.!]?$/i;
const TRIP_EVENTS = new Set(['family trip', 'school trip', 'trip', 'outing', 'summer vacation', 'honeymoon']);
function cleanStoryEn(state: InterviewState, a: Analysis): string {
  const chunks = state.answers.map(r => r.text.trim()).filter(t => t && !CHIP_ANSWER_EN.test(t));
  const sentences = chunks.map(c => (/[.!?]$/.test(c) ? c : c + '.')).join(' ').split(/(?<=[.!?])\s+|\n+/).map(x => x.trim()).filter(Boolean).map(x => capitalize(x.replace(/\s+/g, ' ')));
  return sentences.join(' ') || `It was a precious day at ${a.place ?? 'that place'}.`;
}
function extractFromStateEn(state: InterviewState): ExtractedMemory {
  const text = allText(state);
  const a = analyze(text);
  const people = a.people;
  const event = a.event;
  const whenLabel = whenLabelEn(a);
  const placeTitle = a.place ? placeTitleEn(a.place) : '';
  const prep = event && TRIP_EVENTS.has(event) && event !== 'honeymoon' ? 'to' : 'at';
  let tail = '';
  if (event && placeTitle) tail = `${event} ${event === 'honeymoon' ? 'in' : prep} ${placeTitle}`;
  else if (event) tail = event;
  else if (placeTitle) tail = placeTitle;
  let title: string;
  if (whenLabel && tail) title = `${whenLabel}, ${tail}`;
  else if (whenLabel) title = whenLabel;
  else if (tail) title = capitalize(tail);
  else title = 'A treasured old photo story';
  const story = cleanStoryEn(state, a);
  const who = people.length ? ` with ${listEn(people.map(p => (p.relation === 'husband' ? `her husband ${firstName(p.name)}` : personCallEn(p))))}` : '';
  const art = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');
  const subject = event ? `${art(event)} ${event}` : 'a cherished day';
  const summary = `A story of ${subject}${a.place ? ` ${event && TRIP_EVENTS.has(event) && event !== 'honeymoon' ? 'to' : 'at'} ${a.place}` : ''}${whenLabel ? ` in ${whenLabelEn(a, false)}` : ''}${who}.`.replace(/\s+/g, ' ');
  return {
    title, story, summary,
    year: a.year, era: a.era, season: a.season, place: a.place, placeId: a.placeId,
    people, event, emotions: a.emotions, tags: a.topics,
  };
}

export function extractFromState(state: InterviewState): ExtractedMemory {
  if (getLocale() === 'en') return extractFromStateEn(state);
  const text = allText(state);
  const a = analyze(text);
  const people = a.people;
  // The senior herself is not listed; ensure family trip defaults sensible
  const event = a.event;
  const whenLabel = a.year ? `${a.year}년${a.season ? ` ${a.season}` : ''}` : a.era ? `${a.era}${a.season ? ` ${a.season}` : ''}` : a.season ?? '';
  let title: string;
  if (a.place || whenLabel) {
    title = `${whenLabel}${whenLabel && (a.place || event) ? ', ' : ''}${a.place ?? ''}${event ? `${a.place ? ' ' : ''}${event}` : ''}`.trim();
  } else title = event ? `소중한 ${event} 기억` : '소중한 옛 사진 이야기';
  const story = cleanStory(state, a);
  const who = people.length ? `${withCompanions(people.map(p => (p.relation && p.relation !== p.name ? `${p.relation} ${p.name}` : p.name)))} 함께한 ` : '';
  const summary = `${whenLabel ? whenLabel + ' ' : ''}${a.place ? a.place + '에서 ' : ''}${who}${event ?? '추억'} 이야기예요.`.replace(/\s+/g, ' ');
  return {
    title, story, summary,
    year: a.year, era: a.era, season: a.season, place: a.place, placeId: a.placeId,
    people, event, emotions: a.emotions, tags: a.topics,
  };
}

export type { Memory, User };
