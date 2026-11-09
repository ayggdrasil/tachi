// Senior (Tachi room) flows: 4.1 interview, 4.2 share, 4.3 recall, 4.4 trip, health log, small talk.
import fs from 'node:fs';
import path from 'node:path';
import { FAMILY_ROOM_ID, SENIOR_ID, SENIOR_ROOM_ID, TACHI_ID } from '../../shared/constants';
import { st } from '../i18n';
import type {
  CardAction, HealthSummary, ID, Memory, MemoryCardPayload, Message, PrivacyCategory, Room, Trip,
} from '../../shared/types';
import type { InterviewState, SeniorObservation } from '../brain/contract';
import { assessBloodPressure } from '../brain/heuristics/health';
import { yesNo } from '../brain/heuristics/ko';
import { ctx } from './ctx';
import {
  applyMemoryVisibility, canShareToFamily, emitGraphDelta, emitHealth, healthForFamily, emitMemory, emitTrip, enqueue, getHealth, getPrivacy, later,
  markActionDone, memoryVisibleToFamily, now, post, senior, tachiSay, withTyping,
} from './core';
import { createGathering } from './artifacts';
import { reactBots } from './bots';
import { clearProactiveMemory, getProactiveMemory, noteSeniorReply } from './proactive';
import { logSeniorSession } from './sessions';
import { tryMomAvailability } from './scheduling';
import { agentTurn } from './seniorAgent';
import { isKo } from './locale';
import { nowIso, uid, warn, ymd } from '../util/misc';

export type Pending =
  | { type: 'share_confirm'; memoryId: ID; messageId?: ID }
  | { type: 'trip_confirm'; tripId: ID; messageId?: ID }
  | { type: 'itinerary'; tripId: ID; messageId?: ID };

/** Memories whose trip offer is scheduled or being generated (one offer per memory). */
const offerReserved = new Set<ID>();
/** Acceptances that arrived while the offer was still reserved (memoryId -> generation); auto-accepted once the offer posts. */
const queuedAccept = new Map<ID, number>();
/** Itinerary planning started in the background as soon as a suggestion exists (tripId -> promise). */
type PlanResult = Awaited<ReturnType<typeof ctx.brain.planItinerary>>;
const plans = new Map<ID, Promise<PlanResult>>();

/** Thrown when a senior-only action is refused (wrong actor / room / message / action). */
export class ActionDenied extends Error {}
/** Thrown after a kind in-chat explanation when an action cannot proceed yet (e.g. privacy): ack is {ok:false,error:'refused'} and the card stays usable. */
export class ActionRefused extends Error { override name = 'ActionRefused'; }

const tripMeta = (tripId?: ID, memoryId?: ID) => ({ category: 'trip' as const, ...(tripId ? { tripId } : {}), ...(memoryId ? { memoryId } : {}) });
const memMeta = (memoryId: ID) => ({ category: 'memory' as const, memoryId });

export const kInterview = (roomId: ID) => `interview:${roomId}`;
const kPending = (roomId: ID) => `pending:${roomId}`;
export const getPending = (roomId: ID) => ctx.db.kv.get<Pending>(kPending(roomId));
export const setPending = (roomId: ID, p: Pending | null) => { if (p) ctx.db.kv.set(kPending(roomId), p); else ctx.db.kv.del(kPending(roomId)); };
export const setLastMemory = (id: ID) => ctx.db.kv.set('last-memory', id);

export function resolvePhotoPath(url: string): string | undefined {
  try {
    const name = path.basename(decodeURIComponent(url.split('?')[0]));
    const p = url.startsWith('/uploads/') ? path.join(ctx.dataDir, 'uploads', name)
      : url.startsWith('/demo-photos/') ? path.join(ctx.rootDir, 'demo', 'photos', name) : undefined;
    return p && fs.existsSync(p) ? p : undefined;
  } catch { return undefined; }
}

// ── entry point ─────────────────────────────────────────────────────────────
export async function handleSeniorInput(room: Room, userId: ID, text?: string, photoUrl?: string, msgId?: ID): Promise<void> {
  try {
    // live model → the LLM agent runs the whole 1:1 conversation; a fallback/failed turn drops through to the offline pipeline below
    if (ctx.brain.isLive() && (await tryAgent(room, text, photoUrl, msgId))) return;
    if (photoUrl) await startInterview(room, photoUrl);
    else if (text) await handleSeniorText(room, text);
  } finally {
    if (userId === SENIOR_ID) noteSeniorReply(room.id);
  }
}

/** Shortcuts that stay deterministic in agent mode: an open poll she answers by typing, and the buttons-as-text on an itinerary. */
async function tryAgent(room: Room, text: string | undefined, photoUrl: string | undefined, msgId?: ID): Promise<boolean> {
  if (!photoUrl && !text) return false;
  if (!photoUrl && text) {
    if (await tryMomAvailability(text)) return true;
    const pending = getPending(room.id);
    if (pending?.type === 'itinerary') {
      if (ITINERARY_SHARE_RE.test(text)) { await shareTripFromText(room.id, pending.tripId); return true; }
      if (ITINERARY_TOGETHER_RE.test(text)) { await makeGatheringFromText(room.id, pending.tripId); return true; }
    }
  }
  try { return await agentTurn(room, text, photoUrl, msgId); } catch (e) { warn('senior agent failed, using the offline pipeline:', e); return false; }
}

// ── 4.1 interview ───────────────────────────────────────────────────────────
async function startInterview(room: Room, photoUrl: string): Promise<void> {
  clearProactiveMemory();
  const old = ctx.db.kv.get<InterviewState>(kInterview(room.id));
  if (old) { const d = ctx.db.memories.get(old.memoryId); if (d?.status === 'draft') ctx.db.memories.delete(d.id); }
  const memoryId = uid('mem');
  const draft: Memory = {
    id: memoryId, ownerId: SENIOR_ID, photoUrl, title: st('senior.newMemoryTitle'), story: '', summary: '', people: [], emotions: [], tags: [],
    visibility: 'private', status: 'draft', createdAt: nowIso(),
  };
  ctx.db.memories.put(draft);
  emitMemory(draft);
  setPending(room.id, null);
  const ai = await withTyping(room.id, () => ctx.brain.startInterview({ memoryId, photoUrl, photoPath: resolvePhotoPath(photoUrl), senior: senior() }));
  ctx.db.kv.set(kInterview(room.id), ai.value.state);
  await tachiSay(room.id, { text: ai.value.reply, quickReplies: ai.value.quickReplies }, ai);
}

async function interviewTurn(room: Room, state: InterviewState, text: string): Promise<void> {
  const ai = await withTyping(room.id, () => ctx.brain.interviewTurn(state, text, senior()));
  const turn = ai.value;
  ctx.db.kv.set(kInterview(room.id), turn.state);
  if (!turn.done) {
    await tachiSay(room.id, { text: turn.reply, quickReplies: turn.quickReplies }, ai);
    return;
  }
  const extracting = ctx.brain.extractMemory(turn.state, senior());
  extracting.catch(() => undefined);
  await tachiSay(room.id, { text: turn.reply }, ai);
  const ex = await withTyping(room.id, () => extracting);
  await finalizeMemory(room, turn.state, ex);
}

async function finalizeMemory(room: Room, state: InterviewState, ex: Awaited<ReturnType<typeof ctx.brain.extractMemory>>): Promise<void> {
  const draft = ctx.db.memories.get(state.memoryId);
  const mem: Memory = {
    id: state.memoryId, ownerId: SENIOR_ID, photoUrl: draft?.photoUrl ?? state.photoUrl,
    ...ex.value, people: ex.value.people ?? [], emotions: ex.value.emotions ?? [], tags: ex.value.tags ?? [],
    visibility: 'private', status: 'saved', createdAt: draft?.createdAt ?? nowIso(),
  };
  ctx.db.kv.del(kInterview(room.id));
  await commitMemory(room, mem, ex);
}

/**
 * Persist a finished memory (SQLite + graph), then ask for consent to share: a private memory_card with share / keep-private buttons.
 * Used by the offline interview and by the LLM agent's `save_memory`.
 */
export async function commitMemory(room: Room, mem: Memory, ai: { model: string; fallback: boolean; source?: 'llm' | 'heuristic' | 'rule' }): Promise<Memory> {
  ctx.db.memories.put(mem);
  setLastMemory(mem.id);
  const delta = await ctx.graph.upsertMemory(mem);
  for (const p of mem.people) {
    if (p.relation) await ctx.graph.linkFamily(p.name, p.relation, senior().name).catch(() => undefined);
  }
  emitMemory(mem);
  emitGraphDelta(delta, mem);
  logSeniorSession('memory', st('senior.sess.photoStory'), st('senior.sess.photoStorySummary', { title: mem.title }), mem.id);

  const payload: MemoryCardPayload = { type: 'memory_card', memoryId: mem.id, memory: mem, graphDelta: delta };
  await tachiSay(room.id, {
    text: st('senior.saved'),
    quickReplies: [st('senior.saved.yes'), st('senior.saved.no')],
    meta: memMeta(mem.id),
  }, ai);
  const actions: CardAction[] = [
    { id: 'share_memory', label: st('senior.btn.share'), style: 'primary', data: { memoryId: mem.id } },
    { id: 'skip_share', label: st('senior.btn.keep'), data: { memoryId: mem.id } },
  ];
  const card = post(room.id, { senderId: TACHI_ID, kind: 'memory_card', text: `${mem.title} · ${mem.summary}`, payload, actions, meta: { model: ai.model, fallback: ai.fallback, ...memMeta(mem.id) } });
  setPending(room.id, { type: 'share_confirm', memoryId: mem.id, messageId: card.id });
  return mem;
}

// ── text routing ────────────────────────────────────────────────────────────
/** Replies that continue the memory Tachi just brought up in a proactive greeting. */
const CONTINUE_RE = new RegExp([
  /(그\s*(사진|이야기|얘기)|얘기해?\s*(줄게|할게|해\s*줄까)|이야기해?\s*(줄게|할게)|들려\s*(줄게|드릴게)|기억(이\s*)?나|보여\s*(줘|줄게|드릴게)|^\s*(응|네|예|어|그래|그럼|그렇지)[\s,.!~요]*$|^\s*(그래|그럼|응|네)[\s,.!~]+(얘기|이야기|기억|보여))/.source,
  /\b(that|the) (photo|picture|story|one)\b|\b(let me|i'?ll|i will|shall i) (tell|share)\b|\bi remember\b|\bshow me\b|^\s*(yes|yeah|yep|sure|okay|ok|of course|go ahead|please|alright)[\s,.!~]*$|^\s*(yes|yeah|sure|okay|ok|alright)[\s,.!~]+(tell|let|that|i|go|show)/.source,
].join('|'), 'i');
const DECLINE_RE = new RegExp(/(다음에|나중에|싫|아니|안\s*할|됐어|괜찮아$)/.source + '|' + /\b(not now|maybe later|another time|next time|no thanks?|i don'?t (want|feel)|never ?mind|not really)\b|^\s*no\b/.source, 'i');
const ITINERARY_SHARE_RE = new RegExp(/가족(에게|한테)\s*보내/.source + '|' + /\b(send|share|forward|show)\b[^.?!]*\b(family|kids|children|everyone)\b/.source, 'i');
const ITINERARY_TOGETHER_RE = new RegExp(/가족(과|이랑)\s*(함께|같이)\s*가/.source + '|' + /\b(go|come|travel|join|visit)\b[^.?!]*\b(with|together)\b[^.?!]*\b(family|kids|children)\b|\bwith (the |my )?(family|kids|children)\b/.source, 'i');

/** An acceptance arrived while a trip offer for the active memory is reserved but not posted: remember it. */
function queueAcceptIfReserved(): boolean {
  if (!offerReserved.size) return false;
  const last = ctx.db.kv.get<string>('last-memory');
  const memId = (last && offerReserved.has(last) ? last : [...offerReserved][0]) as ID;
  if (hasLiveTrip(memId)) return false;
  queuedAccept.set(memId, ctx.gen);
  return true;
}

async function handleSeniorText(room: Room, text: string): Promise<void> {
  const interview = ctx.db.kv.get<InterviewState>(kInterview(room.id));
  if (interview && !interview.done) return interviewTurn(room, interview, text);
  if (await tryMomAvailability(text)) return;

  const pending = getPending(room.id);
  if (pending?.type === 'itinerary') {
    if (ITINERARY_SHARE_RE.test(text)) return shareTripFromText(room.id, pending.tripId);
    if (ITINERARY_TOGETHER_RE.test(text)) return makeGatheringFromText(room.id, pending.tripId);
  }
  const pm = getProactiveMemory();
  const proactiveMem = pm ? ctx.db.memories.get(pm.memoryId) : undefined;
  if (proactiveMem && proactiveMem.status === 'saved' && !confirmationActive(room.id) && CONTINUE_RE.test(text) && !DECLINE_RE.test(text)) {
    return continueMemory(room, proactiveMem, text);
  }
  // a plain yes while the trip offer is still being prepared is remembered and honoured when it posts
  if (!pending && offerReserved.size && yesNo(text) === 'yes' && queueAcceptIfReserved()) return;
  const names = await ctx.graph.nodeNames().catch(() => [] as string[]);
  const ai = await withTyping(room.id, () => ctx.brain.classifySeniorIntent(text, { knownNodeNames: names, pending: pending?.type ?? null }));
  const intent = ai.value;
  switch (intent.type) {
    case 'yes':
      if (pending?.type === 'share_confirm') return doShare(room.id, pending.memoryId);
      if (pending?.type === 'trip_confirm') return acceptTrip(room.id, pending.tripId);
      if (queueAcceptIfReserved()) return;
      return smallTalk(room, text);
    case 'no':
      if (pending?.type === 'share_confirm') return skipShare(room.id, pending.memoryId);
      if (pending?.type === 'trip_confirm') return declineTrip(room.id, pending.tripId);
      return smallTalk(room, text);
    case 'ask_share': {
      if (pending?.type === 'itinerary') return shareTripFromText(room.id, pending.tripId);
      const id = pending?.type === 'share_confirm' ? pending.memoryId : ctx.db.kv.get<string>('last-memory');
      if (id) return doShare(room.id, id);
      return smallTalk(room, text);
    }
    case 'share_trip': return shareTripFromText(room.id, pending?.type === 'itinerary' ? pending.tripId : latestItineraryTrip()?.id);
    case 'make_gathering': return makeGatheringFromText(room.id, pending?.type === 'itinerary' ? pending.tripId : latestItineraryTrip()?.id);
    case 'recall': return doRecall(room, text, intent.keywords);
    case 'trip': return offerTripFromIntent(room, intent.destination);
    case 'health_log': return logHealth(room, text, intent.systolic, intent.diastolic);
    default: return smallTalk(room, text);
  }
}

/** The senior continued the proactive greeting's memory ('그 사진 얘기해 줄게'): recall THAT memory and ask a focused follow-up. */
async function continueMemory(room: Room, mem: Memory, text: string): Promise<void> {
  clearProactiveMemory();
  setLastMemory(mem.id);
  const ai = await withTyping(room.id, () => ctx.brain.recallReply(mem, text, senior()));
  await postRecallCard(room.id, mem, ai.value, ai);
  await tachiSay(room.id, {
    text: mem.place ? st('senior.continue.qPlace', { place: mem.place }) : st('senior.continue.q'),
    quickReplies: [st('senior.continue.c1'), st('senior.continue.c2'), st('senior.continue.c3')],
    meta: memMeta(mem.id),
  });
  logSeniorSession('memory', st('senior.sess.recall'), st('senior.sess.recallSummary', { title: mem.title }), mem.id);
}

/** A recall_card for an existing memory (graph path found by its own title / tags). */
export async function postRecallCard(roomId: ID, mem: Memory, text: string, ai?: { model: string; fallback: boolean; source?: 'llm' | 'heuristic' | 'rule' }, extra: { alternatives?: { memoryId: ID; title: string }[]; hit?: Awaited<ReturnType<typeof ctx.graph.search>>[number] } = {}): Promise<Message> {
  const hit = extra.hit ?? (await ctx.graph.search([mem.title, ...mem.tags.slice(0, 2)].filter(Boolean), { limit: 5 }).catch(() => [])).find(h => h.memoryId === mem.id);
  return tachiSay(roomId, {
    kind: 'recall_card', text,
    payload: {
      type: 'recall_card', memoryId: mem.id, memory: mem, matched: hit?.matched ?? [], path: hit?.path ?? { nodes: [], edges: [] },
      cypher: hit?.cypher, alternatives: extra.alternatives ?? [],
    },
    meta: memMeta(mem.id),
  }, ai);
}

// ── observations (medication / mood) ────────────────────────────────────────
const slotNow = (): '아침' | '점심' | '저녁' => { const h = now().getHours(); return h < 11 ? '아침' : h < 16 ? '점심' : '저녁'; };

/** Persist a structured observation into HealthSummary. Returns what was actually stored. */
export function applyObservation(obs: SeniorObservation | undefined): { medication: boolean; mood: boolean; ask: boolean } {
  const done = { medication: false, mood: false, ask: false };
  if (!obs) return done;
  const h: HealthSummary = getHealth() ?? { updatedAt: nowIso(), bloodPressure: [], medications: [], sleepHours: [], steps: [], mood: [], notes: [] };
  const today = ymd(now());
  const med = obs.medication;
  if (med && typeof med.taken === 'boolean') {
    const todays = h.medications.filter(m => m.date === today);
    const explicit = !!(med.name || med.time);
    const lc = (x: string) => x.toLowerCase();
    const byName = med.name ? todays.filter(m => lc(m.name).includes(lc(med.name!)) || lc(med.name!).includes(lc(m.name))) : todays;
    const bySlot = med.time ? byName.filter(m => m.time === med.time) : byName;
    // write only for an explicitly identified dose, or when exactly one dose is due right now; otherwise ask
    const candidates = explicit ? bySlot : todays.filter(m => m.time === slotNow());
    if (candidates.length > 1 || (!explicit && candidates.length === 0)) {
      done.ask = true;
    } else {
      const target = candidates[0];
      if (target) {
        h.medications = h.medications.map(m => (m === target ? { ...m, taken: med.taken } : m));
      } else {
        const name = med.name ?? st('senior.defaultMed');
        h.medications = [...h.medications, { date: today, name, time: med.time ?? slotNow(), taken: med.taken }];
      }
      h.medications = h.medications.slice(-28);
      done.medication = true;
    }
  }
  if (typeof obs.mood === 'string' && obs.mood.trim()) {
    h.mood = [...h.mood.filter(x => x.date !== today), { date: today, label: obs.mood.trim().slice(0, 12) }].slice(-7);
    done.mood = true;
  }
  if (done.medication || done.mood) {
    h.updatedAt = nowIso();
    ctx.db.kv.set('health', h);
    emitHealth();
  }
  return done;
}

/** Never claim a recording that did not happen: drop the sentences that say so. */
export const RECORD_CLAIM_RE = /기록|적어\s*(둘|두|놓|놨)|메모|\b(record(ed|ing)?|noted?|jot(ted)?|logged?|write (it |that )?down|wrote)\b/i;
export function stripRecordClaims(reply: string): string {
  const parts = reply.split(/(?<=[.!?요다])\s+/).filter(p => !RECORD_CLAIM_RE.test(p));
  const out = parts.join(' ').trim();
  return out || st('senior.thanksTelling');
}

async function smallTalk(room: Room, text: string): Promise<void> {
  const history = ctx.db.messages.byRoom(room.id, 10)
    .filter(m => (m.kind === 'text' || m.kind === 'photo') && m.text)
    .map(m => ({ role: m.senderId === TACHI_ID ? 'assistant' as const : 'user' as const, text: m.text }));
  const ai = await withTyping(room.id, () => ctx.brain.seniorChat(history, text, senior()));
  const { quickReplies, category, observation } = ai.value;
  let reply = ai.value.reply;
  const stored = applyObservation(observation);
  if (RECORD_CLAIM_RE.test(reply)) reply = stripRecordClaims(reply);
  let chips = quickReplies;
  if (stored.ask) { reply = st('senior.askWhichMed'); chips = [st('senior.askWhichMed.c1'), st('senior.askWhichMed.c2')]; }
  else if (stored.medication) reply = `${reply} ${st('senior.noteMed')}`;
  else if (stored.mood) reply = `${reply} ${st('senior.noteMood')}`;
  await tachiSay(room.id, { text: reply, quickReplies: chips, meta: { category } }, ai);
  if (!ctx.db.kv.get<string>('active-proactive')) {
    const title = st(`senior.sess.cat.${category}`);
    logSeniorSession(category, title, st('senior.sess.catSummary', { title }));
  }
}

// ── 4.2 share ───────────────────────────────────────────────────────────────
async function cardMessage(roomId: ID, kind: Message['kind'], key: 'memoryId' | 'tripId', id: ID): Promise<Message | undefined> {
  return ctx.db.messages.byRoom(roomId, 80).reverse().find(m => m.kind === kind && (m.payload as Record<string, unknown> | undefined)?.[key] === id);
}

/** Trips derived from `memoryId` follow the memory's family visibility. */
function syncTripVisibility(memoryId: ID, visibility: 'family' | 'private'): void {
  for (const t of ctx.db.trips.all()) {
    if (t.memoryId !== memoryId || t.visibility === visibility) continue;
    t.visibility = visibility;
    ctx.db.trips.put(t);
    emitTrip(t);
  }
}

export async function doShare(roomId: ID, memoryId: ID, opts: { refuse?: boolean } = {}): Promise<void> {
  const mem = ctx.db.memories.get(memoryId);
  if (!mem || mem.status !== 'saved' || mem.ownerId !== SENIOR_ID) { await tachiSay(roomId, { text: st('senior.share.notFound') }); return; }
  const card = await cardMessage(roomId, 'memory_card', 'memoryId', memoryId);
  if (mem.sharedAt && memoryVisibleToFamily(mem)) {
    setPending(roomId, null);
    if (card) markActionDone(card, undefined, 'share_memory');
    await tachiSay(roomId, { text: st('senior.share.already'), meta: memMeta(mem.id) });
    return;
  }
  if (!canShareToFamily(mem)) {
    // keep the card actions and the pending confirmation usable
    await tachiSay(roomId, {
      text: st('senior.share.categoryPrivate'),
      meta: { ...memMeta(mem.id), source: 'rule' },
    });
    if (opts.refuse) throw new ActionRefused('memory category private');
    return;
  }

  const ai = await withTyping(roomId, () => ctx.brain.shareSummary(mem, senior()));
  if (!canShareToFamily(mem)) { // privacy may have changed while the summary was generated
    await tachiSay(roomId, { text: st('senior.share.categoryPrivate'), meta: { ...memMeta(mem.id), source: 'rule' } });
    if (opts.refuse) throw new ActionRefused('memory category private');
    return;
  }
  const prevShared = mem.sharedAt;
  const prevVisibility = mem.visibility;
  mem.sharedAt = nowIso();
  ctx.db.memories.put(mem);
  applyMemoryVisibility(mem.id, 'family');
  const people = mem.people.map(p => p.name);
  let shared: Message;
  try {
    shared = await tachiSay(FAMILY_ROOM_ID, {
      kind: 'share_card', text: ai.value.summary,
      payload: { type: 'share_card', memoryId: mem.id, title: ai.value.title, summary: ai.value.summary, photoUrl: mem.photoUrl, era: mem.era, place: mem.place, people },
      meta: memMeta(mem.id),
    }, ai);
  } catch (e) { // not committed: roll back so the action can be retried
    mem.sharedAt = prevShared;
    ctx.db.memories.put(mem);
    applyMemoryVisibility(mem.id, prevVisibility);
    throw e;
  }
  syncTripVisibility(mem.id, 'family');
  setPending(roomId, null);
  setLastMemory(mem.id);
  if (card) markActionDone(card, undefined, 'share_memory'); // committed
  reactBots(FAMILY_ROOM_ID, shared);
  await tachiSay(roomId, { text: st('senior.share.sent'), meta: memMeta(mem.id) });
  scheduleOffer(roomId, mem, 1500);
}

export async function skipShare(roomId: ID, memoryId: ID, opts: { quiet?: boolean } = {}): Promise<void> {
  const mem = ctx.db.memories.get(memoryId);
  if (mem && mem.status === 'saved') {
    delete mem.sharedAt;
    ctx.db.memories.put(mem);
    applyMemoryVisibility(mem.id, 'private');
    syncTripVisibility(mem.id, 'private');
  }
  setPending(roomId, null);
  const card = await cardMessage(roomId, 'memory_card', 'memoryId', memoryId);
  if (card) markActionDone(card, undefined, 'skip_share');
  if (!opts.quiet) await tachiSay(roomId, { text: st('senior.share.skipped'), meta: { ...memMeta(memoryId), source: 'rule' } });
}

// ── 4.3 recall ──────────────────────────────────────────────────────────────
async function doRecall(room: Room, text: string, keywords: string[]): Promise<void> {
  clearProactiveMemory();
  const kws = keywords.length ? keywords : text.split(/[\s,.!?]+/).filter(w => w.length > 1);
  const hits = (await ctx.graph.search(kws.length ? kws : [text], { limit: 5 })).filter(h => ctx.db.memories.get(h.memoryId)?.status === 'saved');
  const best = hits[0];
  const mem = best && ctx.db.memories.get(best.memoryId);
  if (!best || !mem) {
    await tachiSay(room.id, { text: st('senior.recall.none'), quickReplies: [st('senior.recall.none.c1')] });
    return;
  }
  setLastMemory(mem.id);
  const ai = await withTyping(room.id, () => ctx.brain.recallReply(mem, text, senior()));
  const alternatives = hits.slice(1).filter(h => h.memoryId !== mem.id).slice(0, 2)
    .map(h => ({ memoryId: h.memoryId, title: ctx.db.memories.get(h.memoryId)!.title }));
  await tachiSay(room.id, {
    kind: 'recall_card', text: ai.value,
    payload: { type: 'recall_card', memoryId: mem.id, memory: mem, matched: best.matched, path: best.path, cypher: best.cypher, alternatives },
    meta: memMeta(mem.id),
  }, ai);
  logSeniorSession('memory', st('senior.sess.recall'), st('senior.sess.recallSummary', { title: mem.title }), mem.id);
  const pending = getPending(room.id);
  if (!pending) scheduleOffer(room.id, mem, 1500);
  else if (pending.type === 'trip_confirm') await resurfaceTripOffer(room.id, pending.tripId);
}

/** Cards carrying accept/decline for one trip (the original offer and any re-surfaced reminders). */
function tripOfferCards(roomId: ID, tripId: ID): Message[] {
  return ctx.db.messages.byRoom(roomId, 80).filter(m => m.senderId === TACHI_ID
    && !!m.actions?.some(a => a.id === 'accept_trip' && a.data?.tripId === tripId));
}

/** After a recall the pending offer would be buried: say it again with the SAME trip's controls (no second Trip). */
async function resurfaceTripOffer(roomId: ID, tripId: ID): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip || trip.status !== 'suggested') return;
  const open = tripOfferCards(roomId, tripId).filter(m => m.actions?.some(a => a.id === 'accept_trip' && !a.done));
  const last = ctx.db.messages.byRoom(roomId, 1).at(-1);
  if (last && open.some(m => m.id === last.id)) return; // already the latest thing on screen
  for (const m of open) if (m.kind !== 'trip_suggestion') markActionDone(m); // retire older reminders
  const m = await tachiSay(roomId, {
    text: st('senior.trip.resurface', { destination: trip.suggestion.destination }),
    actions: [
      { id: 'accept_trip', label: st('senior.btn.accept'), style: 'primary', data: { tripId } },
      { id: 'decline_trip', label: st('senior.btn.decline'), data: { tripId } },
    ],
    meta: tripMeta(tripId, trip.memoryId),
  });
  void m;
}

function settleTripCards(roomId: ID, tripId: ID, chosen: 'accept_trip' | 'decline_trip'): void {
  for (const m of tripOfferCards(roomId, tripId)) markActionDone(m, undefined, chosen);
}

// ── 4.4 trip ────────────────────────────────────────────────────────────────
async function offerTripFromIntent(room: Room, destination?: string): Promise<void> {
  const mems = ctx.db.memories.all().filter(m => m.status === 'saved');
  const last = ctx.db.kv.get<string>('last-memory');
  const mem = (destination ? mems.find(m => m.place?.includes(destination)) : undefined)
    ?? mems.find(m => m.id === last) ?? mems.at(-1);
  if (!mem) { await tachiSay(room.id, { text: st('senior.trip.where') }); return; }
  if (offerReserved.has(mem.id)) { queuedAccept.set(mem.id, ctx.gen); return; } // she wants to go: accept as soon as the offer posts
  offerReserved.add(mem.id);
  try { await offerTrip(room.id, mem); } finally { offerReserved.delete(mem.id); queuedAccept.delete(mem.id); }
}

export const hasLiveTrip = (memoryId: ID) => ctx.db.trips.all().some(t => t.memoryId === memoryId && t.status !== 'declined');
const interviewActive = (roomId: ID) => { const i = ctx.db.kv.get<InterviewState>(kInterview(roomId)); return !!i && !i.done; };
const confirmationActive = (roomId: ID) => { const p = getPending(roomId); return p?.type === 'share_confirm' || p?.type === 'trip_confirm'; };

/** Reserve ONE trip offer per memory synchronously and deliver it through the senior room queue. */
function scheduleOffer(roomId: ID, mem: Memory, delayMs: number): void {
  if (offerReserved.has(mem.id) || hasLiveTrip(mem.id)) return;
  offerReserved.add(mem.id);
  later(delayMs, () => enqueue(roomId, async () => {
    try {
      if (interviewActive(roomId) || confirmationActive(roomId) || hasLiveTrip(mem.id)) return;
      await offerTrip(roomId, mem);
    } finally { offerReserved.delete(mem.id); queuedAccept.delete(mem.id); }
  }));
  // `later` drops the callback after a reset; release the reservation then too
  const gen = ctx.gen;
  setTimeout(() => { if (gen !== ctx.gen) { offerReserved.delete(mem.id); queuedAccept.delete(mem.id); } }, delayMs + 50);
}

function startPlan(tripId: ID, suggestion: Trip['suggestion']): Promise<PlanResult> {
  const { type: _t, ...sugg } = suggestion;
  void _t;
  const p = ctx.brain.planItinerary(sugg, senior());
  p.catch(() => { if (plans.get(tripId) === p) plans.delete(tripId); });
  plans.set(tripId, p);
  return p;
}

export async function offerTrip(roomId: ID, mem: Memory): Promise<void> {
  const ai = await withTyping(roomId, () => ctx.brain.suggestTrip(mem, senior()));
  if (interviewActive(roomId) || confirmationActive(roomId)) return;
  const tripId = uid('trip');
  const suggestion = { type: 'trip_suggestion' as const, tripId, memoryId: mem.id, ...ai.value };
  const trip: Trip = {
    id: tripId, memoryId: mem.id, visibility: memoryVisibleToFamily(mem) ? 'family' : 'private', status: 'suggested', suggestion, createdAt: nowIso(),
  };
  ctx.db.trips.put(trip);
  emitTrip(trip);
  void startPlan(tripId, suggestion); // plan in the background so the acceptance feels instant
  const m = await tachiSay(roomId, {
    kind: 'trip_suggestion', text: `${suggestion.title}. ${suggestion.reason}`, payload: suggestion,
    actions: [
      { id: 'accept_trip', label: st('senior.btn.accept'), style: 'primary', data: { tripId } },
      { id: 'decline_trip', label: st('senior.btn.decline'), data: { tripId } },
    ],
    meta: tripMeta(tripId, mem.id),
  }, ai);
  setPending(roomId, { type: 'trip_confirm', tripId, messageId: m.id });
  if (queuedAccept.get(mem.id) === ctx.gen) { // she already said yes while the offer was being prepared
    queuedAccept.delete(mem.id);
    await acceptTrip(roomId, tripId);
  }
}

export async function acceptTrip(roomId: ID, tripId: ID): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip || trip.status === 'declined') return;
  if (trip.itinerary) { // idempotent retry
    settleTripCards(roomId, tripId, 'accept_trip');
    if (getPending(roomId)?.type === 'trip_confirm') setPending(roomId, null);
    return;
  }
  const plan = plans.get(tripId) ?? startPlan(tripId, trip.suggestion);
  const ai = await withTyping(roomId, () => plan).catch(e => { plans.delete(tripId); throw e; });
  const itinerary = { type: 'itinerary' as const, tripId, ...ai.value };
  trip.status = 'accepted';
  trip.itinerary = itinerary;
  ctx.db.trips.put(trip);
  emitTrip(trip);
  plans.delete(tripId);
  const posted = await tachiSay(roomId, {
    kind: 'itinerary', text: st('senior.itinerary.made', { title: itinerary.title }), payload: itinerary,
    actions: [
      { id: 'share_trip', label: st('senior.btn.shareTrip'), data: { tripId } },
      { id: 'make_gathering', label: st('senior.btn.gather'), style: 'primary', data: { tripId } },
    ],
    meta: tripMeta(tripId, trip.memoryId),
  }, ai);
  settleTripCards(roomId, tripId, 'accept_trip'); // committed
  setPending(roomId, { type: 'itinerary', tripId, messageId: posted.id });
}

export async function declineTrip(roomId: ID, tripId: ID, opts: { quiet?: boolean } = {}): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (trip) { trip.status = 'declined'; ctx.db.trips.put(trip); emitTrip(trip); }
  plans.delete(tripId);
  setPending(roomId, null);
  settleTripCards(roomId, tripId, 'decline_trip');
  if (!opts.quiet) await tachiSay(roomId, { text: st('senior.trip.declined'), meta: tripMeta(tripId, trip?.memoryId) });
}

async function shareTrip(roomId: ID, tripId: ID, card: Message): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip?.itinerary) throw new Error('itinerary missing');
  const wasVisibility = trip.visibility;
  const wasShared = (trip as { sharedSeparately?: boolean }).sharedSeparately;
  trip.visibility = 'family';
  (trip as { sharedSeparately?: boolean }).sharedSeparately = true; // explicit separate consent: survives the source memory going private
  ctx.db.trips.put(trip);
  emitTrip(trip);
  let m: Message;
  try {
    m = await tachiSay(FAMILY_ROOM_ID, {
      kind: 'itinerary', text: st('senior.trip.familyText', { destination: trip.itinerary.destination }), payload: trip.itinerary,
      meta: tripMeta(tripId, trip.memoryId),
    });
  } catch (e) {
    trip.visibility = wasVisibility;
    (trip as { sharedSeparately?: boolean }).sharedSeparately = wasShared;
    ctx.db.trips.put(trip);
    emitTrip(trip);
    throw e;
  }
  markActionDone(card, 'share_trip'); // committed
  if (getPending(roomId)?.type === 'itinerary') setPending(roomId, null);
  reactBots(FAMILY_ROOM_ID, m);
  await tachiSay(roomId, { text: st('senior.trip.sent'), meta: tripMeta(tripId, trip.memoryId) });
}

function latestItineraryTrip(): Trip | undefined {
  return ctx.db.trips.all().filter(t => t.itinerary).at(-1);
}

async function shareTripFromText(roomId: ID, tripId?: ID): Promise<void> {
  const trip = tripId ? ctx.db.trips.get(tripId) : undefined;
  const card = trip?.itinerary ? await cardMessage(roomId, 'itinerary', 'tripId', trip.id) : undefined;
  if (!trip?.itinerary || !card) { await tachiSay(roomId, { text: st('senior.trip.noneToSend') }); return; }
  if (card.actions?.find(a => a.id === 'share_trip')?.done) { await tachiSay(roomId, { text: st('senior.trip.alreadySent'), meta: tripMeta(trip.id, trip.memoryId) }); return; }
  await shareTrip(roomId, trip.id, card);
}

async function makeGatheringFromText(roomId: ID, tripId?: ID): Promise<void> {
  const trip = tripId ? ctx.db.trips.get(tripId) : undefined;
  const card = trip?.itinerary ? await cardMessage(roomId, 'itinerary', 'tripId', trip.id) : undefined;
  if (!trip?.itinerary || !card) { await tachiSay(roomId, { text: st('senior.trip.noneToGather') }); return; }
  if (card.actions?.find(a => a.id === 'make_gathering')?.done) { await tachiSay(roomId, { text: st('senior.trip.alreadyGathering'), meta: tripMeta(trip.id, trip.memoryId) }); return; }
  await makeGathering(roomId, trip.id, card);
}

async function makeGathering(roomId: ID, tripId: ID, card: Message): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip) throw new Error('trip missing');
  if (ctx.db.artifacts.all().some(a => a.linkedTripId === tripId)) { // idempotent retry: the plan already exists
    markActionDone(card, 'make_gathering');
    if (getPending(roomId)?.type === 'itinerary') setPending(roomId, null);
    return;
  }
  const mem = trip.memoryId ? ctx.db.memories.get(trip.memoryId) : undefined;
  const mom = senior();
  // a gathering shows the trip to the family: it is shared with them from here on
  if (trip.visibility !== 'family') { trip.visibility = 'family'; (trip as { sharedSeparately?: boolean }).sharedSeparately = true; ctx.db.trips.put(trip); emitTrip(trip); }
  await tachiSay(FAMILY_ROOM_ID, { text: st('senior.trip.gatherFamilyText', { destination: trip.suggestion.destination }), meta: tripMeta(tripId, trip.memoryId) });
  await createGathering(FAMILY_ROOM_ID, mom, st('senior.trip.gatherProposal', { title: trip.suggestion.title }), { memory: mem && memoryVisibleToFamily(mem) ? mem : undefined, trip });
  markActionDone(card, 'make_gathering'); // committed
  if (getPending(roomId)?.type === 'itinerary') setPending(roomId, null);
  await tachiSay(roomId, { text: st('senior.trip.gatherDone'), meta: tripMeta(tripId, trip.memoryId) });
}

// ── actions on senior-side cards ────────────────────────────────────────────
/**
 * Senior-only card actions. Defense in depth (the dispatcher authorizes too): the actor must be the senior,
 * the message must live in her room and carry the action; resource ids come from the stored action/payload only.
 * Throws (so the client ack reports failure) when refused or when the operation did not commit; a card is
 * marked `done` only after its operation committed.
 */
export async function handleSeniorAction(roomId: ID, msg: Message, actionId: string, _clientData?: Record<string, unknown>, actorId?: ID): Promise<void> {
  void _clientData; // never trusted
  if (actorId !== undefined && actorId !== SENIOR_ID) throw new ActionDenied('not the owner');
  if (roomId !== SENIOR_ROOM_ID || msg.roomId !== SENIOR_ROOM_ID) throw new ActionDenied('not the senior room');
  const stored = ctx.db.messages.get(msg.id);
  if (!stored || stored.roomId !== SENIOR_ROOM_ID) throw new ActionDenied('unknown message');
  const act = stored.actions?.find(a => a.id === actionId);
  if (!act) throw new ActionDenied('unknown action');
  if (act.done) return;
  const payload = stored.payload as { memoryId?: ID; tripId?: ID } | undefined;
  const memoryId = (act.data?.memoryId ?? payload?.memoryId) as ID | undefined;
  const tripId = (act.data?.tripId ?? payload?.tripId) as ID | undefined;
  switch (actionId) {
    case 'share_memory': if (memoryId) await doShare(roomId, memoryId, { refuse: true }); break;
    case 'skip_share': if (memoryId) await skipShare(roomId, memoryId); break;
    case 'accept_trip': if (tripId) await acceptTrip(roomId, tripId); break;
    case 'decline_trip': if (tripId) await declineTrip(roomId, tripId); break;
    case 'share_trip': if (tripId) await shareTrip(roomId, tripId, stored); break;
    case 'make_gathering': if (tripId) await makeGathering(roomId, tripId, stored); break;
    default: break;
  }
}

// ── health log ──────────────────────────────────────────────────────────────
export async function logHealth(room: Room, text: string, sys?: number, dia?: number): Promise<void> {
  if (!sys || !dia) return smallTalk(room, text);
  const a = assessBloodPressure({ systolic: sys, diastolic: dia });
  if (a.level === 'invalid') {
    await tachiSay(room.id, {
      text: st('senior.bp.invalid', { sys, dia }),
      meta: { category: 'health', source: 'rule' },
    });
    return;
  }
  const h: HealthSummary = getHealth() ?? { updatedAt: nowIso(), bloodPressure: [], medications: [], sleepHours: [], steps: [], mood: [], notes: [] };
  const today = ymd(now());
  h.bloodPressure = [...h.bloodPressure.filter(b => b.date !== today), { date: today, systolic: sys, diastolic: dia }].slice(-7);
  h.updatedAt = nowIso();
  ctx.db.kv.set('health', h);
  emitHealth();
  const reading = st('senior.bp.reading', { sys, dia });
  let advice: string;
  const urgent = a.level === 'crisis';
  if (urgent) {
    advice = st('senior.bp.crisis');
  } else if (a.level === 'low') {
    advice = st('senior.bp.low');
  } else if (a.level === 'elevated' || a.level === 'high') {
    advice = st('senior.bp.high');
  } else {
    advice = st('senior.bp.ok');
  }
  await tachiSay(room.id, { text: `${reading} ${advice}`, meta: { category: 'health', source: 'rule' } });
  if (urgent && healthForFamily()) {
    await tachiSay(FAMILY_ROOM_ID, {
      text: st('senior.bp.familyAlert', { sys, dia }),
      meta: { category: 'health', source: 'rule' },
    });
  }
  logSeniorSession('health', st('senior.sess.health'), st('senior.sess.healthSummary'));
}
