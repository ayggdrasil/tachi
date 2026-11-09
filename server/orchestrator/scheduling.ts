// Gathering schedule coordination (4.7): poll, per-member side rooms, live progress, result.
import { FAMILY_ROOM_ID, SENIOR_ID, SENIOR_ROOM_ID, TACHI_ID, pad2 } from '../../shared/constants';
import { st } from '../i18n';
import { candidateSlots, dateL } from './locale';
import type { Artifact, ID, Message, Poll, Room, ScheduleProgressPayload, ScheduleRequestPayload, ScheduleResultPayload, Slot } from '../../shared/types';
import { ctx } from './ctx';
import {
  emitPoll, emitRoomTo, getUser, isMember, joinRoomSockets, markActionDone, now, post, tachiSay, updateMessage, withTyping,
} from './core';
import { emitArtifact, latestOpenArtifact } from './artifacts';
import { reactBots, scheduleBotAnswers } from './bots';
import { nowIso, uid } from '../util/misc';
import { replanTaskDueDates, tryTaskReply } from './tasks';

function openPoll(familyRoomId: ID): Poll | undefined {
  return ctx.db.polls.all().filter(p => p.familyRoomId === familyRoomId && p.status === 'open').at(-1);
}

function findMessage(roomId: ID, kind: Message['kind'], pollId: ID): Message | undefined {
  return ctx.db.messages.byRoom(roomId, 60).reverse().find(m => m.kind === kind && (m.payload as { pollId?: ID } | undefined)?.pollId === pollId);
}

function progressPayload(p: Poll): ScheduleProgressPayload {
  const responded = p.participantIds.filter(id => p.responses[id]);
  return { type: 'schedule_progress', pollId: p.id, responded, waiting: p.participantIds.filter(id => !p.responses[id]) };
}

type ProgressStage = 'closed' | 'candidate' | 'confirmed';
function refreshProgress(p: Poll, stage?: ProgressStage): void {
  const m = p.progressMessageId ? ctx.db.messages.get(p.progressMessageId) : undefined;
  if (!m) return;
  const pl = progressPayload(p);
  m.payload = pl;
  m.text = `${st('sched.progress', { n: pl.responded.length, total: p.participantIds.length })}${p.status === 'closed' && stage ? ` · ${st(`sched.stage.${stage}`)}` : ''}`;
  updateMessage(m);
}

function sideRoomFor(userId: ID, title: string, pollId: ID): Room {
  const existing = ctx.db.rooms.all().find(r => r.type === 'side' && r.memberIds.includes(userId) && r.memberIds.length === 2);
  const room: Room = existing
    ? { ...existing, title, pollId }
    : { id: uid('room-side'), type: 'side', title, memberIds: [TACHI_ID, userId], createdBy: TACHI_ID, createdAt: nowIso(), pollId };
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  emitRoomTo(room);
  return room;
}

export async function startScheduling(familyRoomId: ID, asker: { id: ID }, opts: { slots?: Slot[]; repoll?: boolean; artifactId?: ID } = {}): Promise<void> {
  const family = ctx.db.rooms.get(familyRoomId);
  if (!family) return;
  if (openPoll(familyRoomId)) {
    await tachiSay(familyRoomId, { text: st('sched.alreadyRunning') });
    return;
  }
  let artifact: Artifact | undefined;
  if (opts.artifactId) {
    const picked = ctx.db.artifacts.get(opts.artifactId);
    if (!picked || picked.roomId !== familyRoomId) throw new Error('artifact not in this room');
    artifact = picked;
  } else artifact = latestOpenArtifact(familyRoomId);
  const title = artifact?.title ?? st('sched.defaultTitle');
  const participants = family.memberIds.filter(id => id !== TACHI_ID && getUser(id));
  const slots = opts.slots ?? candidateSlots(now());
  const poll: Poll = {
    id: uid('poll'), artifactId: artifact?.id, familyRoomId, title, slots, participantIds: participants, sideRoomIds: {}, responses: {},
    status: 'open', createdAt: nowIso(),
  };
  for (const id of participants) poll.sideRoomIds[id] = id === SENIOR_ID ? SENIOR_ROOM_ID : sideRoomFor(id, st('sched.roomTitle', { title }), poll.id).id;
  ctx.db.polls.put(poll);
  if (artifact) {
    artifact.dateStatus = 'polling';
    artifact.pollId = poll.id;
    artifact.updatedBy = TACHI_ID;
    artifact.updatedAt = nowIso();
    ctx.db.artifacts.put(artifact);
    emitArtifact(artifact);
  }

  await tachiSay(familyRoomId, { text: opts.repoll ? st('sched.repollIntro') : st('sched.intro') });
  const progress = post(familyRoomId, {
    senderId: TACHI_ID, kind: 'schedule_progress', text: st('sched.progress', { n: 0, total: participants.length }), payload: progressPayload(poll),
  });
  poll.progressMessageId = progress.id;
  ctx.db.polls.put(poll);
  emitPoll(poll);

  await Promise.all(participants.map(async id => {
    const roomId = poll.sideRoomIds[id];
    const u = getUser(id)!;
    const text = id === SENIOR_ID
      ? st('sched.askMom')
      : st('sched.askOther', { name: u.shortName, title });
    await tachiSay(roomId, { text });
    const payload: ScheduleRequestPayload = { type: 'schedule_request', pollId: poll.id, artifactTitle: title, slots };
    post(roomId, { senderId: TACHI_ID, kind: 'schedule_request', text: st('sched.requestText', { title }), payload });
  }));
  scheduleBotAnswers(poll);
  void asker;
}

export async function submitAvailability(pollId: ID, userId: ID, slotIds: ID[], opts: { standIn?: () => boolean } = {}): Promise<boolean> {
  const poll = ctx.db.polls.get(pollId);
  if (!poll || poll.status !== 'open' || !poll.participantIds.includes(userId)) return false;
  if (opts.standIn && (poll.responses[userId] || !opts.standIn())) return false; // a stand-in never overwrites a human answer
  const valid = [...new Set(slotIds)].filter(id => poll.slots.some(s => s.id === id));
  poll.responses[userId] = valid;
  ctx.db.polls.put(poll);
  emitPoll(poll);

  const roomId = poll.sideRoomIds[userId];
  const req = roomId ? findMessage(roomId, 'schedule_request', pollId) : undefined;
  if (req && req.payload?.type === 'schedule_request') {
    req.payload = { ...req.payload, selectedSlotIds: valid, answered: true };
    updateMessage(req);
  }
  refreshProgress(poll);

  const labels = valid.map(id => poll.slots.find(s => s.id === id)?.label).filter(Boolean);
  const ack = valid.length
    ? st('sched.ack', { lead: userId === SENIOR_ID ? st('sched.ack.mom') : st('sched.ack.other'), labels: labels.length <= 2 ? st('sched.ack.labels', { labels: labels.join(', ') }) : '' })
    : st('sched.ackNone');
  if (roomId) await tachiSay(roomId, { text: ack });

  const fresh = ctx.db.polls.get(pollId);
  if (fresh && fresh.status === 'open' && fresh.participantIds.every(id => fresh.responses[id])) await closePoll(pollId);
  return true;
}

/** Best candidate: the senior must be available if anyone can make it with her; most available; tie -> earliest. */
function bestSlot(poll: Poll): { slot: Slot; available: ID[] } {
  const avail = (slotId: ID) => poll.participantIds.filter(u => poll.responses[u]?.includes(slotId));
  const withMom = poll.slots.filter(s => avail(s.id).includes(SENIOR_ID));
  const pool = withMom.length && poll.participantIds.includes(SENIOR_ID) ? withMom : poll.slots;
  let best = pool[0];
  for (const s of pool) if (avail(s.id).length > avail(best.id).length) best = s; // ties keep the earliest
  return { slot: best, available: avail(best.id) };
}

async function announceConfirmed(poll: Poll, slot: Slot): Promise<void> {
  await Promise.all([...new Set(Object.values(poll.sideRoomIds))].map(roomId =>
    tachiSay(roomId, { text: st('sched.gatherAt', { label: slot.label }) })));
}

export async function closePoll(pollId: ID): Promise<void> {
  const poll = ctx.db.polls.get(pollId);
  if (!poll || poll.status !== 'open') return;
  const { slot: best, available } = bestSlot(poll);
  // disjoint: available / answered-but-can't-make-it / not answered
  const unanswered = poll.participantIds.filter(u => !poll.responses[u]);
  const unavailable = poll.participantIds.filter(u => poll.responses[u] && !available.includes(u));
  const total = poll.participantIds.length;
  const unanimous = available.length === total;
  poll.status = 'closed';
  poll.resultSlotId = best.id;
  ctx.db.polls.put(poll);
  emitPoll(poll);
  refreshProgress(poll, unanimous ? 'confirmed' : unanswered.length ? 'closed' : 'candidate');

  const artifact = poll.artifactId ? ctx.db.artifacts.get(poll.artifactId) : undefined;
  if (artifact) {
    artifact.dateStatus = unanimous ? 'confirmed' : 'polling';
    artifact.dateLabel = best.label;
    if (unanimous) artifact.slot = best;
    artifact.updatedBy = TACHI_ID;
    artifact.updatedAt = nowIso();
    ctx.db.artifacts.put(artifact);
    emitArtifact(artifact);
  }
  const payload: ScheduleResultPayload = {
    type: 'schedule_result', pollId, slot: best, available, unavailable, artifactId: artifact?.id,
    unanimous, confirmed: unanimous, unanswered,
  };
  const res = unanimous
    ? await tachiSay(poll.familyRoomId, { kind: 'schedule_result', text: st('sched.decided', { label: best.label, n: available.length, total }), payload })
    : await tachiSay(poll.familyRoomId, {
      kind: 'schedule_result',
      text: st('sched.candidate', { n: available.length, total, label: best.label, unanswered: unanswered.length ? st('sched.candidate.unanswered', { k: unanswered.length }) : '' }),
      payload,
      actions: [
        { id: 'confirm_slot', label: st('sched.btn.confirm'), style: 'primary', data: { pollId, slotId: best.id } },
        { id: 'repoll', label: st('sched.btn.repoll'), data: { pollId } },
      ],
    });
  reactBots(poll.familyRoomId, res, unanimous ? { kind: 'schedule_result', text: st('sched.react.confirmed', { label: best.label }) } : { kind: 'text', text: st('sched.react.candidate', { label: best.label }) });
  if (unanimous) {
    await announceConfirmed(poll, best);
    if (artifact) replanTaskDueDates(artifact.id); // due dates follow the confirmed slot (never throws)
  }
}

/** Family-room actions on a non-unanimous result card: confirm_slot / repoll. */
export async function handleScheduleAction(userId: ID, msg: Message, actionId: string, data?: Record<string, unknown>): Promise<void> {
  const room = ctx.db.rooms.get(msg.roomId);
  if (!room || !isMember(room, userId)) return;
  const act = msg.actions?.find(a => a.id === actionId);
  if (act?.done) return;
  const res = msg.payload as ScheduleResultPayload | undefined;
  if (!res || res.type !== 'schedule_result') return;
  const pollId = (typeof data?.pollId === 'string' ? data.pollId : res.pollId) as ID;
  const poll = ctx.db.polls.get(pollId);
  if (!poll || poll.status !== 'closed' || res.confirmed) return;
  if (actionId === 'confirm_slot') {
    const slotId = typeof data?.slotId === 'string' ? data.slotId : res.slot.id;
    const slot = poll.slots.find(x => x.id === slotId) ?? res.slot;
    msg.payload = { ...res, slot, confirmed: true };
    msg.text = st('sched.confirmedText', { label: slot.label, n: res.available.length, total: poll.participantIds.length });
    markActionDone(msg);
    refreshProgress(poll, 'confirmed');
    poll.resultSlotId = slot.id;
    ctx.db.polls.put(poll);
    emitPoll(poll);
    const artifact = poll.artifactId ? ctx.db.artifacts.get(poll.artifactId) : undefined;
    if (artifact) {
      artifact.dateStatus = 'confirmed';
      artifact.dateLabel = slot.label;
      artifact.slot = slot;
      artifact.updatedBy = TACHI_ID;
      artifact.updatedAt = nowIso();
      ctx.db.artifacts.put(artifact);
      emitArtifact(artifact);
    }
    reactBots(poll.familyRoomId, msg, { kind: 'schedule_result', text: st('sched.react.confirmed', { label: slot.label }) });
    await announceConfirmed(poll, slot);
    if (artifact) replanTaskDueDates(artifact.id);
  } else if (actionId === 'repoll') {
    markActionDone(msg);
    const shifted: Slot[] = poll.slots.map((sl, i) => {
      const d = new Date(sl.startsAt);
      d.setDate(d.getDate() + 7);
      return { id: `slot-${i}`, startsAt: d.toISOString(), label: `${dateL(d)} ${pad2(d.getHours())}:00` };
    });
    await startScheduling(poll.familyRoomId, { id: userId }, { slots: shifted, repoll: true, artifactId: poll.artifactId });
  }
}

/** Director "확정" / demo:closePoll. Returns false when no poll is open. */
export async function forceClosePoll(): Promise<boolean> {
  const p = openPoll(FAMILY_ROOM_ID) ?? ctx.db.polls.all().filter(x => x.status === 'open').at(-1);
  if (!p) return false;
  await closePoll(p.id);
  return true;
}

export async function handlePickSlots(userId: ID, msg: Message, data?: Record<string, unknown>): Promise<void> {
  const p = msg.payload as ScheduleRequestPayload | undefined;
  if (!p || p.type !== 'schedule_request') return;
  if (!Array.isArray(data?.slotIds)) return;
  const slotIds = (data!.slotIds as unknown[]).filter((x): x is string => typeof x === 'string'); // [] = '이번엔 모두 어려워요'
  await submitAvailability(p.pollId, userId, slotIds);
}

export async function handleSideMessage(room: Room, userId: ID, text?: string): Promise<void> {
  if (!text) return;
  if (await tryTaskReply(room, userId, text)) return; // 완료 / 도움 필요 / 나중에 to a to-do reminder
  const poll = room.pollId ? ctx.db.polls.get(room.pollId) : undefined;
  if (!poll || poll.status !== 'open') {
    await tachiSay(room.id, { text: st('sched.alreadySet') });
    return;
  }
  const ai = await withTyping(room.id, () => ctx.brain.parseAvailability(text, poll.slots));
  if (!ai.value.length && NEGATIVE_RE.test(text)) {
    await submitAvailability(poll.id, userId, []);
    return;
  }
  if (!ai.value.length) {
    await tachiSay(room.id, { text: st('sched.reask') }, ai);
    return;
  }
  await submitAvailability(poll.id, userId, ai.value);
}

const NEGATIVE_RE = new RegExp([
  /(다|모두|전부|아무\s*때도)\s*(안|어려|못)|안 돼요?$|못 가/.source,
  /\b(can'?t|cannot|can not|won'?t|unable to)\b[^.?!]*\b(make|come|go|attend|do)\b|\bnot (available|free)\b|\bnone of (them|those|the)\b|\bno (time|day)s? (works?|is good)\b|\b(too )?busy\b/.source,
].join('|'), 'i');
const AVAIL_RE = new RegExp([
  /(토요일|일요일|토|일|주말|\d+\s*일|이번|다음\s*주|아무\s*때|언제든|다 괜찮|다 좋)/.source,
  /\b(sat(urday)?|sun(day)?|weekend|this (week|weekend)|next (week|weekend)|any ?time|whenever|any day|all (of them )?(work|are fine|are good)|\d{1,2}(st|nd|rd|th))\b/.source,
].join('|'), 'i');
const stripMeal = (t: string) => t
  .replace(/(오늘|내일)?\s*(아침|점심|저녁)\s*(먹|드|식사|뭐)\S*/g, '')
  .replace(/\b(have you|did you|had|ate|eaten|eating|having|what('?s| is| for))\b[^.?!]*\b(breakfast|lunch|dinner)\b[^.?!]*/gi, '');
const ALL_AVAIL_RE = new RegExp([
  /(다|전부|모두|언제(나|든|라도)?|아무\s*(때|날)(나|든)?|어느\s*(때|날)(나|든)?)\s*(돼|되|가능|괜찮|좋|상관)|아무\s*(때|날)나|상관\s*없/.source,
  /\b(any ?time|any day|whenever|all (of them )?(work|are fine|are good|is fine)|everything works|i'?m (free|flexible)|doesn'?t matter|don'?t mind)\b/.source,
].join('|'), 'i');
const SLOT_WORD_RE = new RegExp(/(점심|저녁|오전|오후|아침)/.source + '|' + /\b(lunch|dinner|morning|afternoon|evening|noon)\b/.source, 'i');

/** True while the schedule_request is the latest thing in the senior's room (a direct reply to it). */
function directReply(poll: Poll): boolean {
  const last = ctx.db.messages.byRoom(SENIOR_ROOM_ID, 4);
  const i = last.map(m => m.kind === 'schedule_request' && (m.payload as { pollId?: string } | undefined)?.pollId === poll.id).lastIndexOf(true);
  // the current message is already posted: at most that one senior text may follow the request
  return i >= 0 && last.slice(i + 1).filter(m => m.senderId === SENIOR_ID).length <= 1;
}

/** The senior may answer an open poll by typing in her own room (only when she hasn't answered). */
export async function tryMomAvailability(text: string): Promise<boolean> {
  const poll = ctx.db.polls.all().filter(p => p.status === 'open' && p.participantIds.includes(SENIOR_ID) && !p.responses[SENIOR_ID]).at(-1);
  if (!poll) return false;
  const stripped = stripMeal(text);
  const allAvail = ALL_AVAIL_RE.test(stripped) && !NEGATIVE_RE.test(text) && directReply(poll);
  if (!(AVAIL_RE.test(stripped) || NEGATIVE_RE.test(text) || allAvail || (SLOT_WORD_RE.test(stripped) && directReply(poll)))) return false;
  const ai = await withTyping(SENIOR_ROOM_ID, () => ctx.brain.parseAvailability(text, poll.slots));
  if (!ai.value.length) {
    if (allAvail) { await submitAvailability(poll.id, SENIOR_ID, poll.slots.map(x => x.id)); return true; }
    if (!NEGATIVE_RE.test(text)) return false;
    await submitAvailability(poll.id, SENIOR_ID, []);
    return true;
  }
  await submitAvailability(poll.id, SENIOR_ID, ai.value);
  return true;
}

