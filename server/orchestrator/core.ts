// Core helpers: clock, post/emit helpers, viewer-aware emitters.
import {
  DIRECTOR_ID, SENIOR_ID, TACHI_ID, USERS,
} from '../../shared/constants';
import type {
  DemoState, GraphDelta, HealthSummary, ID, Memory, Message, MessageKind, MessageMeta, MessagePayload, CardAction,
  Poll, Presence, PrivacySettings, Room, Trip, User,
} from '../../shared/types';
import { ctx, type Sock } from './ctx';
import { nowIso, sleep, uid, warn } from '../util/misc';

// ── ids / channels ──────────────────────────────────────────────────────────
export const roomChannel = (id: ID): string => `room:${id}`;
export const userChannel = (id: ID): string => `user:${id}`;
export const isDirector = (id?: ID): boolean => id === DIRECTOR_ID;
export const seesAll = (id?: ID): boolean => id === DIRECTOR_ID || id === SENIOR_ID;

export const DIRECTOR_USER: User = {
  id: DIRECTOR_ID, name: '디렉터', shortName: '디렉터', role: 'family', relation: '운영', phone: '', initials: '디', isBot: false,
  persona: '데모 운영자(관찰자)',
};

// ── clock & state ───────────────────────────────────────────────────────────
export function getDemo(): DemoState { return ctx.db.kv.get<DemoState>('demo')!; }
export function now(): Date {
  const off = ctx.db.kv.get<DemoState>('demo')?.clockOffsetMinutes ?? 0;
  return new Date(Date.now() + off * 60000);
}
export function getPrivacy(): PrivacySettings { return ctx.db.kv.get<PrivacySettings>('privacy')!; }
export function getHealth(): HealthSummary | undefined { return ctx.db.kv.get<HealthSummary>('health'); }
export const getUser = (id: ID): User | undefined => ctx.db.users.get(id);
export function senior(): User { return ctx.db.users.get(SENIOR_ID) ?? USERS[0]; }
export function tachiUser(): User { return ctx.db.users.get(TACHI_ID) ?? USERS.find(u => u.id === TACHI_ID)!; }
export function isMember(room: Room, userId: ID): boolean { return isDirector(userId) || room.memberIds.includes(userId); }
export function displayName(id: ID): string { return id === TACHI_ID ? '타치' : getUser(id)?.shortName ?? id; }

/** Run `fn` later, dropping it if the demo was reset in between; never throws. */
export function later(ms: number, fn: () => void | Promise<void>): void {
  const gen = ctx.gen;
  setTimeout(() => {
    if (gen !== ctx.gen) return;
    Promise.resolve().then(fn).catch(e => warn('later() failed:', e));
  }, ms);
}

/** Serialize work per room so Tachi's replies keep their order. */
export function enqueue(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = ctx.queues.get(key) ?? Promise.resolve();
  const next = prev.then(fn).catch(e => warn('queue task failed:', e));
  ctx.queues.set(key, next);
  return next;
}

// ── viewers ─────────────────────────────────────────────────────────────────
export function forViewers(fn: (sock: Sock, userId: ID) => void): void {
  for (const s of ctx.io.sockets.sockets.values()) {
    const uid2 = s.data.userId;
    if (uid2) fn(s as Sock, uid2);
  }
}

export function toast(userSocketOrAll: Sock | null, text: string): void {
  if (userSocketOrAll) userSocketOrAll.emit('toast', { text });
  else ctx.io.emit('toast', { text });
}

// ── messages ────────────────────────────────────────────────────────────────
export interface PostInput {
  senderId: ID;
  kind?: MessageKind;
  text: string;
  payload?: MessagePayload;
  quickReplies?: string[];
  actions?: CardAction[];
  meta?: MessageMeta;
}

export function post(roomId: ID, input: PostInput): Message {
  const m: Message = { id: uid('msg'), roomId, createdAt: nowIso(), ...input, kind: input.kind ?? 'text' };
  ctx.db.messages.insert(m);
  const room = ctx.db.rooms.get(roomId);
  if (room) { room.lastMessageAt = m.createdAt; ctx.db.rooms.put(room); }
  ctx.io.to(roomChannel(roomId)).emit('message:new', m);
  return m;
}

export function updateMessage(m: Message): Message {
  ctx.db.messages.update(m);
  ctx.io.to(roomChannel(m.roomId)).emit('message:update', m);
  return m;
}

export function systemNote(roomId: ID, text: string): Message {
  return post(roomId, { senderId: 'system', kind: 'system', text });
}

export function emitTyping(roomId: ID, userId: ID): void {
  ctx.io.to(roomChannel(roomId)).emit('typing', { roomId, userId });
}

export interface AIMeta { model: string; fallback: boolean }

/** Tachi speaks: typing indicator, natural pause, then the message (tagged with the answering model). */
export async function tachiSay(roomId: ID, input: Omit<PostInput, 'senderId'>, ai?: AIMeta): Promise<Message> {
  emitTyping(roomId, TACHI_ID);
  await sleep(ctx.paceMs);
  const meta: MessageMeta = { ...input.meta, ...(ai ? { model: ai.model, fallback: ai.fallback } : {}) };
  return post(roomId, { ...input, senderId: TACHI_ID, meta });
}

export function markActionDone(m: Message, actionId?: string): Message {
  if (!m.actions) return m;
  m.actions = m.actions.map(a => (actionId === undefined || a.id === actionId ? { ...a, done: true } : a));
  return updateMessage(m);
}

// ── viewer-aware emitters ───────────────────────────────────────────────────
export function memoryStub(m: Memory): Memory {
  return {
    id: m.id, ownerId: m.ownerId, title: '비공개 추억', story: '', summary: '', people: [], emotions: [], tags: [],
    visibility: 'private', status: 'saved', createdAt: m.createdAt,
  };
}

/** What a given viewer may know about a memory (null = nothing at all). */
export function memoryFor(viewerId: ID, m: Memory): Memory | null {
  if (seesAll(viewerId)) return m;
  if (m.status !== 'saved') return null;
  return m.visibility === 'family' ? m : memoryStub(m);
}

export function emitMemory(m: Memory): void {
  forViewers((s, v) => { const mm = memoryFor(v, m); if (mm) s.emit('memory:upsert', mm); });
}

/** Graph delta belonging to `m`: senior/director always, family only when the memory is shared. */
export function emitGraphDelta(delta: GraphDelta, m: Memory): void {
  if (!delta.nodes.length && !delta.edges.length) return;
  forViewers((s, v) => { if (seesAll(v) || (m.status === 'saved' && m.visibility === 'family')) s.emit('graph:delta', delta); });
}

export function healthFor(viewerId: ID): HealthSummary | null {
  const h = getHealth();
  if (!h) return null;
  return seesAll(viewerId) || getPrivacy().health === 'family' ? h : null;
}
export function emitHealth(): void { forViewers((s, v) => s.emit('health:update', healthFor(v))); }

export function emitTrip(t: Trip): void {
  const pub = getPrivacy().trip === 'family';
  forViewers((s, v) => { if (seesAll(v) || pub) s.emit('trip:upsert', t); });
}

export function emitPoll(p: Poll): void {
  const channels = [roomChannel(p.familyRoomId), ...Object.values(p.sideRoomIds).map(roomChannel)];
  ctx.io.to(channels).emit('poll:upsert', p);
}

export function emitRoomTo(room: Room): void {
  const chans = [...room.memberIds.map(userChannel), userChannel(DIRECTOR_ID)];
  ctx.io.to(chans).emit('room:upsert', room);
}

export function presence(): Presence {
  const claimed = [...ctx.claims.entries()].filter(([, s]) => s.size > 0).map(([id]) => id);
  return { claimed, online: claimed };
}
export function emitPresence(): void { ctx.io.emit('presence:update', presence()); }

export function emitDemo(): void { ctx.io.emit('demo:update', getDemo()); }
export function patchDemo(patch: Partial<DemoState>): DemoState {
  const d = { ...getDemo(), ...patch };
  ctx.db.kv.set('demo', d);
  emitDemo();
  return d;
}

/** Make every socket of room members (and directors) listen to the room channel. */
export function joinRoomSockets(room: Room): void {
  for (const s of ctx.io.sockets.sockets.values()) {
    const u = s.data.userId;
    if (u && (isDirector(u) || room.memberIds.includes(u))) void s.join(roomChannel(room.id));
  }
}

export function userIsBot(id: ID): boolean { return !!getUser(id)?.isBot; }

/** True when every device holding this persona is a Director-stage phone (presenter-driven). */
export function isAssistedOnly(id: ID): boolean {
  const socks = ctx.claims.get(id);
  return !!socks && socks.size > 0 && [...socks].every(s => ctx.assisted.has(s));
}

export function familyRoom(): Room | undefined { return ctx.db.rooms.get('room-family'); }
export function seniorRoom(): Room | undefined { return ctx.db.rooms.get('room-tachi-mom'); }
