// Core helpers: clock, post/emit helpers, viewer-aware emitters.
import {
  DAILY_REPORT_TIME, DIRECTOR_ID, SENIOR_ID, TACHI_ID, isKinRelation, usersFor,
} from '../../shared/constants';
import type {
  Artifact, DemoState, GraphDelta, HealthSummary, ID, Memory, Message, MessageKind, MessageMeta, MessagePayload, CardAction,
  Poll, Presence, PrivacySettings, ReportSession, Room, Trip, User,
} from '../../shared/types';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ctx, type Sock } from './ctx';
import { serverLocale, st } from '../i18n';
import { clockNow, getClockOffsetMinutes, nowIso, setClockOffsetMinutes, sleep, uid, wallNow, warn, ymd } from '../util/misc';

// ── ids / channels ──────────────────────────────────────────────────────────
export const roomChannel = (id: ID): string => `room:${id}`;
export const userChannel = (id: ID): string => `user:${id}`;
export const isDirector = (id?: ID): boolean => id === DIRECTOR_ID;
export const seesAll = (id?: ID): boolean => id === DIRECTOR_ID || id === SENIOR_ID;

/**
 * THE viewer authorization predicate for the senior's data: the senior, the Director, or kin (relation in KIN_RELATIONS).
 * Everyone else (friends, neighbours, clinic ...) gets NO senior memory / health / trip / report data at all.
 */
export function viewerIsKin(userId?: ID): boolean {
  if (!userId) return false;
  if (seesAll(userId)) return true;
  const u = ctx.db.users.get(userId);
  return !!u && (u.role === 'senior' || isKinRelation(u.relation));
}

/** The Director observer persona (display strings follow the product language). */
export function directorUser(): User {
  return {
    id: DIRECTOR_ID, name: st('director.name'), shortName: st('director.name'), role: 'family', relation: st('director.relation'), phone: '',
    initials: st('director.initials'), isBot: false, persona: st('director.persona'),
  };
}

// ── clock & state ───────────────────────────────────────────────────────────
export function getDemo(): DemoState { return ctx.db.kv.get<DemoState>('demo')!; }
/** The demo clock: real time shifted by the virtual offset (same source as nowIso()). */
export function now(): Date { return clockNow(); }
/** True once a scripted time was set since boot / reset: only then is the clock kept monotonic. */
let clockStarted = false;
/** Set the in-memory offset (after boot / reseed). Also forgets the scripted-clock anchor. */
export function syncClock(offsetMinutes = 0): void { clockStarted = false; setClockOffsetMinutes(offsetMinutes); }

/**
 * Set the virtual clock to today HH:MM (null = real time).
 * The FIRST assignment after boot/reset is absolute (even when earlier than the wall clock, so the demo can start at 09:00
 * at 16:00); afterwards it never moves backwards (an earlier time adds one minute).
 */
export function setDemoClock(time: string | null): boolean {
  if (time === null || time === undefined) { clockStarted = false; patchDemo({ clockOffsetMinutes: 0 }); return true; }
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return false;
  const wall = wallNow();
  const target = new Date(wall);
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const cur = getClockOffsetMinutes();
  const backwards = clockStarted && target.getTime() < now().getTime();
  const off = backwards ? cur + 1 : (target.getTime() - wall) / 60000;
  clockStarted = true;
  patchDemo({ clockOffsetMinutes: off });
  markFiredUpTo(now());
  return true;
}

/** Mark every schedule entry whose time is at or before `t` as fired today (and the report when `t` >= the report time). */
export function markFiredUpTo(t: Date): void {
  const today = ymd(t);
  const mins = t.getHours() * 60 + t.getMinutes();
  const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const d = getDemo();
  patchDemo({ proactiveSchedule: d.proactiveSchedule.map(e => (toMin(e.time) <= mins ? { ...e, firedOn: today } : e)) });
  if (mins >= toMin(DAILY_REPORT_TIME)) ctx.db.kv.set('report-fired-on', today);
}

// ── generation (reset safety) ───────────────────────────────────────────────
const genStore = new AsyncLocalStorage<{ gen: number; t0: number }>();
/** Run `fn` (and everything it awaits / schedules) under demo generation `gen`. */
export function runWithGen<T>(gen: number, fn: () => T): T { return genStore.run({ gen, t0: genStore.getStore()?.t0 ?? Date.now() }, fn); }
export function currentGen(): number { return genStore.getStore()?.gen ?? ctx.gen; }
/** True when the running flow belongs to a demo generation that has since been reset. */
export function isStale(): boolean { const s = genStore.getStore(); return !!s && s.gen !== ctx.gen; }

/** Make db / graph writes from stale flows no-ops (so old flows cannot repopulate a freshly seeded demo). */
export function installGuards(): void {
  const g = ctx as unknown as { __guarded?: boolean };
  if (g.__guarded) return;
  g.__guarded = true;
  type Fn = (...a: unknown[]) => unknown;
  const wrap = (obj: Record<string, unknown>, names: string[], dropped: (name: string, a: unknown[]) => unknown) => {
    for (const k of names) {
      const orig = obj[k] as Fn | undefined;
      if (typeof orig !== 'function') continue;
      obj[k] = function (this: unknown, ...a: unknown[]) { return isStale() ? dropped(k, a) : orig.apply(this, a); };
    }
  };
  const db = ctx.db as unknown as Record<string, Record<string, unknown>>;
  for (const t of ['users', 'contacts', 'rooms', 'memories', 'trips', 'artifacts', 'polls', 'sessions', 'messages', 'reminders']) {
    wrap(db[t], ['put', 'insert', 'update', 'delete'], (_k, a) => a[0]);
  }
  wrap(db.kv, ['set', 'del'], (k, a) => (k === 'set' ? a[1] : undefined));
  wrap(ctx.graph as unknown as Record<string, unknown>, ['upsertMemory', 'linkFamily'],
    k => Promise.resolve(k === 'upsertMemory' ? { nodes: [], edges: [] } : undefined));
}
export function getPrivacy(): PrivacySettings { return ctx.db.kv.get<PrivacySettings>('privacy')!; }
export function getHealth(): HealthSummary | undefined { return ctx.db.kv.get<HealthSummary>('health'); }
export const getUser = (id: ID): User | undefined => ctx.db.users.get(id);
export function senior(): User { return ctx.db.users.get(SENIOR_ID) ?? usersFor(serverLocale())[0]; }
export function tachiUser(): User { return ctx.db.users.get(TACHI_ID) ?? usersFor(serverLocale()).find(u => u.id === TACHI_ID)!; }
export function isMember(room: Room, userId: ID): boolean { return isDirector(userId) || room.memberIds.includes(userId); }
export function displayName(id: ID): string { return id === TACHI_ID ? st('tachi.name') : getUser(id)?.shortName ?? id; }

/** Run `fn` later, dropping it if the demo was reset in between; never throws. */
export function later(ms: number, fn: () => void | Promise<void>): void {
  const gen = currentGen();
  if (isStale()) return;
  setTimeout(() => {
    if (gen !== ctx.gen) return;
    runWithGen(gen, () => Promise.resolve().then(fn).catch(e => warn('later() failed:', e)));
  }, ms);
}

/** Serialize work per room so Tachi's replies keep their order. */
export function enqueue(key: string, fn: () => Promise<void>): Promise<void> {
  if (isStale()) return Promise.resolve();
  const gen = currentGen();
  const prev = ctx.queues.get(key) ?? Promise.resolve();
  const next = prev.then(() => (gen === ctx.gen ? runWithGen(gen, fn) : undefined)).catch(e => warn('queue task failed:', e));
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
  if (isStale()) return m; // the demo was reset while this flow was running: drop silently
  ctx.db.messages.insert(m);
  const room = ctx.db.rooms.get(roomId);
  if (room) { room.lastMessageAt = m.createdAt; ctx.db.rooms.put(room); }
  emitMessage('message:new', m);
  return m;
}

/** Emit a message to every socket in its room channel, projected for that viewer with the CURRENT privacy state. */
export function emitMessage(event: 'message:new' | 'message:update', m: Message): void {
  const ids = ctx.io.sockets.adapter.rooms.get(roomChannel(m.roomId));
  if (!ids) return;
  for (const id of ids) {
    const s = ctx.io.sockets.sockets.get(id);
    if (!s) continue;
    s.emit(event, messageFor(s.data.userId ?? '', m));
  }
}

export function updateMessage(m: Message): Message {
  if (isStale()) return m;
  ctx.db.messages.update(m);
  emitMessage('message:update', m);
  return m;
}

export function systemNote(roomId: ID, text: string): Message {
  return post(roomId, { senderId: 'system', kind: 'system', text });
}

export function emitTyping(roomId: ID, userId: ID): void {
  if (isStale()) return;
  ctx.io.to(roomChannel(roomId)).emit('typing', { roomId, userId });
}

export interface AIMeta { model: string; fallback: boolean; source?: 'llm' | 'heuristic' | 'rule' }

/** Show Tachi's typing indicator right away and keep it alive (every ~4s) while `fn` runs. */
export async function withTyping<T>(roomId: ID, fn: () => Promise<T>): Promise<T> {
  emitTyping(roomId, TACHI_ID);
  const iv = setInterval(() => emitTyping(roomId, TACHI_ID), 4000);
  iv.unref?.();
  try { return await fn(); } finally { clearInterval(iv); }
}

/** Tachi speaks: typing indicator, natural pause, then the message (tagged with the real answering source). */
export async function tachiSay(roomId: ID, input: Omit<PostInput, 'senderId'>, ai?: AIMeta): Promise<Message> {
  await withTyping(roomId, () => sleep(ctx.paceMs));
  const meta: MessageMeta = {
    ...input.meta,
    ...(ai ? { model: ai.model, fallback: ai.fallback, source: ai.source ?? (ai.fallback ? 'heuristic' : 'llm') } : {}),
  };
  const out = await post(roomId, { ...input, senderId: TACHI_ID, meta });
  if (ai && process.env.TACHI_LOG_TIMING === '1') {
    const t0 = genStore.getStore()?.t0 ?? Date.now();
    console.log(`[tachi:timing] ${JSON.stringify({ roomId, kind: input.kind ?? 'text', model: ai.model, source: meta.source, ms: Date.now() - t0 })}`);
  }
  return out;
}

/** Mark actions done. With `chosenId`, that alternative is recorded as the user's pick (the UI shows one outcome line). */
export function markActionDone(m: Message, actionId?: string, chosenId?: string): Message {
  if (!m.actions) return m;
  m.actions = m.actions.map(a => (actionId === undefined || a.id === actionId
    ? { ...a, done: true, ...(chosenId && a.id === chosenId ? { chosen: true } : {}) } : a));
  return updateMessage(m);
}

// ── viewer-aware emitters ───────────────────────────────────────────────────
export function memoryStub(m: Memory): Memory {
  return {
    id: m.id, ownerId: m.ownerId, title: st('mem.privateTitle'), story: '', summary: '', people: [], emotions: [], tags: [],
    visibility: 'private', status: 'saved', createdAt: m.createdAt,
  };
}

/** THE effective-visibility rule: a saved memory is visible to the family only if both the memory and the memory category are public. */
export function memoryVisibleToFamily(m: Memory | undefined | null): boolean {
  return !!m && m.status === 'saved' && m.visibility === 'family' && getPrivacy().memory === 'family';
}

/** What a given viewer may know about a memory (null = nothing at all). */
export function memoryFor(viewerId: ID, m: Memory): Memory | null {
  if (seesAll(viewerId)) return m;
  if (!viewerIsKin(viewerId) || m.status !== 'saved') return null;
  return memoryVisibleToFamily(m) ? m : memoryStub(m);
}

export function emitMemory(m: Memory): void {
  if (isStale()) return;
  forViewers((s, v) => { const mm = memoryFor(v, m); if (mm) s.emit('memory:upsert', mm); });
}

/** Graph delta belonging to `m`: senior/director always, family only when the memory is effectively shared. */
export function emitGraphDelta(delta: GraphDelta, m: Memory): void {
  if (isStale() || (!delta.nodes.length && !delta.edges.length)) return;
  const visible = memoryVisibleToFamily(m);
  forViewers((s, v) => { if (seesAll(v) || (visible && viewerIsKin(v))) s.emit('graph:delta', delta); });
}

/** Health as the family may see it: null when private; mood stripped when only mood is private. */
export function healthForFamily(h: HealthSummary | undefined = getHealth()): HealthSummary | null {
  if (!h || getPrivacy().health !== 'family') return null;
  return getPrivacy().mood === 'family' ? h : { ...h, mood: [] };
}
export function healthFor(viewerId: ID): HealthSummary | null {
  const h = getHealth();
  if (!h) return null;
  if (seesAll(viewerId)) return h;
  return viewerIsKin(viewerId) ? healthForFamily(h) : null;
}
export function emitHealth(): void { if (!isStale()) forViewers((s, v) => s.emit('health:update', healthFor(v))); }

/** Category gate for sharing: a private memory CATEGORY blocks sharing any memory to the family until the senior resolves it. */
export function canShareToFamily(_memory?: Memory | null): boolean { return getPrivacy().memory === 'family'; }

/**
 * A trip reaches the family only if the trip category is public, the trip itself is not marked private, and — unless the senior
 * shared the trip separately — the memory it was derived from is still family-visible (derived resources follow their source).
 */
export function tripVisibleToFamily(t: Trip | undefined | null): boolean {
  if (!t || getPrivacy().trip !== 'family' || t.visibility === 'private') return false;
  if (t.sharedSeparately === true || !t.memoryId) return true;
  return memoryVisibleToFamily(ctx.db.memories.get(t.memoryId));
}

export const privateNotice = (): string => st('notice.private');
export const kinOnlyText = (): string => st('notice.kinOnly');
const redact = (m: Message, text: string): Message => ({ ...m, kind: 'text', text, payload: undefined, actions: undefined, quickReplies: undefined });

export const maskedTitle = (): string => st('report.maskedTitle');
export const maskedSummary = (): string => st('report.maskedSummary');
/** Report highlight built only from times and public titles. */
export function reportHighlight(rows: ReportSession[]): string {
  if (!rows.length) return st('report.none');
  const times = [...new Set(rows.map(r => r.time))].join(', ');
  const lastPublic = [...rows].reverse().find(r => !r.isPrivate);
  return st('report.highlight', { times, tail: lastPublic ? st('report.highlight.public', { title: lastPublic.title }) : st('report.highlight.private') });
}

/** Viewer-aware copy of a stored message: anything whose source (memory / trip / category) is no longer visible to a family viewer is redacted. */
export function projectMessage(viewerId: ID, m: Message): Message {
  if (seesAll(viewerId)) return m;
  const p = m.payload;
  const privacy = getPrivacy();

  // 0. non-kin viewers never see anything derived from the senior's data
  if (!viewerIsKin(viewerId)) {
    const sensitivePayload = !!p && ['health_card', 'share_card', 'memory_card', 'recall_card', 'trip_suggestion', 'itinerary', 'report'].includes(p.type);
    const mm = m.meta;
    const tagged = !!mm && !!(mm.category || mm.memoryId || mm.tripId || mm.categoriesUsed?.length || mm.memoryIdsUsed?.length || mm.tripIdsUsed?.length);
    if (sensitivePayload || tagged || m.kind === 'health_card' || m.kind === 'report') return redact(m, kinOnlyText());
  }

  // 1. memory provenance (meta or card payload). A message that is about a trip is gated by the TRIP (step 2), not by the memory it
  //    was derived from: the trip's own consent (sharedSeparately) must survive; only memory-exposing payloads below use the memory gate.
  const aboutTrip = !!m.meta?.tripId || (!!p && (p.type === 'trip_suggestion' || p.type === 'itinerary'));
  const memoryId = (aboutTrip ? undefined : m.meta?.memoryId) ?? (p && (p.type === 'share_card' || p.type === 'memory_card' || p.type === 'recall_card') ? p.memoryId : undefined);
  if (memoryId) {
    const mem = ctx.db.memories.get(memoryId);
    if (!memoryVisibleToFamily(mem)) {
      const text = st('notice.memoryPrivate');
      if (p && (p.type === 'share_card' || p.type === 'memory_card' || p.type === 'recall_card')) {
        const stub: Memory = { ...memoryStub(mem ?? ({ id: memoryId, ownerId: SENIOR_ID, createdAt: m.createdAt } as Memory)), title: st('mem.madePrivateTitle') };
        const payload: MessagePayload =
          p.type === 'share_card' ? { type: 'share_card', memoryId, title: st('mem.madePrivateTitle'), summary: '', people: [] }
            : p.type === 'memory_card' ? { type: 'memory_card', memoryId, memory: stub, graphDelta: { nodes: [], edges: [] } }
              : { type: 'recall_card', memoryId, memory: stub, matched: [], path: { nodes: [], edges: [] }, alternatives: [] };
        return { ...m, text, payload, actions: undefined, quickReplies: undefined };
      }
      return redact(m, text);
    }
  }

  // 2. trip provenance
  const tripId = m.meta?.tripId ?? (p && (p.type === 'trip_suggestion' || p.type === 'itinerary') ? p.tripId : undefined);
  if (tripId && !tripVisibleToFamily(ctx.db.trips.get(tripId))) return redact(m, privateNotice());
  if (p?.type === 'itinerary' && p.story?.memoryId && !memoryVisibleToFamily(ctx.db.memories.get(p.story.memoryId))) {
    m = { ...m, payload: { ...p, story: { highlights: p.story.highlights, reason: '' } } };
  }

  // 2b. answer provenance: any resource / category the answer drew on that is private now retracts it
  const usedMem = m.meta?.memoryIdsUsed ?? [];
  const usedTrip = m.meta?.tripIdsUsed ?? [];
  if (usedMem.some(id => !memoryVisibleToFamily(ctx.db.memories.get(id))) || usedTrip.some(id => !tripVisibleToFamily(ctx.db.trips.get(id)))
    || (m.meta?.categoriesUsed ?? []).some(c => privacy[c] === 'private')) return redact(m, privateNotice());

  // 3. category provenance (health / mood / daily / trip ...) — applies to plain text too
  if (m.meta?.category && privacy[m.meta.category] === 'private') {
    return m.kind === 'health_card' ? redact(m, st('notice.healthPrivate')) : redact(m, privateNotice());
  }

  if (!p) return m;
  if (p.type === 'report') {
    const titles = ctx.db.memories.all().filter(x => !memoryVisibleToFamily(x)).map(x => x.title).filter(t => t && t.length >= 2);
    const hit = (t?: string) => !!t && titles.some(x => t.includes(x));
    const rows: ReportSession[] = p.sessions.map(r => (
      !r.isPrivate && (privacy[r.category] === 'private' || hit(r.title) || hit(r.summary))
        ? { ...r, title: maskedTitle(), summary: maskedSummary(), isPrivate: true } : r));
    const moodLeak = privacy.mood !== 'family' && !!p.moodLabel;
    const changed = rows.some((r, i) => r !== p.sessions[i]) || moodLeak || hit(p.highlight) || hit(m.text);
    if (!changed) return m;
    const highlight = reportHighlight(rows);
    return { ...m, text: highlight, payload: { ...p, sessions: rows, moodLabel: privacy.mood === 'family' ? p.moodLabel : undefined, highlight } };
  }
  if (p.type === 'health_card') {
    const h = healthForFamily(p.summary);
    if (!h) return redact(m, st('notice.healthPrivate'));
    return h === p.summary ? m : { ...m, payload: { ...p, summary: h } };
  }
  return m;
}

/** A stored message as `viewerId` may see it right now (privacy projection + hidden-title scrubbing). */
export function messageFor(viewerId: ID, m: Message): Message {
  return seesAll(viewerId) ? m : scrubHiddenTitles(viewerId, projectMessage(viewerId, m));
}

/** Replace titles of memories the family cannot see inside any serializable value (artifacts, trips, chat text). */
export function scrubHiddenTitles<T>(viewerId: ID, value: T): T {
  if (seesAll(viewerId)) return value;
  const titles = ctx.db.memories.all().filter(x => !memoryVisibleToFamily(x)).map(x => x.title).filter(t => t && t.length >= 3 && !t.includes('"'));
  // derived trips that are hidden: their title / reason leak the source memory
  for (const t of ctx.db.trips.all()) {
    if (!t.memoryId || tripVisibleToFamily(t)) continue;
    for (const x of [t.suggestion.title, t.suggestion.reason, t.itinerary?.title]) if (x && x.length >= 3 && !x.includes('"')) titles.push(x);
  }
  if (!titles.length) return value;
  let j = JSON.stringify(value);
  const before = j;
  for (const t of titles.sort((a, b) => b.length - a.length)) j = j.split(JSON.stringify(t).slice(1, -1)).join(st('mem.privateTitle'));
  return j === before ? value : (JSON.parse(j) as T);
}

/** Viewer-aware artifact: non-kin lose senior-derived background and links; anyone loses links to resources they cannot see. */
export function artifactFor(viewerId: ID, a: Artifact): Artifact {
  if (seesAll(viewerId)) return a;
  const kin = viewerIsKin(viewerId);
  const out: Artifact = { ...a };
  const mem = a.linkedMemoryId ? ctx.db.memories.get(a.linkedMemoryId) : undefined;
  const trip = a.linkedTripId ? ctx.db.trips.get(a.linkedTripId) : undefined;
  if (!kin || (a.linkedMemoryId && !memoryVisibleToFamily(mem))) delete out.linkedMemoryId;
  if (!kin || (a.linkedTripId && !tripVisibleToFamily(trip))) delete out.linkedTripId;
  if (!kin && (a.linkedMemoryId || a.linkedTripId || a.background)) out.background = '';
  return scrubHiddenTitles(viewerId, out);
}

/** After any privacy change: senior/director keep their live stream; family clients rebuild from a freshly projected bootstrap. */
export function resyncFamilyViewers(): void {
  if (isStale()) return;
  ctx.io.emit('privacy:update', getPrivacy());
  emitHealth();
  forViewers((s, v) => { if (!seesAll(v)) s.emit('reset'); });
}

/** Change one memory's visibility (authorization is the caller's job) and propagate it everywhere. */
export function applyMemoryVisibility(memoryId: ID, visibility: 'family' | 'private'): Memory | undefined {
  const m = ctx.db.memories.get(memoryId);
  if (!m) return undefined;
  if (m.visibility !== visibility) { m.visibility = visibility; ctx.db.memories.put(m); }
  if (visibility === 'private') rotateUploadedPhoto(m);
  emitMemory(m);
  for (const t of ctx.db.trips.all()) if (t.memoryId === m.id) emitTrip(t); // derived trips follow their source
  resyncFamilyViewers();
  return m;
}

/**
 * Uploaded photos are capability URLs. When the memory stops being shared, move the file to a fresh random name so every
 * URL that leaked earlier answers 404. Updates the memory, stored messages and the graph node. Returns true if rotated.
 */
export function rotateUploadedPhoto(m: Memory): boolean {
  const old = m.photoUrl;
  if (!old || !old.startsWith('/uploads/') || isStale()) return false;
  const name = path.basename(old);
  const dir = path.join(ctx.dataDir, 'uploads');
  const from = path.join(dir, name);
  if (!fs.existsSync(from)) return false;
  const next = `${nanoid(24)}${path.extname(name)}`;
  try { fs.renameSync(from, path.join(dir, next)); } catch (e) { warn('photo rotate failed:', e); return false; }
  const url = `/uploads/${next}`;
  m.photoUrl = url;
  ctx.db.memories.put(m);
  for (const msg of ctx.db.rooms.all().flatMap(r => ctx.db.messages.byRoom(r.id, 5000))) {
    const j = JSON.stringify(msg);
    if (!j.includes(old)) continue;
    const upd = JSON.parse(j.split(old).join(url)) as Message;
    ctx.db.messages.update(upd);
    emitMessage('message:update', upd);
  }
  void ctx.graph.upsertMemory(m).then(d => emitGraphDelta(d, m)).catch(e => warn('graph photo update failed:', e));
  return true;
}

/** After the memory CATEGORY turns private: every family-flagged memory is hidden, so rotate their uploaded photos too. */
export function rotateHiddenPhotos(): void {
  for (const m of ctx.db.memories.all()) if (!memoryVisibleToFamily(m)) rotateUploadedPhoto(m);
}

export function emitTrip(t: Trip): void {
  if (isStale()) return;
  const pub = tripVisibleToFamily(t);
  forViewers((s, v) => { if (seesAll(v) || (pub && viewerIsKin(v))) s.emit('trip:upsert', t); });
}

export function emitPoll(p: Poll): void {
  if (isStale()) return;
  const channels = [roomChannel(p.familyRoomId), ...Object.values(p.sideRoomIds).map(roomChannel)];
  ctx.io.to(channels).emit('poll:upsert', p);
}

export function emitRoomTo(room: Room): void {
  if (isStale()) return;
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
  if (isStale()) return d;
  if (patch.clockOffsetMinutes !== undefined) setClockOffsetMinutes(patch.clockOffsetMinutes);
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
