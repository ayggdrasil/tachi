// AI brain contract. FROZEN — Agent B implements `createBrain()` in server/brain/index.ts;
// Agent A (orchestrator) only calls through this interface.
import type {
  Artifact, ArtifactTask, HealthSummary, ItineraryPayload, Memory, MemoryPerson, ModelKey, ModelState,
  PrivacyCategory, PrivacySettings, ProactiveKind, ReportOpenTask, ReportPayload, SessionLog, Slot, TripSuggestionPayload, User,
  BookingCategory, TaskActionKind,
} from '../../shared/types';
import type { AnyTool, ToolAudience, ToolContext } from '../tools/types';
import type { AgentOutcome } from './agent';

/** Every AI result carries which model produced it and whether the heuristic fallback answered. */
export interface AIResult<T> {
  value: T; model: string; fallback: boolean;
  /** what actually produced the value (truthful attribution): live LLM, offline heuristic, or deterministic rule */
  source?: 'llm' | 'heuristic' | 'rule';
}

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

// ── Interview ──────────────────────────────────────────────────────────────
export type InterviewSlot = 'when' | 'where' | 'who' | 'story';

export interface InterviewState {
  memoryId: string;
  photoUrl: string;
  photoPath?: string;            // absolute file path on disk (for vision LLMs)
  asked: InterviewSlot[];        // slots already asked, in order
  answers: { slot: InterviewSlot | 'extra'; text: string }[];
  filled: Partial<Record<InterviewSlot, boolean>>;
  photoObservation?: string;     // what the vision model saw (first turn), reused as context
  done: boolean;
}

export interface InterviewTurn {
  reply: string;                 // Tachi's next line (≤2 short sentences, 해요체)
  quickReplies: string[];        // 2–4 chips appropriate for the question
  state: InterviewState;         // updated state (asked/answers/filled/done)
  done: boolean;                 // true → orchestrator calls extractMemory next
}

export interface ExtractedMemory {
  title: string;
  story: string;
  summary: string;
  year?: number;
  era?: string;
  season?: string;
  place?: string;
  placeId?: string;
  people: MemoryPerson[];
  event?: string;
  emotions: string[];
  tags: string[];
}

/** Polarity-aware facts stated by the senior in small talk; the orchestrator persists them before claiming '기록했어요'. */
export interface SeniorObservation {
  medication?: { taken: boolean; name?: string; time?: '아침' | '점심' | '저녁' };
  mood?: string;               // '좋음' | '보통' | '조금 우울' …
}

// ── Senior intents ─────────────────────────────────────────────────────────
export type SeniorIntent =
  | { type: 'recall'; keywords: string[] }
  | { type: 'trip'; destination?: string }
  | { type: 'health_log'; systolic?: number; diastolic?: number; note?: string }
  | { type: 'ask_share' }                        // "가족한테 보내줘"
  | { type: 'share_trip' }                       // "여행 계획 가족한테 보내줘" (itinerary context)
  | { type: 'make_gathering' }                   // "가족과 함께 가기" / "애들이랑 같이 가자" (itinerary context)
  | { type: 'yes' } | { type: 'no' }             // answers to pending questions
  | { type: 'smalltalk' };

export interface SeniorIntentContext {
  knownNodeNames: string[];      // graph node names (places, people, events, eras) for keyword spotting
  pending?: 'share_confirm' | 'trip_confirm' | 'itinerary' | null; // 'itinerary' = an itinerary was just shown
}

// ── Family ─────────────────────────────────────────────────────────────────
/** Built by the orchestrator. ONLY public categories are filled; private ones are listed in `privateCategories`. */
export interface FamilyContext {
  senior: User;
  asker: User;
  privacy: PrivacySettings;
  privateCategories: PrivacyCategory[];
  health?: HealthSummary;                        // present only if health is public
  moodToday?: string;                            // present only if mood is public
  memories: Pick<Memory, 'id' | 'title' | 'summary' | 'year' | 'place' | 'people' | 'emotions'>[]; // public only
  recentSessions: Pick<SessionLog, 'startedAt' | 'title' | 'summary' | 'category'>[];         // public only
  trips: { title: string; destination: string; status: string }[];                             // if trip public
}

export interface FamilyAnswer {
  text: string;                  // reply in the family room (해요체, refers to the senior as 어머님/할머님 by asker relation)
  showHealthCard: boolean;       // orchestrator attaches a health_card when true (and health is public)
}

export type FamilyIntent =
  | { type: 'ask_tachi' }                        // question for Tachi (about the senior etc.)
  | { type: 'gathering'; topic: string }         // wants to plan a gathering
  | { type: 'schedule' }                         // "시간 잡아줘"
  | { type: 'none' };                            // chit-chat between family, Tachi stays quiet

// ── Gathering & scheduling ─────────────────────────────────────────────────
export interface GatheringInput {
  proposalText: string;
  proposer: User;
  members: User[];
  linkedMemory?: Pick<Memory, 'id' | 'title' | 'summary' | 'place' | 'year' | 'people'>;
  linkedTrip?: { title: string; destination: string; itinerary?: ItineraryPayload };
  senior: User;
}

export interface GatheringDraft {
  title: string;
  background: string;
  purpose: string;
  place: string;
  agenda: string[];
  tasks: Omit<ArtifactTask, 'id' | 'done'>[];   // assigneeId must be one of members' ids (or omitted)
  notes: string;
}

// ── To-do execution ───────────────────────────────────────────────────────
export interface TaskClassifyInput {
  tasks: { id: string; text: string; assigneeId?: string }[];
  title?: string;
  place?: string;
}

/** What Tachi can do for one to-do. `query` is a short search noun for booking links ('한정식', '한옥 숙소'). */
export interface TaskClassification { kind: TaskActionKind; category?: BookingCategory; query?: string }

// ── Bots ───────────────────────────────────────────────────────────────────
export interface BotContext {
  persona: User;                 // the family member the bot speaks as
  senior: User;
  recent: { sender: string; text: string }[];   // last ~8 messages, display names
  trigger: { kind: string; text: string };      // the message being reacted to (kind = MessageKind)
}

// ── Agent (tool-calling loop) ─────────────────────────────────────────────
export interface AgentRunInput {
  goal: string;                  // the user's request (plus any context the orchestrator adds)
  audience: ToolAudience;
  tools: AnyTool[];              // the tools this request may use (already filtered by audience)
  toolCtx: ToolContext;          // privacy is enforced inside tool execution with this context
  system: string;
  /** the deterministic offline planner may answer (demo brain, provider down, live failure) */
  allowOffline: boolean;
  /** skip the live provider even when one is configured (the request only suits the deterministic planner) */
  offlineOnly?: boolean;
  maxSteps?: number;
  deadlineMs?: number;
}

// ── Brain ──────────────────────────────────────────────────────────────────
export interface Brain {
  /** Current model state (for UI), and runtime switching. */
  getModelState(): ModelState;
  setActiveModel(key: ModelKey): ModelState;

  /** Start an interview for a newly uploaded photo → first question. */
  startInterview(input: { memoryId: string; photoUrl: string; photoPath?: string; senior: User }): Promise<AIResult<InterviewTurn>>;
  /** Next interview turn after the senior answered. */
  interviewTurn(state: InterviewState, answer: string, senior: User): Promise<AIResult<InterviewTurn>>;
  /** Turn the finished interview into a structured memory. */
  extractMemory(state: InterviewState, senior: User): Promise<AIResult<ExtractedMemory>>;

  classifySeniorIntent(text: string, ctx: SeniorIntentContext): Promise<AIResult<SeniorIntent>>;
  /** Warm reply when recalling a memory (≤3 sentences). */
  recallReply(memory: Memory, query: string, senior: User): Promise<AIResult<string>>;
  /** Small talk / health log acknowledgements in the senior room. */
  seniorChat(history: ChatTurn[], text: string, senior: User): Promise<AIResult<{ reply: string; quickReplies: string[]; category: PrivacyCategory; observation?: SeniorObservation }>>;
  /** Quick provider health check for the active (or given) model: tiny prompt, short deadline. */
  preflight(key?: ModelKey): Promise<{ key: ModelKey; ok: boolean; latencyMs: number; error?: string }>;

  /** Emotional summary for the family room. */
  shareSummary(memory: Memory, senior: User): Promise<AIResult<{ title: string; summary: string }>>;

  suggestTrip(memory: Memory, senior: User): Promise<AIResult<Omit<TripSuggestionPayload, 'type' | 'tripId'>>>;
  planItinerary(suggestion: Omit<TripSuggestionPayload, 'type'>, senior: User): Promise<AIResult<Omit<ItineraryPayload, 'type' | 'tripId'>>>;

  proactiveMessage(input: { kind: ProactiveKind; memory?: Memory; senior: User; now: Date }): Promise<AIResult<{ text: string; quickReplies: string[] }>>;
  composeReport(input: { sessions: SessionLog[]; privacy: PrivacySettings; moodToday?: string; senior: User; now: Date; openTasks?: ReportOpenTask[]; people?: Record<string, string> }): Promise<AIResult<Omit<ReportPayload, 'type'>>>;

  classifyFamilyIntent(text: string, asker: User): Promise<AIResult<FamilyIntent>>;
  answerFamily(question: string, ctx: FamilyContext): Promise<AIResult<FamilyAnswer>>;

  draftGathering(input: GatheringInput): Promise<AIResult<GatheringDraft>>;
  assistArtifact(artifact: Artifact, members: User[]): Promise<AIResult<{ message: string; newTasks: Omit<ArtifactTask, 'id' | 'done'>[] }>>;
  /** Classify gathering to-dos into actions (calendar invite / booking link / reminder / none), keyed by task id. Optional: callers fall back to the heuristic. */
  classifyTasks?(input: TaskClassifyInput): Promise<AIResult<Record<string, TaskClassification>>>;
  /** Free-text availability → slot ids that work for this person. */
  parseAvailability(text: string, slots: Slot[]): Promise<AIResult<string[]>>;

  /** 1–2 line in-character reply from a family bot. Return '' to stay silent. */
  botReply(ctx: BotContext): Promise<AIResult<string>>;

  /**
   * Agentic loop (plan → tools → verify). Live provider when available; otherwise (or when `allowOffline` and the live run
   * failed) the offline planner. `value.ok === false` means: fall back to the state machine. Optional (additive).
   */
  runAgent?(input: AgentRunInput): Promise<AIResult<AgentOutcome>>;
}
