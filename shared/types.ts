// ─────────────────────────────────────────────────────────────────────────────
// Tachi shared contract — domain types + socket events.
// FROZEN: add fields/kinds if needed, never rename or remove.
// ─────────────────────────────────────────────────────────────────────────────

export type ID = string;
export type ISODate = string; // new Date().toISOString()

// ── People ──────────────────────────────────────────────────────────────────
export type UserRole = 'senior' | 'family' | 'ai';

export interface User {
  id: ID;                 // 'mom' | 'jieun' | 'minjun' | 'suyeon' | 'harin' | 'tachi' | contact-derived ids
  name: string;           // 김순자
  shortName: string;      // 어머니 / 지은 / 민준 / 타치  (display in bubbles)
  role: UserRole;
  relation: string;       // relation to the senior: '본인' | '딸' | '아들' | '며느리' | '손녀' | '이모' | 'AI'
  phone: string;
  initials: string;       // single Hangul char for avatar, e.g. '순'
  isBot: boolean;         // runtime: true when no human device has claimed this persona (always true for tachi)
  persona?: string;       // short personality description used by bot replies
}

export interface Contact {
  id: ID;
  name: string;
  relation: string;
  phone: string;
  userId: ID | null;      // linked user if already on Tachi
}

// ── Rooms & messages ────────────────────────────────────────────────────────
export type RoomType = 'tachi' | 'family' | 'side';

export interface Room {
  id: ID;
  type: RoomType;
  title: string;          // '타치' | '우리 가족' | '일정 조율 · 어머니 생신 모임'
  memberIds: ID[];        // always includes 'tachi'
  createdBy: ID;
  createdAt: ISODate;
  pollId?: ID;            // side rooms created for scheduling
  lastMessageAt?: ISODate;
}

export type MessageKind =
  | 'text'
  | 'photo'
  | 'memory_card'
  | 'share_card'
  | 'recall_card'
  | 'trip_suggestion'
  | 'itinerary'
  | 'health_card'
  | 'report'
  | 'artifact'
  | 'schedule_request'
  | 'schedule_progress'
  | 'schedule_result'
  | 'system';

export interface CardAction {
  id: string;             // action id sent back with socket `action`, e.g. 'share_memory'
  label: string;          // '가족에게 공유하기'
  style?: 'primary' | 'secondary';
  data?: Record<string, unknown>;
  done?: boolean;         // set by server after the action was taken (buttons render disabled)
}

export interface MessageMeta {
  model?: string;         // label of the model that produced it, e.g. 'Claude Sonnet 5.5'
  fallback?: boolean;     // true when the demo heuristic answered (LLM missing/failed)
  proactive?: boolean;    // Tachi started the conversation
  sessionId?: ID;
  category?: PrivacyCategory;
  /** provenance for non-human-authored lines: an AI family bot, or a stand-in answer for a presenter-driven persona */
  generatedBy?: 'bot' | 'assisted';
  /** what actually produced the text: a live LLM, the offline demo brain, or a deterministic rule (privacy refusal, flow transition) */
  source?: 'llm' | 'heuristic' | 'rule';
}

export interface Message {
  id: ID;
  roomId: ID;
  senderId: ID;           // user id or 'tachi' or 'system'
  kind: MessageKind;
  text: string;           // plain text (also used as accessible summary for cards)
  payload?: MessagePayload;
  quickReplies?: string[];// senior chips under a Tachi message
  actions?: CardAction[]; // buttons on cards / Tachi messages
  meta?: MessageMeta;
  createdAt: ISODate;
}

export type MessagePayload =
  | PhotoPayload
  | MemoryCardPayload
  | ShareCardPayload
  | RecallCardPayload
  | TripSuggestionPayload
  | ItineraryPayload
  | HealthCardPayload
  | ReportPayload
  | ArtifactRefPayload
  | ScheduleRequestPayload
  | ScheduleProgressPayload
  | ScheduleResultPayload;

export interface PhotoPayload { type: 'photo'; url: string; width?: number; height?: number }

export interface MemoryCardPayload {
  type: 'memory_card';
  memoryId: ID;
  memory: Memory;               // snapshot
  graphDelta: GraphDelta;       // nodes/edges created for this memory (for the animation)
}

export interface ShareCardPayload {
  type: 'share_card';
  memoryId: ID;
  title: string;                // '1975년 여름, 불국사에서'
  summary: string;              // 2–4 emotional sentences written for the family
  photoUrl?: string;
  era?: string;
  place?: string;
  people: string[];
}

export interface RecallCardPayload {
  type: 'recall_card';
  memoryId: ID;
  memory: Memory;
  matched: string[];            // matched keywords / node names
  path: GraphPath;              // e.g. 불국사 ←TAKEN_AT− 기억 −APPEARS_IN← 박영수
  cypher?: string;              // the query shown small under the card
  alternatives: { memoryId: ID; title: string }[];
}

export interface TripStop {
  time: string;                 // '10:10'
  title: string;                // '불국사'
  description: string;          // one line
  travel?: string;              // 'KTX 2시간 10분' / '택시 25분'
  note?: string;                // senior-friendly note: '완만한 길 · 휠체어 대여 가능'
}

export interface TripSuggestionPayload {
  type: 'trip_suggestion';
  tripId: ID;
  memoryId?: ID;
  title: string;                // '다시 찾는 경주, 1박 2일'
  reason: string;               // why — ties to the memory
  destination: string;          // '경주'
  highlights: string[];         // 3–4 places
  durationLabel: string;        // '1박 2일'
}

export interface ItineraryPayload {
  type: 'itinerary';
  tripId: ID;
  title: string;
  destination: string;
  dateLabel?: string;           // '날짜 미정' or '11월 22일(일)'
  days: { label: string; stops: TripStop[] }[];
  tips: string[];               // accessibility & health tips
}

export interface HealthCardPayload {
  type: 'health_card';
  summary: HealthSummary;
}

export interface ReportPayload {
  type: 'report';
  dateLabel: string;            // '11월 9일 (월)'
  sessions: ReportSession[];
  moodLabel?: string;           // '좋음' (only when mood is public)
  highlight?: string;           // one warm sentence
}

export interface ReportSession {
  time: string;                 // '09:02'
  title: string;                // '아침 안부' | '옛 사진 이야기'
  summary: string;              // public summary, or '비공개 대화예요' when private
  category: PrivacyCategory;
  isPrivate: boolean;
}

export interface ArtifactRefPayload { type: 'artifact'; artifactId: ID }

export interface ScheduleRequestPayload {
  type: 'schedule_request';
  pollId: ID;
  artifactTitle: string;
  slots: Slot[];
  selectedSlotIds?: ID[];       // filled once this member answered
  answered?: boolean;
}

export interface ScheduleProgressPayload {
  type: 'schedule_progress';
  pollId: ID;
  responded: ID[];              // user ids
  waiting: ID[];
}

export interface ScheduleResultPayload {
  type: 'schedule_result';
  pollId: ID;
  slot: Slot;
  available: ID[];
  unavailable: ID[];
  artifactId?: ID;
  unanimous?: boolean;              // every participant (incl. the senior) can make it
  confirmed?: boolean;              // false → best candidate only; needs a human '이 시간으로 확정' or re-poll
  unanswered?: ID[];
}

// ── Memories & graph ────────────────────────────────────────────────────────
export type Visibility = 'family' | 'private';

export interface MemoryPerson { name: string; relation?: string }

export interface Memory {
  id: ID;
  ownerId: ID;                  // 'mom'
  photoUrl?: string;
  title: string;                // '1975년 여름, 경주 불국사 수학여행'
  story: string;                // senior's story, cleaned up (first person kept)
  summary: string;              // one sentence
  year?: number;                // 1975
  era?: string;                 // '1970년대'
  season?: string;              // '여름'
  place?: string;               // '경주 불국사'
  placeId?: string;             // gazetteer id
  people: MemoryPerson[];
  event?: string;               // '수학여행'
  emotions: string[];           // ['그리움', '행복']
  tags: string[];               // other entities: objects, food, songs
  visibility: Visibility;
  status: 'draft' | 'saved';
  sharedAt?: ISODate;
  createdAt: ISODate;
}

export type GraphNodeLabel = 'Memory' | 'Person' | 'Place' | 'Era' | 'Event' | 'Emotion' | 'Topic';
export type GraphRelType = 'APPEARS_IN' | 'TAKEN_AT' | 'IN_ERA' | 'ABOUT' | 'EVOKES' | 'MENTIONS' | 'FAMILY_OF';

export interface GraphNode { id: ID; label: GraphNodeLabel; name: string; props?: Record<string, unknown> }
export interface GraphEdge { id: ID; type: GraphRelType; source: ID; target: ID; props?: Record<string, unknown> }
export interface GraphDelta { nodes: GraphNode[]; edges: GraphEdge[] }
export interface GraphPath { nodes: GraphNode[]; edges: GraphEdge[] }

// ── Privacy & health ────────────────────────────────────────────────────────
export type PrivacyCategory = 'health' | 'memory' | 'daily' | 'mood' | 'trip';
export type PrivacySettings = Record<PrivacyCategory, Visibility>;

export interface BloodPressure { date: string; systolic: number; diastolic: number }
export interface MedicationDay { date: string; name: string; time: '아침' | '점심' | '저녁'; taken: boolean }

export interface HealthSummary {
  updatedAt: ISODate;
  bloodPressure: BloodPressure[];   // last 7 days, oldest first
  medications: MedicationDay[];     // last 7 days
  sleepHours: { date: string; hours: number }[];
  steps: { date: string; count: number }[];
  mood: { date: string; label: string }[]; // '좋음' | '보통' | '조금 우울'
  notes: string[];                  // e.g. '무릎이 시리다고 하셨어요 (11/8)'
}

// ── Sessions (for reports) ─────────────────────────────────────────────────
export interface SessionLog {
  id: ID;
  startedAt: ISODate;
  endedAt?: ISODate;
  kind: 'proactive' | 'senior';
  title: string;                    // '아침 안부'
  category: PrivacyCategory;
  summary: string;
  reported: boolean;
  memoryId?: ID;                    // memory-related sessions: masked in reports when that memory is private
}

// ── Trips ───────────────────────────────────────────────────────────────────
export interface Trip {
  id: ID;
  memoryId?: ID;
  status: 'suggested' | 'accepted' | 'declined';
  suggestion: TripSuggestionPayload;
  itinerary?: ItineraryPayload;
  createdAt: ISODate;
}

// ── Artifacts (gathering plans) ────────────────────────────────────────────
export interface ArtifactTask { id: ID; text: string; assigneeId?: ID; done: boolean }

export interface Artifact {
  id: ID;
  roomId: ID;
  kind: 'gathering';
  title: string;                    // '어머니 생신 · 경주 가족 여행'
  background: string;               // why this gathering (links to memory/trip)
  purpose: string;
  place: string;
  dateStatus: 'undecided' | 'polling' | 'confirmed';
  dateLabel?: string;               // '11월 22일(일) 12:00'
  slot?: Slot;
  agenda: string[];
  tasks: ArtifactTask[];
  notes: string;
  linkedMemoryId?: ID;
  linkedTripId?: ID;
  pollId?: ID;
  createdBy: ID;
  updatedBy: ID;
  updatedAt: ISODate;
  createdAt: ISODate;
}

export type ArtifactPatch = Partial<Pick<Artifact, 'title' | 'background' | 'purpose' | 'place' | 'agenda' | 'notes' | 'dateLabel'>>;

// ── Scheduling polls ────────────────────────────────────────────────────────
export interface Slot { id: ID; startsAt: ISODate; label: string } // label '11월 22일(일) 12:00'

export interface Poll {
  id: ID;
  artifactId?: ID;
  familyRoomId: ID;
  title: string;
  slots: Slot[];
  participantIds: ID[];
  sideRoomIds: Record<ID, ID>;      // userId -> side room id (mom -> her tachi room)
  responses: Record<ID, ID[]>;      // userId -> available slot ids
  status: 'open' | 'closed';
  resultSlotId?: ID;
  progressMessageId?: ID;
  createdAt: ISODate;
}

// ── Models ──────────────────────────────────────────────────────────────────
export type ModelKey = 'claude-sonnet' | 'claude-haiku' | 'gpt-terra' | 'gpt-luna' | 'demo';
export type ProviderKind = 'anthropic' | 'openai' | 'mock';

export interface ModelOption {
  key: ModelKey;
  label: string;
  provider: ProviderKind;
  modelId: string;                  // resolved id ('' for demo)
  available: boolean;               // key present (always true for demo)
}

export interface ModelState { active: ModelKey; options: ModelOption[] }

// ── Demo / presence ────────────────────────────────────────────────────────
export interface DemoState {
  botsEnabled: boolean;
  clockOffsetMinutes: number;       // virtual clock shift for proactive schedule demos
  proactiveSchedule: { time: string; kind: ProactiveKind; label: string; firedOn?: string }[];
  lanUrls: string[];                // http://192.168.0.12:4100
  scenarioStep: number;
}

export type ProactiveKind = 'morning' | 'memory' | 'evening' | 'ask_photo';

export interface Presence { claimed: ID[]; online: ID[] }

export interface Bootstrap {
  me: User;
  users: User[];
  contacts: Contact[];
  rooms: Room[];
  messages: Record<ID, Message[]>;  // by room id, oldest first
  memories: Memory[];               // senior: all; family: visibility==='family' only
  artifacts: Artifact[];
  polls: Poll[];
  trips: Trip[];
  privacy: PrivacySettings;
  health: HealthSummary | null;     // null for family when health is private
  models: ModelState;
  demo: DemoState;
  presence: Presence;
  graph: GraphDelta;                // full graph visible to me (family: only public memories' subgraph)
}

// ── Socket events ───────────────────────────────────────────────────────────
export interface ClientToServerEvents {
  hello: (p: { userId: ID; assisted?: boolean /* embedded in the Director stage: bots may fill in schedule answers */; key?: string /* director key when TACHI_DIRECTOR_KEY is set */ }, ack: (b: Bootstrap | { error: string }) => void) => void;
  'message:send': (p: { roomId: ID; text?: string; photoUrl?: string }) => void;
  action: (p: { roomId: ID; messageId: ID; actionId: string; data?: Record<string, unknown> }) => void;
  typing: (p: { roomId: ID }) => void;
  'room:create': (p: { title: string; memberIds: ID[] }, ack: (room: Room | { error: string }) => void) => void;
  'room:invite': (p: { roomId: ID; contactId: ID }) => void;
  'artifact:update': (p: { artifactId: ID; patch: ArtifactPatch }) => void;
  'artifact:task': (p: { artifactId: ID; op: 'add' | 'toggle' | 'assign' | 'remove'; taskId?: ID; text?: string; assigneeId?: ID }) => void;
  'artifact:assist': (p: { artifactId: ID }) => void;          // ask Tachi to suggest tasks / ideas
  'privacy:set': (p: { category: PrivacyCategory; visibility: Visibility }) => void;
  'memory:visibility': (p: { memoryId: ID; visibility: Visibility }) => void;
  'model:set': (p: { key: ModelKey }) => void;
  'demo:proactive': (p: { kind?: ProactiveKind }) => void;
  'demo:report': () => void;
  'demo:reset': () => void;
  'demo:bots': (p: { enabled: boolean }) => void;
  'demo:closePoll': () => void;                                // force-close the open poll
  'demo:say': (p: { userId: ID; roomId: ID; text?: string; photoUrl?: string }) => void; // director speaks as any persona
  'demo:clock': (p: { time: string | null }) => void;          // set the virtual clock to today HH:MM (null = real time); director only
}

export interface ServerToClientEvents {
  'message:new': (m: Message) => void;
  'message:update': (m: Message) => void;
  typing: (p: { roomId: ID; userId: ID }) => void;
  'room:upsert': (r: Room) => void;
  'user:upsert': (u: User) => void;
  'contact:upsert': (c: Contact) => void;
  'memory:upsert': (m: Memory) => void;
  'graph:delta': (d: GraphDelta) => void;
  'artifact:upsert': (a: Artifact) => void;
  'poll:upsert': (p: Poll) => void;
  'trip:upsert': (t: Trip) => void;
  'privacy:update': (p: PrivacySettings) => void;
  'health:update': (h: HealthSummary | null) => void;
  'model:update': (m: ModelState) => void;
  'demo:update': (d: DemoState) => void;
  'presence:update': (p: Presence) => void;
  reset: () => void;                                           // clients re-run hello
  toast: (p: { text: string }) => void;
}
