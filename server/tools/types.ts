// Tool registry types. Tools are plain typed functions with a JSON schema; privacy is enforced inside `execute`, never by prompt.
import type { PrivacyCategory, PrivacySettings, User } from '../../shared/types';
import type { Db } from '../db';
import type { GraphStore } from '../graph/contract';
import type { JSONSchema } from './validate';

export type ToolAudience = 'senior' | 'family';

// ── calendar ────────────────────────────────────────────────────────────────
export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string;              // ISO
  endsAt: string;                // ISO
  ownerId: string;               // whose calendar it lives in (organizer)
  attendeeIds: string[];         // besides the owner
  location?: string;
  note?: string;
  /** 'private' events are shown to other people as busy time only (no title / place / note) */
  visibility: 'family' | 'private';
  source: 'seed' | 'tachi' | 'user' | 'external';
  createdBy?: string;
  createdAt: string;
}
export type NewCalendarEvent = Omit<CalendarEvent, 'id' | 'createdAt'>;

/** Pluggable calendar backend: the local SQLite store today; a Google Calendar adapter can implement the same interface later. */
export interface CalendarProvider {
  readonly id: string;
  /** events owned by or attended by any of `userIds` (all users when omitted) overlapping [from, to) */
  list(q: { userIds?: string[]; from: Date; to: Date }): Promise<CalendarEvent[]>;
  create(e: NewCalendarEvent): Promise<CalendarEvent>;
}

// ── reminders ───────────────────────────────────────────────────────────────
export interface Reminder {
  id: string;
  userId: string;                // who gets reminded
  text: string;
  dueAt: string;                 // ISO (next due time)
  repeat: 'none' | 'daily';
  status: 'scheduled' | 'delivered' | 'cancelled';
  /** privacy category for family-facing listings ('health' for medicine / clinic reminders) */
  category: PrivacyCategory;
  createdBy: string;
  createdAt: string;
  deliveredAt?: string;
}

// ── execution ───────────────────────────────────────────────────────────────
/** Side effects a tool asks the orchestrator to surface (system notes etc.). Tools never talk to sockets directly. */
export type ToolNotice =
  | { kind: 'calendar_invite'; event: CalendarEvent }
  | { kind: 'reminder_created'; reminder: Reminder };

export interface ToolContext {
  audience: ToolAudience;
  callerId: string;
  seniorId: string;
  now: () => Date;
  db: Db;
  graph: GraphStore;
  calendar: CalendarProvider;
  privacy: () => PrivacySettings;
  /** live check of the per-memory visibility rule (status saved + family visibility + memory category public) */
  memoryVisibleToFamily: (memoryId: string) => boolean;
  users: () => User[];
  notify?: (n: ToolNotice) => void;
}

export interface ToolOutput {
  data: unknown;                 // JSON returned to the model
  summary: string;               // one Korean line for logs / the step transcript
  provenance?: { memoryIds?: string[]; categories?: PrivacyCategory[] };
}

/** Thrown by a tool for an expected refusal / bad request: reported to the model as an error result (not a crash). */
export class ToolError extends Error {
  constructor(public code: 'invalid' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable', message: string) { super(message); this.name = 'ToolError'; }
}

export interface Tool<A = Record<string, unknown>> {
  name: string;
  /** short Korean label for the UI ("타치가 확인한 것") */
  label: string;
  /** Korean + English description shown to the model */
  description: string;
  inputSchema: JSONSchema;
  audiences: ToolAudience[];
  /** creates or changes state (invites, reminders) */
  mutates?: boolean;
  execute(args: A, ctx: ToolContext): Promise<ToolOutput> | ToolOutput;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any>;
