// Incoming message / action dispatch with per-room serialization and graceful failure.
import { DIRECTOR_ID, SENIOR_ID } from '../../shared/constants';
import type { ID, Message, Room } from '../../shared/types';
import { ctx } from './ctx';
import { enqueue, getUser, isMember, post, tachiSay } from './core';
import { handleSeniorAction, handleSeniorInput } from './senior';
import { handleFamilyAction, handleFamilyInput } from './family';
import { handleSideMessage } from './scheduling';
import { TASK_ACTIONS, handleTaskAction } from './tasks';
import { handleDmMessage } from './dm';
import { st } from '../i18n';
import { warn } from '../util/misc';

const SENIOR_ACTIONS = new Set(['share_memory', 'skip_share', 'accept_trip', 'decline_trip', 'share_trip', 'make_gathering']);

async function fallback(roomId: ID, err: unknown): Promise<void> {
  warn('handler failed:', err);
  ctx.io.to(`room:${roomId}`).emit('toast', { text: st('msg.hiccup.toast') });
  if (ctx.db.rooms.get(roomId)?.type === 'dm') return; // Tachi is not part of 1:1 chats
  await tachiSay(roomId, { text: st('msg.hiccup.say') }).catch(() => undefined);
}

/** A user (real or via demo:say) sends text/photo into a room. */
export function handleIncoming(userId: ID, roomId: ID, input: { text?: string; photoUrl?: string }): void {
  const room = ctx.db.rooms.get(roomId);
  const user = getUser(userId);
  if (!room || !user || userId === DIRECTOR_ID || !isMember(room, userId)) return;
  const text = typeof input.text === 'string' ? input.text.trim().slice(0, 2000) : undefined;
  const photoUrl = typeof input.photoUrl === 'string' && input.photoUrl.startsWith('/') ? input.photoUrl : undefined;
  if (!text && !photoUrl) return;
  const msg = post(roomId, photoUrl
    ? { senderId: userId, kind: 'photo', text: text || st('msg.photoSent'), payload: { type: 'photo', url: photoUrl } }
    : { senderId: userId, kind: 'text', text: text! });
  void enqueue(roomId, async () => {
    try { await route(room, userId, text, photoUrl, msg); } catch (e) { await fallback(roomId, e); }
  });
}

async function route(room: Room, userId: ID, text: string | undefined, photoUrl: string | undefined, msg: Message): Promise<void> {
  const fresh = ctx.db.rooms.get(room.id) ?? room;
  if (fresh.type === 'dm') await handleDmMessage(fresh, userId, msg);
  else if (fresh.type === 'tachi') await handleSeniorInput(fresh, userId, text, photoUrl);
  else if (fresh.type === 'family') await handleFamilyInput(fresh, userId, text, msg);
  else await handleSideMessage(fresh, userId, text);
}

export interface ActionResult { ok: boolean; error?: string; message?: string }

/** Thrown by a flow for a deliberate privacy refusal: the card stays pending and usable (no failure toast). */
export const isActionRefused = (e: unknown): e is Error => e instanceof Error && e.name === 'ActionRefused';

const FAMILY_ACTIONS = new Set(['start_scheduling', 'pick_slots', 'confirm_slot', 'repoll', 'revise_gathering', 'new_gathering']);
const reject = (userId: ID, p: { roomId: ID; messageId: ID; actionId: string }, why: string): ActionResult => {
  warn(`action rejected (${why}): user=${userId} room=${String(p.roomId)} msg=${String(p.messageId)} action=${String(p.actionId)}`);
  return { ok: false, error: why };
};

/**
 * Authorize + run a card action. Resolves only after the flow finished ({ok:true}) or failed ({ok:false}).
 * - senior actions: only the senior (or the Director standing in for her), only in her own Tachi room,
 *   only if the action exists on the stored message; resource ids come from the stored action data / payload.
 * - family/scheduling actions: membership + (for button actions) the action present on the stored message.
 */
export function handleAction(userId: ID, p: { roomId: ID; messageId: ID; actionId: string; data?: Record<string, unknown> }): Promise<ActionResult> {
  if (!p || typeof p.roomId !== 'string' || typeof p.messageId !== 'string' || typeof p.actionId !== 'string') return Promise.resolve({ ok: false, error: st('err.badRequest') });
  const room = ctx.db.rooms.get(p.roomId);
  if (!room || !isMember(room, userId)) return Promise.resolve(reject(userId, p, 'not a member'));
  const actor = userId === DIRECTOR_ID ? SENIOR_ID : userId;
  return new Promise<ActionResult>(resolve => {
    void enqueue(p.roomId, async () => {
      try {
        const msg = ctx.db.messages.get(p.messageId);
        if (!msg || msg.roomId !== p.roomId) { resolve(reject(userId, p, 'unknown message')); return; }
        const act = msg.actions?.find(a => a.id === p.actionId);
        if (SENIOR_ACTIONS.has(p.actionId)) {
          if (actor !== SENIOR_ID) { resolve(reject(userId, p, 'senior-only action')); return; }
          if (room.type !== 'tachi' || !room.memberIds.includes(SENIOR_ID)) { resolve(reject(userId, p, 'not the senior room')); return; }
          if (!act) { resolve(reject(userId, p, 'action not on message')); return; }
          if (act.done) { resolve({ ok: true }); return; }
          // client data is ignored entirely: ids come from the stored action data / payload (handled inside the flow)
          await handleSeniorAction(p.roomId, msg, p.actionId, undefined, actor);
        } else if (FAMILY_ACTIONS.has(p.actionId)) {
          let data: Record<string, unknown> | undefined;
          if (p.actionId === 'pick_slots') {
            const pay = msg.payload;
            const poll = pay?.type === 'schedule_request' ? ctx.db.polls.get(pay.pollId) : undefined;
            if (!poll || msg.kind !== 'schedule_request') { resolve(reject(userId, p, 'not a schedule request')); return; }
            if (!poll.participantIds.includes(actor) || poll.sideRoomIds[actor] !== room.id) { resolve(reject(userId, p, 'not a participant of this poll room')); return; }
            const raw = p.data?.slotIds;
            const valid = new Set(poll.slots.map(x => x.id));
            if (!Array.isArray(raw) || raw.some(x => typeof x !== 'string' || !valid.has(x))) { resolve(reject(userId, p, 'invalid slotIds')); return; }
            data = { slotIds: [...new Set(raw as string[])] };
          } else {
            if (!act) { resolve(reject(userId, p, 'action not on message')); return; }
            if (act.done) { resolve({ ok: true }); return; }
            data = undefined; // stored action data / payload only
          }
          await handleFamilyAction(room, actor, msg, p.actionId, data);
        } else if (TASK_ACTIONS.has(p.actionId)) {
          // to-do cards: the raw user id (the Director stands in for the assignee, not for the senior); ids from the stored action only
          const r = await handleTaskAction(userId, msg, p.actionId);
          if (!r.ok) { resolve(reject(userId, p, r.error ?? 'task action refused')); return; }
        } else {
          resolve(reject(userId, p, 'unknown action')); return;
        }
        resolve({ ok: true });
      } catch (e) {
        if (isActionRefused(e)) { resolve({ ok: false, error: 'refused', message: e.message }); return; }
        resolve({ ok: false, error: st('err.actionFailed') });
        await fallback(p.roomId, e);
      }
    }).then(() => resolve({ ok: false, error: st('err.cancelledReset') }));
  });
}
