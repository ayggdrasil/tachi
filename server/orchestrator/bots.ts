// Unclaimed family personas act as AI bots (4.9).
import { BOT_SLOT_PREFS, SENIOR_ID, TACHI_ID, isKinRelation } from '../../shared/constants';
import { serverLocale, st } from '../i18n';
import type { ID, Message, MessageMeta, Poll, User } from '../../shared/types';
import { ctx } from './ctx';
import { displayName, emitTyping, getDemo, getUser, isAssistedOnly, later, messageFor, post, senior } from './core';
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

/** Provenance of a trigger message: what memory / trip / privacy category a reaction to it would be derived from. */
export function provenanceOf(m?: Message): Partial<MessageMeta> {
  if (!m) return {};
  const p = m.payload;
  const out: Partial<MessageMeta> = {};
  const memoryId = m.meta?.memoryId ?? (p && (p.type === 'share_card' || p.type === 'memory_card' || p.type === 'recall_card') ? p.memoryId : undefined);
  const tripId = m.meta?.tripId ?? (p && (p.type === 'trip_suggestion' || p.type === 'itinerary') ? p.tripId : undefined);
  const category = m.meta?.category ?? (m.kind === 'health_card' || p?.type === 'health_card' ? 'health' : undefined);
  if (memoryId) out.memoryId = memoryId;
  if (tripId) out.tripId = tripId;
  if (category) out.category = category;
  if (m.meta?.categoriesUsed?.length) out.categoriesUsed = [...m.meta.categoriesUsed];
  if (m.meta?.memoryIdsUsed?.length) out.memoryIdsUsed = [...m.meta.memoryIdsUsed];
  if (m.meta?.tripIdsUsed?.length) out.tripIdsUsed = [...m.meta.tripIdsUsed];
  return out;
}

const words = (t: string): Set<string> => new Set(t.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1));
/** Two lines carry the same idea when most of the shorter one's words are in the other ("I'll drive Mom" ≈ "Thanks. I can drive Mom"). */
export function sameIdea(a: string, b: string): boolean {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return a.trim() === b.trim();
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  const shared = [...small].filter(w => big.has(w)).length;
  return shared / small.size >= 0.7;
}

/** Is a stored message (still) fully visible to this persona? Hidden / redacted triggers must not be reacted to. */
function visibleTo(userId: ID, m: Message): boolean {
  const view = messageFor(userId, m);
  return view.text === m.text && view.kind === m.kind;
}

export async function botSpeak(
  roomId: ID, user: User, trigger: { kind: string; text: string }, triggerMsg?: Message,
): Promise<Message | null> {
  if (!user.isBot) return null;
  const stored = triggerMsg ? ctx.db.messages.get(triggerMsg.id) ?? triggerMsg : undefined;
  if (stored && !visibleTo(user.id, stored)) return null;
  emitTyping(roomId, user.id);
  // context is what this persona may see right now (privacy-projected), not the raw stored history
  const recent = ctx.db.messages.byRoom(roomId, 8).map(m => messageFor(user.id, m)).map(m => ({ sender: displayName(m.senderId), text: m.text }));
  const ownRecent = ctx.db.messages.byRoom(roomId, 60).filter(m => m.senderId === user.id && m.text).slice(-4).map(m => m.text);
  const ai = await ctx.brain.botReply({ persona: user, senior: senior(), recent, trigger, ownRecent });
  const text = (ai.value ?? '').trim();
  if (!text) return null;
  if (ownRecent.some(prev => sameIdea(prev, text))) return null; // a relative who says the same thing again just stays quiet
  const current = getUser(user.id);
  if (!current?.isBot) return null; // a human claimed this persona meanwhile
  const latest = stored ? ctx.db.messages.get(stored.id) ?? stored : undefined;
  if (latest && !visibleTo(user.id, latest)) return null; // the trigger became private while the brain was thinking
  return post(roomId, {
    senderId: user.id, text,
    meta: { ...provenanceOf(latest), generatedBy: 'bot', model: ai.model, fallback: ai.fallback, source: ai.source ?? (ai.fallback ? 'heuristic' : 'llm') },
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
    .filter(u => !health || isKinRelation(u.relation ?? '')));
  let chosen = pool.filter(() => Math.random() < 0.6).slice(0, 2);
  if (!chosen.length && fromTachi && pool.length) chosen = [pool[0]];
  chosen.forEach((u, i) => {
    later(rand(1200, 3500) + i * 900, async () => { await botSpeak(roomId, u, as ?? { kind: trigger.kind, text: trigger.text }, trigger); });
  });
}

// ── schedule answers ────────────────────────────────────────────────────────
const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function natural(poll: Poll, slotId: ID): string {
  const s = poll.slots.find(x => x.id === slotId);
  if (!s) return '';
  const d = new Date(s.startsAt);
  const idx = poll.slots.indexOf(s);
  const next = idx >= 4;
  if (serverLocale() === 'ko') return `${next ? '다음 주 ' : ''}${WD_KO[d.getDay()]}요일 ${d.getHours() < 15 ? '점심' : '저녁'}`;
  return `${next ? 'next ' : ''}${WD_EN[d.getDay()]} ${d.getHours() < 15 ? 'lunch' : 'dinner'}`;
}

export function slotLine(poll: Poll, slotIds: ID[], userId: ID): string {
  const names = slotIds.slice(0, 2).map(id => natural(poll, id)).filter(Boolean);
  if (userId === SENIOR_ID) return slotIds.length >= poll.slots.length ? st('slot.mom.any') : st('slot.mom.some', { names: names.join(', ') });
  if (!names.length) return st('slot.none');
  return names.length === 1 ? st('slot.one', { a: names[0] }) : st('slot.two', { a: names[0], b: names[1] });
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
      // the world may have changed during the typing delay: reload and recheck everything before speaking for anyone
      const again = ctx.db.polls.get(poll.id);
      if (!again || again.status !== 'open' || again.responses[userId] || !botsOn() || !canStandIn(userId)) return;
      post(roomId, {
        senderId: userId, text: slotLine(again, prefs, userId),
        meta: { generatedBy: getUser(userId)?.isBot ? 'bot' : 'assisted' },
      });
      await submitAvailability(again.id, userId, prefs, { standIn: () => canStandIn(userId) });
    });
  }
}

export async function greetInvitee(roomId: ID, user: User): Promise<void> {
  if (!botsOn() || !user.isBot) return;
  later(1500, async () => { await botSpeak(roomId, user, { kind: 'system', text: st('bot.inviteTrigger') }); });
}

