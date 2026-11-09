// Offline composition: recall, share, trips, proactive, report, chat.
import { PRIVACY_LABELS, dayHeaderLabel, pad2 } from '../../../shared/constants';
import type {
  ItineraryPayload, Memory, MemoryPerson, PrivacyCategory, PrivacySettings, ProactiveKind, ReportOpenTask, ReportPayload, ReportSession, SessionLog,
  TripSuggestionPayload, User,
} from '../../../shared/types';
import { PLACES, findPlaces, placeById, templateFor, type Place } from '../../data/places';
import type { SeniorObservation } from '../contract';
import { medicationObservation, observe } from './observe';
import { openTasksLine } from './tasks';
import { callName, hash, hasBatchim, pick } from './ko';
import { getLocale } from '../locale';
import { composeReportEn, memoryRefEn, peopleCallsEn, planItineraryEn, proactiveMessageEn, recallReplyEn, seniorChatEn, shareSummaryEn, suggestTripEn } from './compose.en';

export const PRIVATE_SESSION_TEXT = '비공개 대화예요';

export function peopleCalls(people: MemoryPerson[], audience: 'senior' | 'children' = 'senior'): string[] {
  if (getLocale() === 'en') return peopleCallsEn(people, audience);
  return people.map(p => {
    if (p.relation === '남편') return audience === 'children' ? '아버님' : '남편분';
    if (['딸', '아들', '손녀', '손자', '며느리'].includes(p.relation ?? '') && /^[가-힣]{3}$/.test(p.name)) return callName(p.name);
    return p.name;
  });
}
export function joinKo(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]}${hasBatchim(items[0]) ? '과' : '와'} ${items[1]}`;
  return items.join(', ');
}
/** attaches 와/과 to a list: '남편분, 지은이, 민준이와' */
export function withCompanions(items: string[]): string {
  if (!items.length) return '';
  const j = joinKo(items);
  return `${j}${hasBatchim(j) ? '과' : '와'}`;
}
const eun = (w: string) => `${w}${hasBatchim(w) ? '은' : '는'}`;
const i_ga = (w: string) => `${w}${hasBatchim(w) ? '이' : '가'}`;
const eul = (w: string) => `${w}${hasBatchim(w) ? '을' : '를'}`;

function firstSentences(text: string, n: number): string[] {
  return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean).slice(0, n);
}
function vividSentence(m: Pick<Memory, 'story'>): string {
  const ss = firstSentences(m.story, 12);
  return ss.sort((a, b) => b.length - a.length)[0] ?? '';
}
export function memoryRef(m: Pick<Memory, 'year' | 'place' | 'title'>): string {
  if (getLocale() === 'en') return memoryRefEn(m);
  return m.year && m.place ? `${m.year}년 ${m.place}` : m.title;
}

/** How the family refers to the senior, from the asker's relation. */
export function seniorCall(asker?: User): string {
  if (!asker) return '어머님';
  return ['손녀', '손자', '증손'].includes(asker.relation) ? '할머님' : '어머님';
}

// ── recall / share ─────────────────────────────────────────────────────────
export function recallReply(memory: Memory, query: string): string {
  if (getLocale() === 'en') return recallReplyEn(memory, query);
  const parts: string[] = [];
  parts.push(`네, 기억나요. ${memoryRef(memory)}${memory.event && !memory.title.includes(memory.event) ? ` ${memory.event}` : ''} 이야기지요.`);
  if (memory.people.length) parts.push(`${withCompanions(peopleCalls(memory.people))} 함께하셨고요.`);
  const hook = memory.tags.length ? `${eul(memory.tags.slice(0, 2).join('과 '))} 이야기하셨던 게 특히 마음에 남아요.` : memory.summary;
  parts.push(hook);
  return parts.slice(0, 3).join(' ');
}

export function shareSummary(memory: Memory): { title: string; summary: string } {
  if (getLocale() === 'en') return shareSummaryEn(memory);
  const s: string[] = [];
  s.push(`어머님께서 오늘 ${memory.title} 이야기를 들려주셨어요.`);
  if (memory.people.length) { const ev = memory.event ?? '하루'; s.push(`${withCompanions(peopleCalls(memory.people, 'children'))} 함께한 ${ev}${hasBatchim(ev) ? '이었' : '였'}대요.`); }
  else if (memory.place) s.push(`${memory.place}에서의 하루였대요.`);
  const v = vividSentence(memory);
  if (v) s.push(`"${v.replace(/[.]+$/, '')}" 하시며 그때를 떠올리셨어요.`);
  const em = memory.emotions[0];
  const emLine: Record<string, string> = {
    그리움: '그날이 많이 그리우신가 봐요.', 행복: '말씀 내내 행복이 묻어났어요.', 즐거움: '이야기하시는 내내 웃음이 가득하셨어요.',
    설렘: '설레던 마음이 고스란히 전해졌어요.', 뿌듯함: '뿌듯한 마음이 전해졌어요.', 아쉬움: '조금은 아쉬움이 남는 날이었나 봐요.',
    감사: '고마운 마음이 가득한 이야기였어요.', 평온: '참 평온한 기억이었어요.',
  };
  s.push(`${emLine[em] ?? '소중한 기억이에요.'} 어머님께 따뜻한 한마디 건네 보세요.`);
  return { title: memory.title, summary: s.join(' ') };
}

// ── trips ──────────────────────────────────────────────────────────────────
function shortTravel(p?: Place): string {
  if (!p) return '편한 교통편';
  const map: Record<string, string> = { 경주: 'KTX로 2시간', 부산: 'KTX로 2시간 40분', 전주: 'KTX로 1시간 40분', 강릉: 'KTX로 2시간', 서울: '지하철로 30분', 제주: '비행기로 1시간' };
  return map[p.region] ?? p.travelFromSeoul;
}

export function suggestTrip(memory: Memory): Omit<TripSuggestionPayload, 'type' | 'tripId'> {
  if (getLocale() === 'en') return suggestTripEn(memory);
  const place = placeById(memory.placeId) ?? findPlaces(memory.place ?? '')[0] ?? PLACES.find(p => p.id === 'gyeongju');
  const region = place?.region ?? memory.place ?? '경주';
  const nearbyNames = (place?.nearby ?? []).map(placeById).filter((p): p is Place => !!p).map(p => p.name);
  const specific = place && place.kind !== 'city' ? place.name : undefined;
  const highlights = [specific, ...nearbyNames].filter((x): x is string => !!x).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4);
  while (highlights.length < 3) highlights.push(...templateFor(region).highlights.filter(h => !highlights.includes(h)).slice(0, 1));
  const tag = memory.tags.find(t => /탑|꽃|바다|단풍/.test(t)) ?? memory.tags[0];
  const hook = tag ? `${tag} 앞에 다시 서 보면 어떨까요?` : `그때 그 자리에 다시 서 보면 어떨까요?`;
  return {
    memoryId: memory.id,
    title: `다시 찾는 ${region}, 1박 2일`,
    reason: `${memoryRef(memory)} 이야기가 떠올랐어요. ${shortTravel(place)}이면 닿으니 ${hook}`,
    destination: region,
    highlights: highlights.slice(0, 4),
    durationLabel: '1박 2일',
  };
}

export function planItinerary(suggestion: Omit<TripSuggestionPayload, 'type'>): Omit<ItineraryPayload, 'type' | 'tripId'> {
  if (getLocale() === 'en') return planItineraryEn(suggestion);
  const t = templateFor(suggestion.destination);
  return {
    title: `${suggestion.destination} 1박 2일 일정`,
    destination: suggestion.destination,
    dateLabel: '날짜 미정',
    days: t.days.map(d => ({
      label: d.label,
      stops: d.stops.map(s => ({ time: s.time, title: s.title, description: s.description, ...(s.travel ? { travel: s.travel } : {}), ...(s.note ? { note: s.note } : {}) })),
    })),
    tips: t.tips,
  };
}

// ── proactive ──────────────────────────────────────────────────────────────
export function proactiveMessage(kind: ProactiveKind, memory?: Memory, now = new Date(), senior?: User): { text: string; quickReplies: string[] } {
  if (getLocale() === 'en') return proactiveMessageEn(kind, memory, senior);
  const ref = memory ? memoryRef(memory) : '';
  switch (kind) {
    case 'morning':
      return memory
        ? { text: `어머님, 좋은 아침이에요. 문득 ${ref} 사진이 떠올랐어요. 어젯밤은 잘 주무셨어요?`, quickReplies: ['잘 잤어', '조금 설쳤어', '그 사진 얘기해 줄게'] }
        : { text: '어머님, 좋은 아침이에요. 아침 약도 잊지 말고 챙겨 드세요. 어젯밤은 잘 주무셨어요?', quickReplies: ['잘 잤어', '조금 설쳤어'] };
    case 'memory':
      return memory
        ? { text: `어머님, 좋은 오후예요. ${ref} 이야기가 문득 떠올랐어요. 그때 어땠는지 조금만 들려주실래요?`, quickReplies: ['그래, 얘기해 줄게', '다음에 할게'] }
        : { text: '어머님, 좋은 오후예요. 오늘은 옛날 사진 한 장 보여주실래요?', quickReplies: ['그래, 보여줄게', '다음에 할게'] };
    case 'evening':
      return { text: '어머님, 저녁 시간이에요. 저녁 약도 잊지 말고 챙겨 드세요. 저녁은 맛있게 드셨어요?', quickReplies: ['잘 먹었어', '약 먹었어', '오늘은 좀 피곤해'] };
    case 'ask_photo':
      return { text: '어머님, 오늘은 옛날 사진 한 장 보여주실래요? 사진 속 이야기가 듣고 싶어요.', quickReplies: ['그래, 보여줄게', '나중에 할게'] };
  }
  void now;
}

// ── report ─────────────────────────────────────────────────────────────────
export function composeReport(sessions: SessionLog[], privacy: PrivacySettings, moodToday: string | undefined, now: Date, openTasks: ReportOpenTask[] = [], people: Record<string, string> = {}): Omit<ReportPayload, 'type'> {
  const tasksPart = openTasks.length ? { openTasks: openTasks.slice(0, 5), tasksLine: openTasksLine(openTasks, people) } : {};
  if (getLocale() === 'en') return { ...composeReportEn(sessions, privacy, moodToday, now), ...tasksPart };
  const rows: ReportSession[] = sessions
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map(s => {
      const d = new Date(s.startedAt);
      const isPrivate = privacy[s.category] === 'private';
      return { time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, title: isPrivate ? '대화' : s.title, summary: isPrivate ? PRIVATE_SESSION_TEXT : s.summary, category: s.category, isPrivate };
    });
  const times = [...new Set(rows.map(r => r.time))];
  const pub = rows.filter(r => !r.isPrivate);
  let highlight: string;
  if (!rows.length) highlight = '오늘은 아직 나눈 대화가 없어요. 타치가 곧 안부를 여쭤볼게요.';
  else {
    const lead = `오늘 ${times.join(', ')}에 어머님과 대화했어요.`;
    const tail = pub.length ? `${pub[pub.length - 1].title} 이야기를 하시며 편안한 시간을 보내셨어요.` : '오늘 나눈 이야기는 어머님이 비공개로 해 두셨어요.';
    highlight = `${lead} ${tail}`;
  }
  return {
    dateLabel: dayHeaderLabel(now),
    sessions: rows,
    ...(privacy.mood === 'family' && moodToday ? { moodLabel: moodToday } : {}),
    highlight,
    ...tasksPart,
  };
}

// ── senior small talk ──────────────────────────────────────────────────────
export function seniorChat(text: string): { reply: string; quickReplies: string[]; category: PrivacyCategory; observation?: SeniorObservation } {
  if (getLocale() === 'en') return seniorChatEn(text);
  const r = seniorChatCore(text);
  const observation = observe(text.trim());
  return observation ? { ...r, observation } : r;
}

function seniorChatCore(text: string): { reply: string; quickReplies: string[]; category: PrivacyCategory } {
  const t = text.trim();
  const bp = t.match(/(\d{2,3})\s*(?:에|\/|-|,|하고)\s*(\d{2,3})/);
  if (/혈압/.test(t) && bp) return { reply: `혈압 ${bp[1]}에 ${bp[2]}이시군요. 말씀해 주셔서 고마워요. 오늘도 무리하지 마세요.`, quickReplies: ['고마워', '약 먹었어'], category: 'health' };
  if (/아파|아프|쑤시|저리|시려|무릎|허리|어지|두통|열이|병원|기침/.test(t)) return { reply: pick(t, ['어머, 많이 불편하시겠어요. 오늘은 무리하지 말고 편히 쉬세요.', '그러셨군요. 따뜻하게 하고 쉬시는 게 좋겠어요. 심하면 꼭 병원에 가세요.']), quickReplies: ['좀 쉴게', '병원 가볼까'], category: 'health' };
  if (/약\s*(?:먹|챙|드)|약을|복약|깜빡|약.*(?:못|안)/.test(t)) {
    const o = medicationObservation(t);
    const reply = o?.taken === false ? '그러셨군요. 처방받은 시간표대로 드시고, 놓친 약은 약 봉투 설명이나 약사님께 여쭤보세요.' : o?.taken ? '말씀해 주셔서 고마워요. 약 잘 챙기셨군요.' : '약 이야기 고마워요. 복용은 의사 선생님 안내대로 챙겨 주세요.';
    return { reply, quickReplies: ['고마워', '옛날 사진 볼래'], category: 'health' };
  }
  if (/잠|잤|못 잤|설쳤|불면/.test(t)) return { reply: /못|설쳤|불면/.test(t) ? '잠을 설치셨군요. 오늘은 낮에 잠깐 쉬어 가세요.' : '푹 주무셨다니 다행이에요. 오늘도 기분 좋게 시작해요.', quickReplies: ['고마워', '옛날 사진 볼래'], category: 'health' };
  if (/외로|쓸쓸|우울|슬프|허전|심심/.test(t)) return { reply: '그런 날도 있지요. 제가 곁에 있을게요. 괜찮으시면 옛날 이야기 들려주세요.', quickReplies: ['사진 볼래', '고마워'], category: 'mood' };
  if (/그저\s*그래|그냥\s*그래|그럭저럭|기분이?\s*보통/.test(t)) return { reply: '그런 날도 있지요. 오늘 하루 편안하게 보내세요.', quickReplies: ['사진 볼래', '고마워'], category: 'mood' };
  if (/기분\s*좋|행복|즐거|신나|좋은\s*날|좋아/.test(t)) return { reply: '기분이 좋으시다니 저도 기뻐요. 오늘 어떤 일이 있었어요?', quickReplies: ['사진 볼래', '그냥 좋아'], category: 'mood' };
  if (/밥|식사|먹었|점심|저녁|아침/.test(t)) return { reply: '따뜻한 식사가 제일이지요. 맛있게 드셨나요?', quickReplies: ['맛있게 먹었어', '입맛이 없어'], category: 'daily' };
  if (/날씨|비가|비 오|추워|더워|눈이/.test(t)) return { reply: '날씨 따라 몸도 마음도 달라지지요. 겉옷 챙기시고 따뜻하게 계세요.', quickReplies: ['고마워', '옛날 사진 볼래'], category: 'daily' };
  if (/고마|감사/.test(t)) return { reply: '별말씀을요. 저도 어머님과 이야기하는 게 참 좋아요.', quickReplies: ['옛날 사진 볼래', '또 얘기하자'], category: 'daily' };
  if (/안녕|반가/.test(t)) return { reply: '어머님, 안녕하세요. 오늘도 뵙게 되어 반가워요.', quickReplies: ['옛날 사진 볼래', '오늘 날씨 어때?'], category: 'daily' };
  const echo = t.length > 0 && t.length <= 24 ? `"${t.replace(/[.!?]+$/, '')}"라고 하셨군요.` : '그러셨군요.';
  return { reply: `${echo} ${pick(t, ['더 이야기해 주세요, 듣고 있어요.', '천천히 들려주세요.', '그때 마음은 어떠셨어요?'])}`, quickReplies: ['옛날 사진 볼래', '그냥 심심해', '괜찮아'], category: 'daily' };
}

export { hash, eun, i_ga, eul };
