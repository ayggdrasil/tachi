// Senior (Tachi room) flows: 4.1 interview, 4.2 share, 4.3 recall, 4.4 trip, health log, small talk.
import fs from 'node:fs';
import path from 'node:path';
import { FAMILY_ROOM_ID, SENIOR_ID, TACHI_ID, USERS } from '../../shared/constants';
import type {
  CardAction, HealthSummary, ID, Memory, MemoryCardPayload, Message, PrivacyCategory, Room, Trip,
} from '../../shared/types';
import type { InterviewState } from '../brain/contract';
import { ctx } from './ctx';
import {
  applyMemoryVisibility, emitGraphDelta, emitHealth, healthForFamily, emitMemory, emitTrip, enqueue, getHealth, getPrivacy, later, markActionDone, now, post,
  senior, tachiSay, withTyping,
} from './core';
import { createGathering } from './artifacts';
import { reactBots } from './bots';
import { noteSeniorReply } from './proactive';
import { logSeniorSession } from './sessions';
import { tryMomAvailability } from './scheduling';
import { nowIso, uid, ymd } from '../util/misc';

type Pending =
  | { type: 'share_confirm'; memoryId: ID; messageId?: ID }
  | { type: 'trip_confirm'; tripId: ID; messageId?: ID }
  | { type: 'itinerary'; tripId: ID; messageId?: ID };

/** Memories whose trip offer is scheduled or being generated (one offer per memory). */
const offerReserved = new Set<ID>();

const kInterview = (roomId: ID) => `interview:${roomId}`;
const kPending = (roomId: ID) => `pending:${roomId}`;
const getPending = (roomId: ID) => ctx.db.kv.get<Pending>(kPending(roomId));
const setPending = (roomId: ID, p: Pending | null) => { if (p) ctx.db.kv.set(kPending(roomId), p); else ctx.db.kv.del(kPending(roomId)); };
const setLastMemory = (id: ID) => ctx.db.kv.set('last-memory', id);

function resolvePhotoPath(url: string): string | undefined {
  try {
    const name = path.basename(decodeURIComponent(url.split('?')[0]));
    const p = url.startsWith('/uploads/') ? path.join(ctx.dataDir, 'uploads', name)
      : url.startsWith('/demo-photos/') ? path.join(ctx.rootDir, 'demo', 'photos', name) : undefined;
    return p && fs.existsSync(p) ? p : undefined;
  } catch { return undefined; }
}

// ── entry point ─────────────────────────────────────────────────────────────
export async function handleSeniorInput(room: Room, userId: ID, text?: string, photoUrl?: string): Promise<void> {
  try {
    if (photoUrl) await startInterview(room, photoUrl);
    else if (text) await handleSeniorText(room, text);
  } finally {
    if (userId === SENIOR_ID) noteSeniorReply(room.id);
  }
}

// ── 4.1 interview ───────────────────────────────────────────────────────────
async function startInterview(room: Room, photoUrl: string): Promise<void> {
  const old = ctx.db.kv.get<InterviewState>(kInterview(room.id));
  if (old) { const d = ctx.db.memories.get(old.memoryId); if (d?.status === 'draft') ctx.db.memories.delete(d.id); }
  const memoryId = uid('mem');
  const draft: Memory = {
    id: memoryId, ownerId: SENIOR_ID, photoUrl, title: '새 추억', story: '', summary: '', people: [], emotions: [], tags: [],
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
  ctx.db.memories.put(mem);
  ctx.db.kv.del(kInterview(room.id));
  setLastMemory(mem.id);
  const delta = await ctx.graph.upsertMemory(mem);
  for (const p of mem.people) {
    if (p.relation) await ctx.graph.linkFamily(p.name, p.relation, USERS[0].name).catch(() => undefined);
  }
  emitMemory(mem);
  emitGraphDelta(delta, mem);
  logSeniorSession('memory', '옛 사진 이야기', `${mem.title} 이야기를 나누셨어요.`, mem.id);

  const payload: MemoryCardPayload = { type: 'memory_card', memoryId: mem.id, memory: mem, graphDelta: delta };
  await tachiSay(room.id, {
    text: '소중한 추억을 잘 간직했어요. 지금은 어머님만 볼 수 있어요. 가족에게 공유할까요?',
    quickReplies: ['네, 보내주세요', '나만 간직할게요'],
  }, ex);
  const actions: CardAction[] = [
    { id: 'share_memory', label: '가족에게 공유하기', style: 'primary', data: { memoryId: mem.id } },
    { id: 'skip_share', label: '나만 간직할게요', data: { memoryId: mem.id } },
  ];
  const card = post(room.id, { senderId: TACHI_ID, kind: 'memory_card', text: `${mem.title} · ${mem.summary}`, payload, actions, meta: { model: ex.model, fallback: ex.fallback, category: 'memory' } });
  setPending(room.id, { type: 'share_confirm', memoryId: mem.id, messageId: card.id });
}

// ── text routing ────────────────────────────────────────────────────────────
async function handleSeniorText(room: Room, text: string): Promise<void> {
  const interview = ctx.db.kv.get<InterviewState>(kInterview(room.id));
  if (interview && !interview.done) return interviewTurn(room, interview, text);
  if (await tryMomAvailability(text)) return;

  const pending = getPending(room.id);
  if (pending?.type === 'itinerary') {
    if (/가족(에게|한테)\s*보내/.test(text)) return shareTripFromText(room.id, pending.tripId);
    if (/가족(과|이랑)\s*(함께|같이)\s*가/.test(text)) return makeGatheringFromText(room.id, pending.tripId);
  }
  const names = await ctx.graph.nodeNames().catch(() => [] as string[]);
  const ai = await withTyping(room.id, () => ctx.brain.classifySeniorIntent(text, { knownNodeNames: names, pending: pending?.type ?? null }));
  const intent = ai.value;
  switch (intent.type) {
    case 'yes':
      if (pending?.type === 'share_confirm') return doShare(room.id, pending.memoryId);
      if (pending?.type === 'trip_confirm') return acceptTrip(room.id, pending.tripId);
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

async function smallTalk(room: Room, text: string): Promise<void> {
  const history = ctx.db.messages.byRoom(room.id, 10)
    .filter(m => (m.kind === 'text' || m.kind === 'photo') && m.text)
    .map(m => ({ role: m.senderId === TACHI_ID ? 'assistant' as const : 'user' as const, text: m.text }));
  const ai = await withTyping(room.id, () => ctx.brain.seniorChat(history, text, senior()));
  const { reply, quickReplies, category } = ai.value;
  await tachiSay(room.id, { text: reply, quickReplies, meta: { category } }, ai);
  if (!ctx.db.kv.get<string>('active-proactive')) {
    const title = ({ health: '건강 이야기', mood: '기분 이야기', memory: '추억 이야기', trip: '나들이 이야기', daily: '일상 대화' } as Record<PrivacyCategory, string>)[category] ?? '일상 대화';
    logSeniorSession(category, title, `${title}를 나누셨어요.`);
  }
}

// ── 4.2 share ───────────────────────────────────────────────────────────────
async function cardMessage(roomId: ID, kind: Message['kind'], key: 'memoryId' | 'tripId', id: ID): Promise<Message | undefined> {
  return ctx.db.messages.byRoom(roomId, 80).reverse().find(m => m.kind === kind && (m.payload as Record<string, unknown> | undefined)?.[key] === id);
}

export async function doShare(roomId: ID, memoryId: ID): Promise<void> {
  const mem = ctx.db.memories.get(memoryId);
  if (!mem || mem.status !== 'saved') { await tachiSay(roomId, { text: '공유할 추억을 찾지 못했어요. 사진을 한 장 보여주실래요?' }); return; }
  setPending(roomId, null);
  const card = await cardMessage(roomId, 'memory_card', 'memoryId', memoryId);
  if (card) markActionDone(card);
  if (mem.sharedAt) { await tachiSay(roomId, { text: '이 추억은 이미 가족방에 전해 드렸어요.' }); return; }

  const ai = await withTyping(roomId, () => ctx.brain.shareSummary(mem, senior()));
  mem.sharedAt = nowIso();
  ctx.db.memories.put(mem);
  applyMemoryVisibility(mem.id, 'family');
  setLastMemory(mem.id);

  const people = mem.people.map(p => p.name);
  const shared = await tachiSay(FAMILY_ROOM_ID, {
    kind: 'share_card', text: ai.value.summary,
    payload: { type: 'share_card', memoryId: mem.id, title: ai.value.title, summary: ai.value.summary, photoUrl: mem.photoUrl, era: mem.era, place: mem.place, people },
    meta: { category: 'memory' },
  }, ai);
  reactBots(FAMILY_ROOM_ID, shared);
  await tachiSay(roomId, { text: '가족방에 전해 드렸어요.' });
  scheduleOffer(roomId, mem, 1500);
}

async function skipShare(roomId: ID, memoryId: ID): Promise<void> {
  setPending(roomId, null);
  const card = await cardMessage(roomId, 'memory_card', 'memoryId', memoryId);
  if (card) markActionDone(card);
  const mem = ctx.db.memories.get(memoryId);
  if (mem && mem.status === 'saved') {
    delete mem.sharedAt;
    ctx.db.memories.put(mem);
    applyMemoryVisibility(mem.id, 'private');
  }
  await tachiSay(roomId, { text: '알겠어요. 이 추억은 어머님만 보실 수 있게 비공개로 간직할게요.', meta: { source: 'rule' } });
}

// ── 4.3 recall ──────────────────────────────────────────────────────────────
async function doRecall(room: Room, text: string, keywords: string[]): Promise<void> {
  const kws = keywords.length ? keywords : text.split(/[\s,.!?]+/).filter(w => w.length > 1);
  const hits = (await ctx.graph.search(kws.length ? kws : [text], { limit: 5 })).filter(h => ctx.db.memories.get(h.memoryId)?.status === 'saved');
  const best = hits[0];
  const mem = best && ctx.db.memories.get(best.memoryId);
  if (!best || !mem) {
    await tachiSay(room.id, { text: '아직 그 이야기는 못 들었어요. 사진 한 장 보여주실래요?', quickReplies: ['사진 보여줄게'] });
    return;
  }
  setLastMemory(mem.id);
  const ai = await withTyping(room.id, () => ctx.brain.recallReply(mem, text, senior()));
  const alternatives = hits.slice(1).filter(h => h.memoryId !== mem.id).slice(0, 2)
    .map(h => ({ memoryId: h.memoryId, title: ctx.db.memories.get(h.memoryId)!.title }));
  await tachiSay(room.id, {
    kind: 'recall_card', text: ai.value,
    payload: { type: 'recall_card', memoryId: mem.id, memory: mem, matched: best.matched, path: best.path, cypher: best.cypher, alternatives },
    meta: { category: 'memory' },
  }, ai);
  logSeniorSession('memory', '추억 떠올리기', `${mem.title} 이야기를 다시 떠올리셨어요.`, mem.id);
  if (!getPending(room.id)) scheduleOffer(room.id, mem, 1500);
}

// ── 4.4 trip ────────────────────────────────────────────────────────────────
async function offerTripFromIntent(room: Room, destination?: string): Promise<void> {
  const mems = ctx.db.memories.all().filter(m => m.status === 'saved');
  const last = ctx.db.kv.get<string>('last-memory');
  const mem = (destination ? mems.find(m => m.place?.includes(destination)) : undefined)
    ?? mems.find(m => m.id === last) ?? mems.at(-1);
  if (!mem) { await tachiSay(room.id, { text: '어디로 가고 싶으세요? 옛 사진을 한 장 보여주시면 함께 계획해 볼게요.' }); return; }
  if (offerReserved.has(mem.id)) return;
  offerReserved.add(mem.id);
  try { await offerTrip(room.id, mem); } finally { offerReserved.delete(mem.id); }
}

const hasLiveTrip = (memoryId: ID) => ctx.db.trips.all().some(t => t.memoryId === memoryId && t.status !== 'declined');
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
    } finally { offerReserved.delete(mem.id); }
  }));
  // `later` drops the callback after a reset; release the reservation then too
  const gen = ctx.gen;
  setTimeout(() => { if (gen !== ctx.gen) offerReserved.delete(mem.id); }, delayMs + 50);
}

export async function offerTrip(roomId: ID, mem: Memory): Promise<void> {
  const ai = await withTyping(roomId, () => ctx.brain.suggestTrip(mem, senior()));
  if (interviewActive(roomId) || confirmationActive(roomId)) return;
  const tripId = uid('trip');
  const suggestion = { type: 'trip_suggestion' as const, tripId, memoryId: mem.id, ...ai.value };
  const trip: Trip = { id: tripId, memoryId: mem.id, status: 'suggested', suggestion, createdAt: nowIso() };
  ctx.db.trips.put(trip);
  emitTrip(trip);
  const m = await tachiSay(roomId, {
    kind: 'trip_suggestion', text: `${suggestion.title} — ${suggestion.reason}`, payload: suggestion,
    actions: [
      { id: 'accept_trip', label: '좋아요, 가볼래요', style: 'primary', data: { tripId } },
      { id: 'decline_trip', label: '다음에요', data: { tripId } },
    ],
    meta: { category: 'trip' },
  }, ai);
  setPending(roomId, { type: 'trip_confirm', tripId, messageId: m.id });
}

export async function acceptTrip(roomId: ID, tripId: ID): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip) return;
  setPending(roomId, null);
  const offer = await cardMessage(roomId, 'trip_suggestion', 'tripId', tripId);
  if (offer) markActionDone(offer);
  if (trip.itinerary) return;
  const { type: _t, ...sugg } = trip.suggestion;
  void _t;
  const ai = await withTyping(roomId, () => ctx.brain.planItinerary(sugg, senior()));
  const itinerary = { type: 'itinerary' as const, tripId, ...ai.value };
  trip.status = 'accepted';
  trip.itinerary = itinerary;
  ctx.db.trips.put(trip);
  emitTrip(trip);
  const posted = await tachiSay(roomId, {
    kind: 'itinerary', text: `${itinerary.title} 일정을 짜 봤어요. 천천히 둘러보세요.`, payload: itinerary,
    actions: [
      { id: 'share_trip', label: '가족에게 보내기', data: { tripId } },
      { id: 'make_gathering', label: '가족과 함께 가기', style: 'primary', data: { tripId } },
    ],
    meta: { category: 'trip' },
  }, ai);
  setPending(roomId, { type: 'itinerary', tripId, messageId: posted.id });
}

async function declineTrip(roomId: ID, tripId: ID): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  setPending(roomId, null);
  if (trip) { trip.status = 'declined'; ctx.db.trips.put(trip); emitTrip(trip); }
  const offer = await cardMessage(roomId, 'trip_suggestion', 'tripId', tripId);
  if (offer) markActionDone(offer);
  await tachiSay(roomId, { text: '네, 다음에 또 좋은 곳 알려드릴게요.' });
}

async function shareTrip(roomId: ID, tripId: ID, card: Message): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip?.itinerary) return;
  markActionDone(card, 'share_trip');
  if (getPending(roomId)?.type === 'itinerary') setPending(roomId, null);
  const m = await tachiSay(FAMILY_ROOM_ID, {
    kind: 'itinerary', text: `어머님이 ${trip.itinerary.destination} 여행 계획을 함께 보고 싶어 하세요.`, payload: trip.itinerary,
    meta: { category: 'trip' },
  });
  reactBots(FAMILY_ROOM_ID, m);
  await tachiSay(roomId, { text: '가족방에 보내 드렸어요.' });
}

function latestItineraryTrip(): Trip | undefined {
  return ctx.db.trips.all().filter(t => t.itinerary).at(-1);
}

async function shareTripFromText(roomId: ID, tripId?: ID): Promise<void> {
  const trip = tripId ? ctx.db.trips.get(tripId) : undefined;
  const card = trip?.itinerary ? await cardMessage(roomId, 'itinerary', 'tripId', trip.id) : undefined;
  if (!trip?.itinerary || !card) { await tachiSay(roomId, { text: '보내 드릴 여행 계획이 아직 없어요. 가고 싶은 곳을 말씀해 주시면 계획해 드릴게요.' }); return; }
  if (card.actions?.find(a => a.id === 'share_trip')?.done) { await tachiSay(roomId, { text: '이 여행 계획은 이미 가족방에 보내 드렸어요.' }); return; }
  await shareTrip(roomId, trip.id, card);
}

async function makeGatheringFromText(roomId: ID, tripId?: ID): Promise<void> {
  const trip = tripId ? ctx.db.trips.get(tripId) : undefined;
  const card = trip?.itinerary ? await cardMessage(roomId, 'itinerary', 'tripId', trip.id) : undefined;
  if (!trip?.itinerary || !card) { await tachiSay(roomId, { text: '함께 갈 여행 계획이 아직 없어요. 가고 싶은 곳을 말씀해 주세요.' }); return; }
  if (card.actions?.find(a => a.id === 'make_gathering')?.done) { await tachiSay(roomId, { text: '가족 모임은 이미 만들어 두었어요.' }); return; }
  await makeGathering(roomId, trip.id, card);
}

async function makeGathering(roomId: ID, tripId: ID, card: Message): Promise<void> {
  const trip = ctx.db.trips.get(tripId);
  if (!trip) return;
  markActionDone(card, 'make_gathering');
  if (getPending(roomId)?.type === 'itinerary') setPending(roomId, null);
  const mem = trip.memoryId ? ctx.db.memories.get(trip.memoryId) : undefined;
  const mom = senior();
  await tachiSay(FAMILY_ROOM_ID, { text: `어머님이 ${trip.suggestion.destination}에 가족과 함께 가고 싶어 하세요. 모임 기획서를 만들어 볼게요.` });
  await createGathering(FAMILY_ROOM_ID, mom, `${trip.suggestion.title} 가족과 함께 가요`, { memory: mem, trip });
  await tachiSay(roomId, { text: '가족방에 모임 기획서를 만들어 두었어요. 다 같이 날짜를 정해 볼게요.' });
}

// ── actions on senior-side cards ────────────────────────────────────────────
export async function handleSeniorAction(roomId: ID, msg: Message, actionId: string, data?: Record<string, unknown>): Promise<void> {
  const act = msg.actions?.find(a => a.id === actionId);
  if (act?.done) return;
  const memoryId = (data?.memoryId ?? act?.data?.memoryId ?? (msg.payload as { memoryId?: ID } | undefined)?.memoryId) as ID | undefined;
  const tripId = (data?.tripId ?? act?.data?.tripId ?? (msg.payload as { tripId?: ID } | undefined)?.tripId) as ID | undefined;
  switch (actionId) {
    case 'share_memory': if (memoryId) { markActionDone(msg); await doShare(roomId, memoryId); } break;
    case 'skip_share': if (memoryId) { markActionDone(msg); await skipShare(roomId, memoryId); } break;
    case 'accept_trip': if (tripId) { markActionDone(msg); await acceptTrip(roomId, tripId); } break;
    case 'decline_trip': if (tripId) { markActionDone(msg); await declineTrip(roomId, tripId); } break;
    case 'share_trip': if (tripId) await shareTrip(roomId, tripId, msg); break;
    case 'make_gathering': if (tripId) await makeGathering(roomId, tripId, msg); break;
    default: break;
  }
}

// ── health log ──────────────────────────────────────────────────────────────
async function logHealth(room: Room, text: string, sys?: number, dia?: number): Promise<void> {
  if (!sys || !dia) return smallTalk(room, text);
  if (sys < 70 || sys > 250 || dia < 40 || dia > 150 || sys <= dia) {
    await tachiSay(room.id, {
      text: `혈압 ${sys}에 ${dia}은 제가 잘못 들었을 수도 있어요. 편히 앉아서 잠시 쉬신 뒤에 다시 한 번 재어서 알려 주실래요?`,
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
  const reading = `혈압 ${sys}에 ${dia}으로 기록해 두었어요.`;
  let advice: string;
  let urgent = false;
  if (sys >= 180 || dia >= 120) {
    urgent = true;
    advice = '많이 높은 수치예요. 지금 바로 119나 병원에 연락해 주세요. 두통, 어지러움, 가슴 답답함이 있으면 더 서둘러 주세요.';
  } else if (sys < 90 || dia < 60) {
    advice = '조금 낮은 편이에요. 일단 편히 앉아서 물을 드시고, 잠시 후 다시 재어 보세요. 어지럽거나 힘이 없으면 병원에 연락해 주세요.';
  } else if (sys >= 140 || dia >= 90) {
    advice = '조금 높아요. 잠시 쉬었다가 다시 재어 보시고, 계속 높으면 병원에 꼭 말씀해 주세요.';
  } else {
    advice = '잘 기록해 둘게요.';
  }
  await tachiSay(room.id, { text: `${reading} ${advice}`, meta: { category: 'health', source: 'rule' } });
  if (urgent && healthForFamily()) {
    await tachiSay(FAMILY_ROOM_ID, {
      text: `어머님이 방금 혈압 ${sys}/${dia}을 기록하셨어요. 많이 높은 수치라 바로 연락해 보시고, 필요하면 병원이나 119에 도움을 요청해 주세요.`,
      meta: { category: 'health', source: 'rule' },
    });
  }
  logSeniorSession('health', '건강 기록', '혈압을 기록하셨어요.');
}
