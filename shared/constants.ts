// Shared constants & pure helpers (server + web). FROZEN API — additive changes only.
import type { Contact, Locale, MessageKind, ModelKey, PrivacyCategory, PrivacySettings, ProactiveKind, ProviderKind, Slot, User } from './types';

export const TACHI_ID = 'tachi';
export const SENIOR_ID = 'mom';
export const SYSTEM_ID = 'system';
export const FAMILY_ROOM_ID = 'room-family';
export const SENIOR_ROOM_ID = 'room-tachi-mom';

export const USERS: User[] = [
  { id: 'mom', name: '김순자', shortName: '어머니', role: 'senior', relation: '본인', phone: '010-2384-1947', initials: '순', isBot: true,
    persona: '78세. 서울 마포 거주. 남편 박영수(2019년 작고). 경주가 고향 근처라 정이 많음. 느긋하고 다정한 말투.' },
  { id: 'jieun', name: '김지은', shortName: '지은', role: 'family', relation: '딸', phone: '010-5521-0384', initials: '지', isBot: true,
    persona: '49세 큰딸. 서울 직장인. 다정하고 꼼꼼함. 엄마 건강을 제일 챙김. 존댓말과 반말을 섞어 엄마에게 말함.' },
  { id: 'minjun', name: '박민준', shortName: '민준', role: 'family', relation: '아들', phone: '010-7710-2290', initials: '민', isBot: true,
    persona: '46세 아들. 대전 거주. 말수 적지만 실행력 있음. 짧게 말함. 운전/예약 담당을 자처.' },
  { id: 'suyeon', name: '이수연', shortName: '수연', role: 'family', relation: '며느리', phone: '010-3349-8812', initials: '수', isBot: true,
    persona: '44세 며느리. 센스 있고 맛집·숙소를 잘 찾음. 밝고 공손한 말투.' },
  { id: 'harin', name: '박하린', shortName: '하린', role: 'family', relation: '손녀', phone: '010-9031-4456', initials: '하', isBot: true,
    persona: '17세 손녀. 할머니 바라기. 발랄하고 짧게 말함. "ㅋㅋ", "할머니 최고" 같은 표현. 이모지는 쓰지 않음.' },
  { id: 'tachi', name: '타치', shortName: '타치', role: 'ai', relation: 'AI', phone: '', initials: 'T', isBot: true,
    persona: '시니어의 기억을 함께 지키는 따뜻한 AI 동반자.' },
];

/** Virtual phonebook (mom's contacts). userId links to an existing user. */
export const CONTACTS: Contact[] = [
  { id: 'c-jieun', name: '김지은', relation: '딸', phone: '010-5521-0384', userId: 'jieun' },
  { id: 'c-minjun', name: '박민준', relation: '아들', phone: '010-7710-2290', userId: 'minjun' },
  { id: 'c-suyeon', name: '이수연', relation: '며느리', phone: '010-3349-8812', userId: 'suyeon' },
  { id: 'c-harin', name: '박하린', relation: '손녀', phone: '010-9031-4456', userId: 'harin' },
  { id: 'c-donghyun', name: '박동현', relation: '손자', phone: '010-4402-7731', userId: null },
  { id: 'c-younghee', name: '김영희', relation: '여동생', phone: '010-6618-2093', userId: null },
  { id: 'c-cheolsu', name: '박철수', relation: '조카', phone: '010-2275-6640', userId: null },
  { id: 'c-jungsook', name: '최정숙', relation: '친구', phone: '010-8830-1152', userId: null },
  { id: 'c-misook', name: '이미숙', relation: '친구', phone: '010-1934-5578', userId: null },
  { id: 'c-sangho', name: '정상호', relation: '사위', phone: '010-5067-3381', userId: null },
  { id: 'c-clinic', name: '마포 연세내과', relation: '주치의', phone: '02-332-1188', userId: null },
  { id: 'c-church', name: '서교동 노인정', relation: '이웃', phone: '02-338-4410', userId: null },
];

/** Family members in the seeded family room (besides tachi). harin is NOT in it initially (invite demo). */
/** Relations treated as kin: only kin may receive the senior's shared health/memory details (friends, neighbours, the clinic may not). */
export const KIN_RELATIONS = ['본인', '딸', '아들', '며느리', '사위', '손녀', '손자', '여동생', '남동생', '언니', '오빠', '형', '누나', '조카'];

export const SEED_FAMILY_ROOM_MEMBERS = ['mom', 'jieun', 'minjun', 'suyeon', TACHI_ID];

export const PRIVACY_LABELS: Record<PrivacyCategory, { label: string; description: string }> = {
  health: { label: '건강 정보', description: '혈압, 복약, 수면, 걸음 수' },
  memory: { label: '추억 이야기', description: '사진과 함께 나눈 옛이야기' },
  daily: { label: '일상 대화', description: '안부, 소소한 수다' },
  mood: { label: '기분', description: '오늘의 기분과 컨디션' },
  trip: { label: '여행·나들이', description: '타치가 제안한 여행 계획' },
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  health: 'family',
  memory: 'family',
  daily: 'private',
  mood: 'family',
  trip: 'family',
};

export interface ModelOptionDef { key: ModelKey; label: string; provider: ProviderKind; defaultModelId: string; env: string }

export const MODEL_DEFS: ModelOptionDef[] = [
  { key: 'claude-sonnet', label: 'Claude Sonnet 5.5', provider: 'anthropic', defaultModelId: 'claude-sonnet-5-5', env: 'TACHI_MODEL_CLAUDE_SONNET' },
  { key: 'claude-haiku', label: 'Claude Haiku 5.5', provider: 'anthropic', defaultModelId: 'claude-haiku-5-5', env: 'TACHI_MODEL_CLAUDE_HAIKU' },
  { key: 'gpt-terra', label: 'ChatGPT Terra', provider: 'openai', defaultModelId: 'gpt-6.1-terra', env: 'TACHI_MODEL_GPT_TERRA' },
  { key: 'gpt-luna', label: 'ChatGPT Luna', provider: 'openai', defaultModelId: 'gpt-6-luna', env: 'TACHI_MODEL_GPT_LUNA' },
  { key: 'demo', label: '데모 브레인', provider: 'mock', defaultModelId: '', env: '' },
];

export const PROACTIVE_SCHEDULE: { time: string; kind: ProactiveKind; label: string }[] = [
  { time: '09:00', kind: 'morning', label: '아침 안부' },
  { time: '14:00', kind: 'memory', label: '추억 이야기' },
  { time: '19:30', kind: 'evening', label: '저녁 인사' },
];
export const DAILY_REPORT_TIME = '21:00';

/**
 * To-do follow-up policy (demo-clock minutes). An open task with an assignee is followed up politely:
 * 1) reminder DM `firstAfterMin` after it got an owner (or 24h before its due time, whichever is earlier),
 * 2) a second nudge `repeatAfterMin` later, 3) `escalateAfterMin` later Tachi tells the family room it is still open and offers
 * to reassign. '나중에' postpones the next step by `snoozeMin`; '도움 필요' escalates right away; done stops everything.
 */
export const TASK_FOLLOWUP = { firstAfterMin: 120, repeatAfterMin: 240, escalateAfterMin: 240, snoozeMin: 180, dueLeadMin: 1440, maxLevel: 3 } as const;

/** Default lead times used when Tachi derives a task's due time from a confirmed gathering slot. */
export const TASK_DUE = { bookingLeadDays: 3, otherLeadDays: 1, undatedDays: 3 } as const;

export const TASK_STATUS_LABEL: Record<'todo' | 'in_progress' | 'done' | 'blocked', string> = {
  todo: '할 일', in_progress: '진행 중', done: '완료', blocked: '도움 필요',
};

/** Deterministic bot availability preferences by slot index (see buildCandidateSlots). Intersection → index 2. */
export const BOT_SLOT_PREFS: Record<string, number[]> = {
  mom: [0, 1, 2, 3, 4, 5],
  jieun: [0, 2, 3, 5],
  minjun: [2, 3, 4],
  suyeon: [2, 3, 5],
  harin: [1, 2, 3],
};

// ── Date helpers (Korean labels, local time) ────────────────────────────────
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function pad2(n: number): string { return String(n).padStart(2, '0'); }

/** '11월 22일(일)' */
export function dateLabel(d: Date): string { return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`; }

/** '11월 9일 (월)' */
export function dayHeaderLabel(d: Date): string { return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; }

/** '14:05' */
export function timeLabel(d: Date): string { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

/** '오후 2:05' — friendlier for seniors */
export function koreanTime(d: Date): string {
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${hh}:${pad2(d.getMinutes())}`;
}

/**
 * Candidate slots for gathering polls: the next two weekends (from `now`, skipping the current weekend
 * if it's already Friday or later) → Sat 12:00, Sat 18:00, Sun 12:00, Sun 18:00, next Sat 12:00, next Sun 12:00.
 * Index order matters (BOT_SLOT_PREFS).
 */
export function buildCandidateSlots(now: Date): Slot[] {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
  const sat1 = new Date(d); sat1.setDate(d.getDate() + daysToSat + (daysToSat < 2 ? 7 : 0));
  const sun1 = new Date(sat1); sun1.setDate(sat1.getDate() + 1);
  const sat2 = new Date(sat1); sat2.setDate(sat1.getDate() + 7);
  const sun2 = new Date(sat1); sun2.setDate(sat1.getDate() + 8);
  const mk = (day: Date, hour: number, i: number): Slot => {
    const s = new Date(day); s.setHours(hour, 0, 0, 0);
    return { id: `slot-${i}`, startsAt: s.toISOString(), label: `${dateLabel(s)} ${pad2(hour)}:00` };
  };
  return [mk(sat1, 12, 0), mk(sat1, 18, 1), mk(sun1, 12, 2), mk(sun1, 18, 3), mk(sat2, 12, 4), mk(sun2, 12, 5)];
}

export function userById(users: User[], id: string): User | undefined { return users.find(u => u.id === id); }

// ── Director / demo script ──────────────────────────────────────────────────
export const DIRECTOR_ID = 'director';   // observer persona used by the Director console (sees everything, claims nothing)

/** Family aliases used by heuristics to resolve people mentioned by the senior. */
export const FAMILY_ALIASES: Record<string, { name: string; relation: string }> = {
  남편: { name: '박영수', relation: '남편' }, 영감: { name: '박영수', relation: '남편' }, 영수: { name: '박영수', relation: '남편' },
  큰딸: { name: '김지은', relation: '딸' }, 지은: { name: '김지은', relation: '딸' }, 딸: { name: '김지은', relation: '딸' },
  아들: { name: '박민준', relation: '아들' }, 민준: { name: '박민준', relation: '아들' },
  며느리: { name: '이수연', relation: '며느리' }, 수연: { name: '이수연', relation: '며느리' },
  손녀: { name: '박하린', relation: '손녀' }, 하린: { name: '박하린', relation: '손녀' },
  손자: { name: '박동현', relation: '손자' }, 동현: { name: '박동현', relation: '손자' },
  여동생: { name: '김영희', relation: '여동생' }, 영희: { name: '김영희', relation: '여동생' },
  정숙: { name: '최정숙', relation: '친구' },
};

export interface DemoStep {
  id: string;
  label: string;                 // button label in the Director rail
  hint: string;                  // what the audience should notice
  as?: string;                   // persona who speaks (via demo:say)
  room?: 'senior' | 'family';
  text?: string;
  photo?: string;                // /demo-photos/...
  director?: 'proactive' | 'report' | 'closePoll' | 'model' | 'invite';
  contactId?: string;            // for director 'invite' (phonebook contact → family room)
  kind?: ProactiveKind;          // for director 'proactive'
  modelKey?: ModelKey;           // for director 'model': switch to this model (or the next available one) before `text` is sent
  clock?: string;                // set the virtual clock to this HH:MM before running the step (realistic report times)
  /** completion condition: the Director waits for this message kind in this room before the step counts as done */
  waitFor?: { room: 'senior' | 'family'; kind: MessageKind; from?: 'tachi' };
}

/** The 90-second script. Senior answers are written so the offline demo brain extracts everything. */
export const DEMO_SCRIPT: DemoStep[] = [
  { id: 'proactive', label: '타치가 먼저 말 걸기', hint: '능동 대화 · 지난 추억 기반', director: 'proactive', kind: 'morning', clock: '09:00', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'photo', label: '옛 사진 올리기', hint: '사진 → 문답 시작', as: 'mom', room: 'senior', photo: '/demo-photos/gyeongju-1984.jpg', clock: '14:10', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-when', label: '답: 언제·어디', hint: '시기·장소 추출', as: 'mom', room: 'senior', text: '1984년 봄이었어. 경주 불국사로 가족여행 갔을 때야', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-who', label: '답: 누구와', hint: '인물 추출', as: 'mom', room: 'senior', text: '남편 영수 씨랑 지은이, 민준이. 넷이 같이 갔지', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-story', label: '답: 기억나는 일', hint: '추억 저장 → 그래프 DB', as: 'mom', room: 'senior', text: '다보탑 앞에서 사진 찍는데 민준이가 자꾸 도망가서 한참 웃었어. 벚꽃이 참 예뻤지', waitFor: { room: 'senior', kind: 'memory_card' } },
  { id: 'share', label: '가족에게 공유', hint: '감성 요약 → 가족방', as: 'mom', room: 'senior', text: '응, 애들한테 보내줘', waitFor: { room: 'family', kind: 'share_card' } },
  { id: 'invite', label: '가족: 하린 초대', hint: '가상 전화번호부에서 손녀 초대', director: 'invite', contactId: 'c-harin', waitFor: { room: 'family', kind: 'system' } },
  { id: 'recall', label: '키워드로 회상', hint: '“불국사” 한 단어로 다시 찾기', as: 'mom', room: 'senior', text: '불국사', clock: '14:20', waitFor: { room: 'senior', kind: 'recall_card' } },
  { id: 'trip', label: '여행 제안 수락', hint: '추억 기반 근처 여행 → 동선', as: 'mom', room: 'senior', text: '좋아, 다시 가보고 싶네', waitFor: { room: 'senior', kind: 'itinerary' } },
  { id: 'together', label: '가족과 함께 가기', hint: '여행 → 가족 모임 기획서로 이어짐', as: 'mom', room: 'senior', text: '가족과 함께 가기', waitFor: { room: 'family', kind: 'artifact' } },
  { id: 'health', label: '가족: 건강 질문', hint: '공개된 건강 정보만 답변', as: 'jieun', room: 'family', text: '타치, 엄마 요즘 혈압은 괜찮으셔?', clock: '19:40', waitFor: { room: 'family', kind: 'health_card' } },
  { id: 'private', label: '가족: 비공개 질문', hint: '비공개로 둔 일상 대화는 정중히 거절', as: 'jieun', room: 'family', text: '타치, 엄마 오늘 아침에 무슨 얘기 하셨어?', waitFor: { room: 'family', kind: 'text', from: 'tachi' } },
  { id: 'gathering', label: '가족: 모임 제안', hint: '기획서에 생신 일정 반영', as: 'minjun', room: 'family', text: '이번 엄마 생신에 다 같이 경주 가자!', waitFor: { room: 'family', kind: 'artifact' } },
  { id: 'schedule', label: '가족: 시간 잡기', hint: '구성원별 사이드 챗으로 일정 조율', as: 'jieun', room: 'family', text: '타치, 모임 시간 좀 잡아줘', waitFor: { room: 'family', kind: 'schedule_result' } },
  { id: 'model', label: '모델 교체 → 다시 질문', hint: 'Claude ↔ ChatGPT 실시간 교체', director: 'model', modelKey: 'gpt-terra', as: 'jieun', room: 'family', text: '타치, 오늘 엄마 기분은 어떠셔?', waitFor: { room: 'family', kind: 'text', from: 'tachi' } },
  { id: 'report', label: '오늘의 리포트', hint: '몇 시에 대화했는지 가족에게 보고', director: 'report', clock: '21:00', waitFor: { room: 'family', kind: 'report' } },
];

// ── English (default product language) ─────────────────────────────────────
// Korean data above stays as the 'ko' locale. Helpers below pick by locale.

export const DEFAULT_LOCALE: Locale = 'en';

export const USERS_EN: User[] = [
  { id: 'mom', name: 'Soonja Kim', shortName: 'Mom', role: 'senior', relation: 'self', phone: '010-2384-1947', initials: 'S', isBot: true,
    persona: '78, lives in Mapo, Seoul. Husband Youngsu Park passed away in 2019. Grew up near Gyeongju. Calm, warm, unhurried way of talking.' },
  { id: 'jieun', name: 'Jieun Kim', shortName: 'Jieun', role: 'family', relation: 'daughter', phone: '010-5521-0384', initials: 'J', isBot: true,
    persona: 'Eldest daughter, 49, office worker in Seoul. Caring and meticulous; watches over Mom\'s health most closely.' },
  { id: 'minjun', name: 'Minjun Park', shortName: 'Minjun', role: 'family', relation: 'son', phone: '010-7710-2290', initials: 'M', isBot: true,
    persona: 'Son, 46, lives in Daejeon. Few words, gets things done. Short sentences. Volunteers for driving and bookings.' },
  { id: 'suyeon', name: 'Suyeon Lee', shortName: 'Suyeon', role: 'family', relation: 'daughter-in-law', phone: '010-3349-8812', initials: 'S', isBot: true,
    persona: 'Daughter-in-law, 44. Great at finding restaurants and stays. Bright and polite.' },
  { id: 'harin', name: 'Harin Park', shortName: 'Harin', role: 'family', relation: 'granddaughter', phone: '010-9031-4456', initials: 'H', isBot: true,
    persona: 'Granddaughter, 17. Adores her grandma. Upbeat, short messages, says "lol" and "Grandma is the best". No emoji.' },
  { id: 'tachi', name: 'Tachi', shortName: 'Tachi', role: 'ai', relation: 'AI', phone: '', initials: 'T', isBot: true,
    persona: 'A warm AI companion who keeps a senior\'s memories alive.' },
];

export const CONTACTS_EN: Contact[] = [
  { id: 'c-jieun', name: 'Jieun Kim', relation: 'daughter', phone: '010-5521-0384', userId: 'jieun' },
  { id: 'c-minjun', name: 'Minjun Park', relation: 'son', phone: '010-7710-2290', userId: 'minjun' },
  { id: 'c-suyeon', name: 'Suyeon Lee', relation: 'daughter-in-law', phone: '010-3349-8812', userId: 'suyeon' },
  { id: 'c-harin', name: 'Harin Park', relation: 'granddaughter', phone: '010-9031-4456', userId: 'harin' },
  { id: 'c-donghyun', name: 'Donghyun Park', relation: 'grandson', phone: '010-4402-7731', userId: null },
  { id: 'c-younghee', name: 'Younghee Kim', relation: 'younger sister', phone: '010-6618-2093', userId: null },
  { id: 'c-cheolsu', name: 'Cheolsu Park', relation: 'nephew', phone: '010-2275-6640', userId: null },
  { id: 'c-jungsook', name: 'Jungsook Choi', relation: 'friend', phone: '010-8830-1152', userId: null },
  { id: 'c-misook', name: 'Misook Lee', relation: 'friend', phone: '010-1934-5578', userId: null },
  { id: 'c-sangho', name: 'Sangho Jung', relation: 'son-in-law', phone: '010-5067-3381', userId: null },
  { id: 'c-clinic', name: 'Mapo Yonsei Clinic', relation: 'doctor', phone: '02-332-1188', userId: null },
  { id: 'c-church', name: 'Seogyo Senior Center', relation: 'neighbor', phone: '02-338-4410', userId: null },
];

/** English kin relations (same meaning as KIN_RELATIONS). */
export const KIN_RELATIONS_EN = ['self', 'daughter', 'son', 'daughter-in-law', 'son-in-law', 'granddaughter', 'grandson', 'younger sister', 'younger brother', 'older sister', 'older brother', 'nephew', 'niece'];

export const FAMILY_ALIASES_EN: Record<string, { name: string; relation: string }> = {
  husband: { name: 'Youngsu Park', relation: 'husband' }, youngsu: { name: 'Youngsu Park', relation: 'husband' },
  daughter: { name: 'Jieun Kim', relation: 'daughter' }, jieun: { name: 'Jieun Kim', relation: 'daughter' },
  son: { name: 'Minjun Park', relation: 'son' }, minjun: { name: 'Minjun Park', relation: 'son' },
  'daughter-in-law': { name: 'Suyeon Lee', relation: 'daughter-in-law' }, suyeon: { name: 'Suyeon Lee', relation: 'daughter-in-law' },
  granddaughter: { name: 'Harin Park', relation: 'granddaughter' }, harin: { name: 'Harin Park', relation: 'granddaughter' },
  grandson: { name: 'Donghyun Park', relation: 'grandson' }, donghyun: { name: 'Donghyun Park', relation: 'grandson' },
  sister: { name: 'Younghee Kim', relation: 'younger sister' }, younghee: { name: 'Younghee Kim', relation: 'younger sister' },
  jungsook: { name: 'Jungsook Choi', relation: 'friend' },
};

export const PRIVACY_LABELS_EN: Record<PrivacyCategory, { label: string; description: string }> = {
  health: { label: 'Health', description: 'Blood pressure, medication, sleep, steps' },
  memory: { label: 'Memories', description: 'Stories shared with old photos' },
  daily: { label: 'Daily chat', description: 'Greetings and small talk' },
  mood: { label: 'Mood', description: 'How she feels today' },
  trip: { label: 'Trips & outings', description: 'Trips Tachi suggested' },
};

export const PROACTIVE_SCHEDULE_EN: { time: string; kind: ProactiveKind; label: string }[] = [
  { time: '09:00', kind: 'morning', label: 'Morning check-in' },
  { time: '14:00', kind: 'memory', label: 'Memory chat' },
  { time: '19:30', kind: 'evening', label: 'Evening check-in' },
];

/** The 90-second script in English. Senior lines are written so the offline demo brain extracts everything. */
export const DEMO_SCRIPT_EN: DemoStep[] = [
  { id: 'proactive', label: 'Tachi starts the conversation', hint: 'Proactive · based on a past memory', director: 'proactive', kind: 'morning', clock: '09:00', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'photo', label: 'Share an old photo', hint: 'Photo → interview starts', as: 'mom', room: 'senior', photo: '/demo-photos/gyeongju-1984.jpg', clock: '14:10', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-when', label: 'Answer: when & where', hint: 'Era and place extracted', as: 'mom', room: 'senior', text: 'It was spring 1984. We went on a family trip to Bulguksa Temple in Gyeongju.', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-who', label: 'Answer: who', hint: 'People extracted', as: 'mom', room: 'senior', text: 'My husband Youngsu, Jieun and Minjun. The four of us went together.', waitFor: { room: 'senior', kind: 'text', from: 'tachi' } },
  { id: 'a-story', label: 'Answer: what she remembers', hint: 'Memory saved → graph DB', as: 'mom', room: 'senior', text: 'Minjun kept running away while we took a photo in front of Dabotap Pagoda, and we laughed so hard. The cherry blossoms were beautiful.', waitFor: { room: 'senior', kind: 'memory_card' } },
  { id: 'share', label: 'Share with family', hint: 'Warm summary → family room', as: 'mom', room: 'senior', text: 'Yes, send it to the kids.', waitFor: { room: 'family', kind: 'share_card' } },
  { id: 'invite', label: 'Family: invite Harin', hint: 'Invite from the virtual phonebook', director: 'invite', contactId: 'c-harin', waitFor: { room: 'family', kind: 'system' } },
  { id: 'recall', label: 'Recall by keyword', hint: 'One word, "Bulguksa", brings it back', as: 'mom', room: 'senior', text: 'Bulguksa', clock: '14:20', waitFor: { room: 'senior', kind: 'recall_card' } },
  { id: 'trip', label: 'Accept the trip', hint: 'Memory-based trip → itinerary', as: 'mom', room: 'senior', text: "Sounds good, I'd love to go back.", waitFor: { room: 'senior', kind: 'itinerary' } },
  { id: 'together', label: 'Go with family', hint: 'Trip → family gathering plan', as: 'mom', room: 'senior', text: 'Go with family', waitFor: { room: 'family', kind: 'artifact' } },
  { id: 'health', label: 'Family: health question', hint: 'Answers only from public health data', as: 'jieun', room: 'family', text: "Tachi, how has Mom's blood pressure been lately?", clock: '19:40', waitFor: { room: 'family', kind: 'health_card' } },
  { id: 'private', label: 'Family: private question', hint: 'Private daily chat is politely declined', as: 'jieun', room: 'family', text: 'Tachi, what did Mom talk about this morning?', waitFor: { room: 'family', kind: 'text', from: 'tachi' } },
  { id: 'gathering', label: 'Family: propose a gathering', hint: 'Birthday added to the plan', as: 'minjun', room: 'family', text: "Let's all go to Gyeongju for Mom's birthday!", waitFor: { room: 'family', kind: 'artifact' } },
  { id: 'schedule', label: 'Family: find a time', hint: 'Side chats with each member to schedule', as: 'jieun', room: 'family', text: 'Tachi, can you find a time for the gathering?', waitFor: { room: 'family', kind: 'schedule_result' } },
  { id: 'model', label: 'Swap model → ask again', hint: 'Claude ↔ ChatGPT live swap', director: 'model', modelKey: 'gpt-terra', as: 'jieun', room: 'family', text: 'Tachi, how is Mom feeling today?', waitFor: { room: 'family', kind: 'text', from: 'tachi' } },
  { id: 'report', label: "Today's report", hint: 'Tells the family when they talked', director: 'report', clock: '21:00', waitFor: { room: 'family', kind: 'report' } },
];

export const usersFor = (l: Locale): User[] => (l === 'ko' ? USERS : USERS_EN);
export const contactsFor = (l: Locale): Contact[] => (l === 'ko' ? CONTACTS : CONTACTS_EN);
export const kinRelationsFor = (l: Locale): string[] => (l === 'ko' ? KIN_RELATIONS : KIN_RELATIONS_EN);
export const familyAliasesFor = (l: Locale) => (l === 'ko' ? FAMILY_ALIASES : FAMILY_ALIASES_EN);
export const privacyLabelsFor = (l: Locale) => (l === 'ko' ? PRIVACY_LABELS : PRIVACY_LABELS_EN);
export const proactiveScheduleFor = (l: Locale) => (l === 'ko' ? PROACTIVE_SCHEDULE : PROACTIVE_SCHEDULE_EN);
export const demoScriptFor = (l: Locale): DemoStep[] => (l === 'ko' ? DEMO_SCRIPT : DEMO_SCRIPT_EN);
/** True if the relation (either language) counts as kin. */
export const isKinRelation = (rel: string) => KIN_RELATIONS.includes(rel) || KIN_RELATIONS_EN.includes(rel);

/** English labels for date helpers. */
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'Sun, Nov 22' (en) or '11월 22일(일)' (ko) */
export function dateLabelL(d: Date, l: Locale): string { return l === 'ko' ? dateLabel(d) : `${DOW_EN[d.getDay()]}, ${MON_EN[d.getMonth()]} ${d.getDate()}`; }
/** '2:05 PM' (en) or '오후 2:05' (ko) */
export function timeLabelL(d: Date, l: Locale): string {
  if (l === 'ko') return koreanTime(d);
  const h = d.getHours(); const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}
