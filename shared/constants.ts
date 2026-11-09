// Shared constants & pure helpers (server + web). FROZEN API — additive changes only.
import type { Contact, MessageKind, ModelKey, PrivacyCategory, PrivacySettings, ProactiveKind, ProviderKind, Slot, User } from './types';

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
  director?: 'proactive' | 'report' | 'closePoll' | 'model';
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
  { id: 'recall', label: '키워드로 회상', hint: '“불국사” 한 단어로 다시 찾기', as: 'mom', room: 'senior', text: '불국사', clock: '14:20', waitFor: { room: 'senior', kind: 'trip_suggestion' } },
  { id: 'trip', label: '여행 제안 수락', hint: '추억 기반 근처 여행 → 동선', as: 'mom', room: 'senior', text: '좋아, 다시 가보고 싶네', waitFor: { room: 'senior', kind: 'itinerary' } },
  { id: 'health', label: '가족: 건강 질문', hint: '공개된 건강 정보만 답변', as: 'jieun', room: 'family', text: '타치, 엄마 요즘 혈압은 괜찮으셔?', clock: '19:40', waitFor: { room: 'family', kind: 'health_card' } },
  { id: 'gathering', label: '가족: 모임 제안', hint: '모임 아티팩트 생성', as: 'minjun', room: 'family', text: '이번 엄마 생신에 다 같이 경주 가자!', waitFor: { room: 'family', kind: 'artifact' } },
  { id: 'schedule', label: '가족: 시간 잡기', hint: '구성원별 사이드 챗으로 일정 조율', as: 'jieun', room: 'family', text: '타치, 모임 시간 좀 잡아줘', waitFor: { room: 'family', kind: 'schedule_result' } },
  { id: 'model', label: '모델 교체 → 다시 질문', hint: 'Claude ↔ ChatGPT 실시간 교체', director: 'model', modelKey: 'gpt-terra', as: 'jieun', room: 'family', text: '타치, 오늘 엄마 기분은 어떠셔?', waitFor: { room: 'family', kind: 'text', from: 'tachi' } },
  { id: 'report', label: '오늘의 리포트', hint: '몇 시에 대화했는지 가족에게 보고', director: 'report', clock: '21:00', waitFor: { room: 'family', kind: 'report' } },
];
