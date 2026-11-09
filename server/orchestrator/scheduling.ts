// Gathering schedule coordination (4.7): poll, per-member side rooms, live progress, result.
import { FAMILY_ROOM_ID, SENIOR_ID, SENIOR_ROOM_ID, TACHI_ID, buildCandidateSlots } from '../../shared/constants';
import type { Artifact, ID, Message, Poll, Room, ScheduleProgressPayload, ScheduleRequestPayload } from '../../shared/types';
import { ctx } from './ctx';
import {
  emitPoll, emitRoomTo, getUser, joinRoomSockets, now, post, tachiSay, updateMessage,
} from './core';
import { emitArtifact, latestOpenArtifact } from './artifacts';
import { reactBots, scheduleBotAnswers } from './bots';
import { nowIso, uid } from '../util/misc';

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

function refreshProgress(p: Poll): void {
  const m = p.progressMessageId ? ctx.db.messages.get(p.progressMessageId) : undefined;
  if (!m) return;
  const pl = progressPayload(p);
  m.payload = pl;
  m.text = p.status === 'closed' ? `일정 응답 ${pl.responded.length}/${p.participantIds.length} · 확정` : `일정 응답 ${pl.responded.length}/${p.participantIds.length}`;
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

export async function startScheduling(familyRoomId: ID, asker: { id: ID }): Promise<void> {
  const family = ctx.db.rooms.get(familyRoomId);
  if (!family) return;
  if (openPoll(familyRoomId)) {
    await tachiSay(familyRoomId, { text: '지금 일정을 조율하고 있어요. 조금만 기다려 주세요.' });
    return;
  }
  const artifact: Artifact | undefined = latestOpenArtifact(familyRoomId);
  const title = artifact?.title ?? '가족 모임';
  const participants = family.memberIds.filter(id => id !== TACHI_ID && getUser(id));
  const slots = buildCandidateSlots(now());
  const poll: Poll = {
    id: uid('poll'), artifactId: artifact?.id, familyRoomId, title, slots, participantIds: participants, sideRoomIds: {}, responses: {},
    status: 'open', createdAt: nowIso(),
  };
  for (const id of participants) poll.sideRoomIds[id] = id === SENIOR_ID ? SENIOR_ROOM_ID : sideRoomFor(id, `일정 조율 · ${title}`, poll.id).id;
  ctx.db.polls.put(poll);
  if (artifact) {
    artifact.dateStatus = 'polling';
    artifact.pollId = poll.id;
    artifact.updatedBy = TACHI_ID;
    artifact.updatedAt = nowIso();
    ctx.db.artifacts.put(artifact);
    emitArtifact(artifact);
  }

  await tachiSay(familyRoomId, { text: '가족 한 분 한 분께 따로 여쭤볼게요.' });
  const progress = post(familyRoomId, {
    senderId: TACHI_ID, kind: 'schedule_progress', text: `일정 응답 0/${participants.length}`, payload: progressPayload(poll),
  });
  poll.progressMessageId = progress.id;
  ctx.db.polls.put(poll);
  emitPoll(poll);

  await Promise.all(participants.map(async id => {
    const roomId = poll.sideRoomIds[id];
    const u = getUser(id)!;
    const text = id === SENIOR_ID
      ? `어머님, 가족 모임 날짜를 정하려고 해요. 괜찮은 시간을 골라 주세요.`
      : `${u.shortName}님, '${title}' 날짜를 여쭤볼게요. 가능한 시간을 모두 골라 주세요.`;
    await tachiSay(roomId, { text });
    const payload: ScheduleRequestPayload = { type: 'schedule_request', pollId: poll.id, artifactTitle: title, slots };
    post(roomId, { senderId: TACHI_ID, kind: 'schedule_request', text: `${title} · 가능한 시간을 골라 주세요`, payload });
  }));
  scheduleBotAnswers(poll);
  void asker;
}

export async function submitAvailability(pollId: ID, userId: ID, slotIds: ID[]): Promise<boolean> {
  const poll = ctx.db.polls.get(pollId);
  if (!poll || poll.status !== 'open' || !poll.participantIds.includes(userId)) return false;
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
    ? `${userId === SENIOR_ID ? '알겠어요, 어머님.' : '고맙습니다!'} ${labels.length <= 2 ? labels.join(', ') + '로 ' : ''}가족에게 전해 둘게요.`
    : `알겠어요. 이번에는 어렵다고 전해 둘게요.`;
  if (roomId) await tachiSay(roomId, { text: ack });

  const fresh = ctx.db.polls.get(pollId);
  if (fresh && fresh.status === 'open' && fresh.participantIds.every(id => fresh.responses[id])) await closePoll(pollId);
  return true;
}

export async function closePoll(pollId: ID): Promise<void> {
  const poll = ctx.db.polls.get(pollId);
  if (!poll || poll.status !== 'open') return;
  const count = (slotId: ID) => poll.participantIds.filter(u => poll.responses[u]?.includes(slotId)).length;
  let best = poll.slots[0];
  for (const s of poll.slots) if (count(s.id) > count(best.id)) best = s; // ties keep the earliest
  const available = poll.participantIds.filter(u => poll.responses[u]?.includes(best.id));
  const unavailable = poll.participantIds.filter(u => !available.includes(u));
  poll.status = 'closed';
  poll.resultSlotId = best.id;
  ctx.db.polls.put(poll);
  emitPoll(poll);
  refreshProgress(poll);

  const artifact = poll.artifactId ? ctx.db.artifacts.get(poll.artifactId) : undefined;
  if (artifact) {
    artifact.dateStatus = 'confirmed';
    artifact.dateLabel = best.label;
    artifact.slot = best;
    artifact.updatedBy = TACHI_ID;
    artifact.updatedAt = nowIso();
    ctx.db.artifacts.put(artifact);
    emitArtifact(artifact);
  }
  const res = await tachiSay(poll.familyRoomId, {
    kind: 'schedule_result',
    text: `${best.label}로 정했어요. (${available.length}/${poll.participantIds.length}명 가능)`,
    payload: { type: 'schedule_result', pollId, slot: best, available, unavailable, artifactId: artifact?.id },
  });
  reactBots(poll.familyRoomId, res);
  await Promise.all([...new Set(Object.values(poll.sideRoomIds))].map(roomId =>
    tachiSay(roomId, { text: `${best.label}에 가족이 모여요.` })));
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
  const slotIds = Array.isArray(data?.slotIds) ? (data!.slotIds as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  await submitAvailability(p.pollId, userId, slotIds);
}

export async function handleSideMessage(room: Room, userId: ID, text?: string): Promise<void> {
  if (!text) return;
  const poll = room.pollId ? ctx.db.polls.get(room.pollId) : undefined;
  if (!poll || poll.status !== 'open') {
    await tachiSay(room.id, { text: '일정은 이미 정해졌어요. 가족방에서 확인해 보세요.' });
    return;
  }
  const ai = await ctx.brain.parseAvailability(text, poll.slots);
  if (!ai.value.length) {
    await tachiSay(room.id, { text: '어느 시간이 괜찮으신지 한 번만 더 알려 주실래요? 예를 들어 "일요일 점심"처럼요.' }, ai);
    return;
  }
  await submitAvailability(poll.id, userId, ai.value);
}

const AVAIL_RE = /(토요일|일요일|주말|아무때|아무 때|언제든|다 괜찮|다 좋|점심|저녁|다음 주|다음주)/;

/** The senior may answer an open poll by typing in her own room (only when she hasn't answered). */
export async function tryMomAvailability(text: string): Promise<boolean> {
  const poll = ctx.db.polls.all().filter(p => p.status === 'open' && p.participantIds.includes(SENIOR_ID) && !p.responses[SENIOR_ID]).at(-1);
  if (!poll || !AVAIL_RE.test(text)) return false;
  const ai = await ctx.brain.parseAvailability(text, poll.slots);
  if (!ai.value.length) return false;
  await submitAvailability(poll.id, SENIOR_ID, ai.value);
  return true;
}

