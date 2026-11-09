// Client state store (no external lib): bootstrap via `hello`, then live socket deltas.
// FROZEN API — pages use: initTachi(userId), useTachi(selector), tachi.* commands.
import { useSyncExternalStore } from 'react';
import type {
  Artifact, ArtifactPatch, Bootstrap, Locale, Contact, DemoState, GraphDelta, GraphEdge, GraphNode, HealthSummary, ID,
  Memory, Message, ModelKey, ModelState, Poll, Presence, PrivacyCategory, PrivacySettings, ProactiveKind, Room,
  Trip, User, Visibility,
} from '../../../shared/types';
import { getSocket, uploadPhoto } from './socket';

export interface TachiState {
  status: 'idle' | 'connecting' | 'ready' | 'error';
  error?: string;
  meId: ID | null;
  me: User | null;
  users: Record<ID, User>;
  contacts: Contact[];
  rooms: Room[];
  messages: Record<ID, Message[]>;
  memories: Memory[];
  artifacts: Record<ID, Artifact>;
  polls: Record<ID, Poll>;
  trips: Record<ID, Trip>;
  privacy: PrivacySettings | null;
  health: HealthSummary | null;
  models: ModelState | null;
  demo: DemoState | null;
  presence: Presence;
  graph: { nodes: Record<ID, GraphNode>; edges: Record<ID, GraphEdge> };
  /** ids of graph nodes/edges that arrived in the last delta (for highlight animation) */
  freshGraphIds: ID[];
  typing: Record<ID, { userId: ID; until: number }>;
  toasts: { id: number; text: string }[];
  /** bumps on every message:new — useful for scroll effects */
  messageTick: number;
  /** product language (from the server); before bootstrap: ?lang= or the browser language */
  locale: Locale;
}

const initial: TachiState = {
  status: 'idle', meId: null, me: null, users: {}, contacts: [], rooms: [], messages: {}, memories: [],
  artifacts: {}, polls: {}, trips: {}, privacy: null, health: null, models: null, demo: null,
  presence: { claimed: [], online: [] }, graph: { nodes: {}, edges: {} }, freshGraphIds: [], typing: {},
  toasts: [], messageTick: 0, locale: initialLocale(),
};

function initialLocale(): Locale {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'ko') return q;
    return (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
  } catch { return 'en'; }
}

let state: TachiState = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<TachiState> | ((s: TachiState) => Partial<TachiState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  listeners.forEach(l => l());
}

export function getState(): TachiState { return state; }

export function useTachi<T>(selector: (s: TachiState) => T): T {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => selector(state),
    () => selector(state),
  );
}

function byId<T extends { id: ID }>(list: T[]): Record<ID, T> {
  return Object.fromEntries(list.map(x => [x.id, x]));
}

function upsertList<T extends { id: ID }>(list: T[], item: T): T[] {
  const i = list.findIndex(x => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice(); next[i] = item; return next;
}

function mergeGraph(g: TachiState['graph'], d: GraphDelta): TachiState['graph'] {
  return {
    nodes: { ...g.nodes, ...byId(d.nodes) },
    edges: { ...g.edges, ...byId(d.edges) },
  };
}

function applyBootstrap(b: Bootstrap) {
  set({
    status: 'ready', error: undefined, meId: b.me.id, me: b.me, users: byId(b.users), contacts: b.contacts,
    rooms: b.rooms, messages: b.messages, memories: b.memories, artifacts: byId(b.artifacts), polls: byId(b.polls),
    trips: byId(b.trips), privacy: b.privacy, health: b.health, models: b.models, demo: b.demo, presence: b.presence,
    graph: mergeGraph({ nodes: {}, edges: {} }, b.graph), freshGraphIds: [], typing: {},
    locale: b.locale ?? b.demo?.locale ?? state.locale,
  });
  try { document.documentElement.lang = b.locale ?? 'en'; } catch { /* ignore */ }
}

let wired = false;
let currentUser: ID | null = null;

let helloSeq = 0;
function hello() {
  if (!currentUser) return;
  const seq = ++helloSeq;
  set({ status: 'connecting' });
  // No ack within 8s → recoverable error state (the retry button calls initTachi(id, true)).
  const timer = setTimeout(() => { if (seq === helloSeq && state.status === 'connecting') set({ status: 'error', error: '서버 응답이 없어요' }); }, 8000);
  getSocket().timeout(8000).emit('hello', { userId: currentUser, assisted: isEmbedded(), key: directorKey() }, (err: Error | null, res: Bootstrap | { error: string }) => {
    clearTimeout(timer);
    if (seq !== helloSeq) return;
    if (err) set({ status: 'error', error: '서버 응답이 없어요' });
    else if ('error' in res) set({ status: 'error', error: res.error });
    else applyBootstrap(res);
  });
}

function wire() {
  if (wired) return;
  wired = true;
  const s = getSocket();
  s.on('connect', hello);
  s.on('disconnect', () => set({ status: 'connecting' }));
  s.on('connect_error', () => { if (state.status !== 'ready') set({ status: 'error', error: '서버에 연결하지 못했어요' }); });
  s.on('reset', hello);
  s.on('message:new', m => set(st => ({
    messages: { ...st.messages, [m.roomId]: [...(st.messages[m.roomId] ?? []).filter(x => x.id !== m.id), m] },
    rooms: st.rooms.map(r => (r.id === m.roomId ? { ...r, lastMessageAt: m.createdAt } : r)),
    typing: Object.fromEntries(Object.entries(st.typing).filter(([rid, t]) => !(rid === m.roomId && t.userId === m.senderId))),
    messageTick: st.messageTick + 1,
  })));
  s.on('message:update', m => set(st => ({
    messages: { ...st.messages, [m.roomId]: (st.messages[m.roomId] ?? []).map(x => (x.id === m.id ? m : x)) },
  })));
  s.on('typing', ({ roomId, userId }) => set(st => ({ typing: { ...st.typing, [roomId]: { userId, until: Date.now() + 6000 } } })));
  s.on('room:upsert', r => set(st => ({ rooms: upsertList(st.rooms, r) })));
  s.on('user:upsert', u => set(st => ({ users: { ...st.users, [u.id]: u }, me: st.meId === u.id ? u : st.me })));
  s.on('contact:upsert', c => set(st => ({ contacts: upsertList(st.contacts, c) })));
  s.on('memory:upsert', m => set(st => ({ memories: upsertList(st.memories, m) })));
  s.on('graph:delta', d => set(st => ({ graph: mergeGraph(st.graph, d), freshGraphIds: [...d.nodes.map(n => n.id), ...d.edges.map(e => e.id)] })));
  s.on('artifact:upsert', a => set(st => ({ artifacts: { ...st.artifacts, [a.id]: a } })));
  s.on('poll:upsert', p => set(st => ({ polls: { ...st.polls, [p.id]: p } })));
  s.on('trip:upsert', t => set(st => ({ trips: { ...st.trips, [t.id]: t } })));
  s.on('privacy:update', privacy => set({ privacy }));
  s.on('health:update', health => set({ health }));
  s.on('model:update', models => set({ models }));
  s.on('demo:update', demo => set(st => ({ demo, locale: demo.locale ?? st.locale })));
  s.on('presence:update', presence => set({ presence }));
  let toastId = 0;
  s.on('toast', ({ text }) => {
    const id = ++toastId;
    set(st => ({ toasts: [...st.toasts, { id, text }] }));
    setTimeout(() => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) })), 3200);
  });
  // expire typing indicators
  setInterval(() => {
    const now = Date.now();
    const t = state.typing;
    if (Object.values(t).some(x => x.until < now)) {
      set({ typing: Object.fromEntries(Object.entries(t).filter(([, x]) => x.until >= now)) });
    }
  }, 1000);
}

/** Connect this page as a persona. Safe to call repeatedly; switching persona re-bootstraps; `force` retries after an error. */
export function initTachi(userId: ID, force = false) {
  wire();
  if (currentUser === userId && state.status !== 'idle' && !(force || state.status === 'error')) return;
  currentUser = userId;
  const s = getSocket();
  if (s.connected) hello();
  else { set({ status: 'connecting' }); s.connect(); }
}

// ── Commands ────────────────────────────────────────────────────────────────
export const tachi = {
  send(roomId: ID, text: string) {
    const t = text.trim();
    if (t) getSocket().emit('message:send', { roomId, text: t });
  },
  async sendPhoto(roomId: ID, file: File | Blob) {
    const photoUrl = await uploadPhoto(file);
    getSocket().emit('message:send', { roomId, photoUrl });
    return photoUrl;
  },
  sendPhotoUrl(roomId: ID, photoUrl: string) { getSocket().emit('message:send', { roomId, photoUrl }); },
  /** Resolves when the server finished the action ({ok:false} on failure or after 20s without an ack) so buttons can recover. */
  action(roomId: ID, messageId: ID, actionId: string, data?: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    return new Promise(resolve => {
      // optional-ack events aren't typed for .timeout(); the server always acks `action`
      (getSocket().timeout(20000) as unknown as { emit: (ev: 'action', p: unknown, cb: (err: Error | null, r?: { ok: boolean; error?: string }) => void) => void })
        .emit('action', { roomId, messageId, actionId, data }, (err, r) => {
        resolve(err ? { ok: false, error: '응답이 늦어요' } : (r ?? { ok: true }));
      });
    });
  },
  typing(roomId: ID) { getSocket().emit('typing', { roomId }); },
  createRoom(title: string, memberIds: ID[]): Promise<Room> {
    return new Promise((resolve, reject) => getSocket().emit('room:create', { title, memberIds }, r => ('error' in r ? reject(new Error(r.error)) : resolve(r))));
  },
  invite(roomId: ID, contactId: ID) { getSocket().emit('room:invite', { roomId, contactId }); },
  /** Get or create my 1:1 room with a family member (person-to-person, no Tachi). */
  openDm(userId: ID): Promise<Room> {
    return new Promise((resolve, reject) => getSocket().emit('room:dm', { userId }, r => ('error' in r ? reject(new Error(r.error)) : resolve(r))));
  },
  /** Switch the product language (server re-seeds demo data in that language; clients re-bootstrap). */
  setLocale(locale: Locale) { getSocket().emit('locale:set', { locale }); },
  updateArtifact(artifactId: ID, patch: ArtifactPatch) { getSocket().emit('artifact:update', { artifactId, patch }); },
  artifactTask(artifactId: ID, op: 'add' | 'toggle' | 'assign' | 'remove', opts: { taskId?: ID; text?: string; assigneeId?: ID } = {}) {
    getSocket().emit('artifact:task', { artifactId, op, ...opts });
  },
  assistArtifact(artifactId: ID) { getSocket().emit('artifact:assist', { artifactId }); },
  setPrivacy(category: PrivacyCategory, visibility: Visibility) { getSocket().emit('privacy:set', { category, visibility }); },
  setMemoryVisibility(memoryId: ID, visibility: Visibility) { getSocket().emit('memory:visibility', { memoryId, visibility }); },
  setModel(key: ModelKey) { getSocket().emit('model:set', { key }); },
  demo: {
    proactive(kind?: ProactiveKind) { getSocket().emit('demo:proactive', { kind }); },
    report() { getSocket().emit('demo:report'); },
    reset() { getSocket().emit('demo:reset'); },
    bots(enabled: boolean) { getSocket().emit('demo:bots', { enabled }); },
    closePoll() { getSocket().emit('demo:closePoll'); },
    say(userId: ID, roomId: ID, text?: string, photoUrl?: string) { getSocket().emit('demo:say', { userId, roomId, text, photoUrl }); },
    clock(time: string | null) { getSocket().emit('demo:clock', { time }); },
    invite(roomId: ID, contactId: ID) { getSocket().emit('demo:invite', { roomId, contactId }); },
  },
};

// ── Selectors / helpers ─────────────────────────────────────────────────────
export const selectRoomMessages = (roomId: ID) => (s: TachiState) => s.messages[roomId] ?? EMPTY;
const EMPTY: Message[] = [];

/** Persona from `?as=` (iframes / quick device setup) or localStorage. */
export function resolvePersona(fallback?: ID): ID | null {
  const q = new URLSearchParams(window.location.search).get('as');
  if (q) return q;
  try { return localStorage.getItem('tachi.persona') ?? fallback ?? null; } catch { return fallback ?? null; }
}
export function rememberPersona(id: ID) { try { localStorage.setItem('tachi.persona', id); } catch { /* private mode */ } }
/** Optional director key from `?key=` (remembered for the session) — only needed when the server sets TACHI_DIRECTOR_KEY. */
export function directorKey(): string | undefined {
  const q = new URLSearchParams(window.location.search).get('key');
  try { if (q) sessionStorage.setItem('tachi.key', q); return q ?? sessionStorage.getItem('tachi.key') ?? undefined; } catch { return q ?? undefined; }
}
export function isEmbedded(): boolean { return new URLSearchParams(window.location.search).get('embed') === '1'; }
