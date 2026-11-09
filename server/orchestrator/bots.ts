// Unclaimed family personas act as AI bots (4.9).
import { BOT_SLOT_PREFS, KIN_RELATIONS, SENIOR_ID, TACHI_ID } from '../../shared/constants';
import type { ID, Message, Poll, User } from '../../shared/types';
import { ctx } from './ctx';
import { displayName, emitTyping, getDemo, getUser, isAssistedOnly, later, post, senior } from './core';
import { rand, shuffle } from '../util/misc';
import { submitAvailability } from './scheduling';

const CARD_KINDS = new Set(['share_card', 'artifact', 'schedule_result', 'report', 'health_card', 'itinerary']);

function botsOn(): boolean { return !!getDemo()?.botsEnabled; }

/** Candidate bot personas for a room: unclaimed family members, never the sender, never Tachi or the senior. */
function candidates(roomId: ID, excludeId?: ID): User[] {
  const room = ctx.db.rooms.get(roomId);
  if (!room) return [];
  return room.memberIds
    .filter(id => id !== TACHI_ID && id !== SENIOR_ID && id !== excludeId)
    .map(getUser)
    .filter((u): u is User => !!u && u.isBot && u.role === 'family');
}

export async function botSpeak(roomId: ID, user: User, trigger: { kind: string; text: string }): Promise<Message | null> {
  if (!user.isBot) return null;
  emitTyping(roomId, user.id);
  const recent = ctx.db.messages.byRoom(roomId, 8).map(m => ({ sender: displayName(m.senderId), text: m.text }));
  const ai = await ctx.brain.botReply({ persona: user, senior: senior(), recent, trigger });
  const text = (ai.value ?? '').trim();
  if (!text) return null;
  const current = getUser(user.id);
  if (!current?.isBot) return null; // a human claimed this persona meanwhile
  return post(roomId, {
    senderId: user.id, text,
    meta: { generatedBy: 'bot', model: ai.model, fallback: ai.fallback, source: ai.source ?? (ai.fallback ? 'heuristic' : 'llm') },
  });
}

/**
 * React to a family-room trigger: a human message or a Tachi card. Bot messages never call this,
 * so bots can't chain onto each other.
 */
export function reactBots(roomId: ID, trigger: Message, as?: { kind: string; text: string }): void {
  if (!botsOn()) return;
  const room = ctx.db.rooms.get(roomId);
  if (!room || room.type !== 'family') return;
  const fromTachi = trigger.senderId === TACHI_ID;
  if (fromTachi && !as && !CARD_KINDS.has(trigger.kind)) return;
  const health = trigger.kind === 'health_card' || as?.kind === 'health_card';
  const pool = shuffle(candidates(roomId, fromTachi ? undefined : trigger.senderId)
    .filter(u => !health || KIN_RELATIONS.includes(u.relation ?? '')));
  let chosen = pool.filter(() => Math.random() < 0.6).slice(0, 2);
  if (!chosen.length && fromTachi && pool.length) chosen = [pool[0]];
  chosen.forEach((u, i) => {
    later(rand(1200, 3500) + i * 900, async () => { await botSpeak(roomId, u, as ?? { kind: trigger.kind, text: trigger.text }); });
  });
}

// ── schedule answers ────────────────────────────────────────────────────────
const WD = ['일', '월', '화', '수', '목', '금', '토'];

function natural(poll: Poll, slotId: ID): string {
  const s = poll.slots.find(x => x.id === slotId);
  if (!s) return '';
  const d = new Date(s.startsAt);
  const idx = poll.slots.indexOf(s);
  const when = d.getHours() < 15 ? '점심' : '저녁';
  return `${idx >= 4 ? '다음 주 ' : ''}${WD[d.getDay()]}요일 ${when}`;
}

export function slotLine(poll: Poll, slotIds: ID[], userId: ID): string {
  const names = slotIds.slice(0, 2).map(id => natural(poll, id)).filter(Boolean);
  if (userId === SENIOR_ID) return slotIds.length >= poll.slots.length ? '난 아무 때나 괜찮다. 너희 편한 날로 하렴' : `${names.join(', ')} 좋구나`;
  if (!names.length) return '이번엔 어렵겠어요';
  return names.length === 1 ? `${names[0]}이면 괜찮아요` : `${names[0]}, ${names[1]} 가능해요`;
}

/** Can a bot answer for this persona right now? Unclaimed, or only held by Director-stage phones. */
const canStandIn = (userId: ID) => !!getUser(userId)?.isBot || isAssistedOnly(userId);

/**
 * Every unclaimed participant answers the schedule request after 1.5–4s using BOT_SLOT_PREFS.
 * Personas held only by Director-stage phones answer after 6–8s, unless the presenter tapped first.
 */
export function scheduleBotAnswers(poll: Poll): void {
  if (!botsOn()) return;
  for (const userId of poll.participantIds) {
    if (!canStandIn(userId)) continue;
    const delay = getUser(userId)?.isBot ? rand(1500, 4000) : rand(6000, 8000);
    later(delay, async () => {
      const fresh = ctx.db.polls.get(poll.id);
      if (!fresh || fresh.status !== 'open' || fresh.responses[userId]) return;
      if (!canStandIn(userId)) return;
      const prefs = (BOT_SLOT_PREFS[userId] ?? [2, 3]).map(i => fresh.slots[i]?.id).filter((x): x is string => !!x);
      const roomId = fresh.sideRoomIds[userId];
      if (!roomId) return;
      emitTyping(roomId, userId);
      await new Promise(r => setTimeout(r, 600));
      post(roomId, {
        senderId: userId, text: slotLine(fresh, prefs, userId),
        meta: { generatedBy: getUser(userId)?.isBot ? 'bot' : 'assisted' },
      });
      await submitAvailability(fresh.id, userId, prefs);
    });
  }
}

export async function greetInvitee(roomId: ID, user: User): Promise<void> {
  if (!botsOn() || !user.isBot) return;
  later(1500, async () => { await botSpeak(roomId, user, { kind: 'system', text: '초대' }); });
}

