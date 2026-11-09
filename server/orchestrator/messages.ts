// Incoming message / action dispatch with per-room serialization and graceful failure.
import { DIRECTOR_ID, SENIOR_ID } from '../../shared/constants';
import type { ID, Message, Room } from '../../shared/types';
import { ctx } from './ctx';
import { enqueue, getUser, isMember, post, tachiSay } from './core';
import { handleSeniorAction, handleSeniorInput } from './senior';
import { handleFamilyAction, handleFamilyInput } from './family';
import { handleSideMessage } from './scheduling';
import { warn } from '../util/misc';

const SENIOR_ACTIONS = new Set(['share_memory', 'skip_share', 'accept_trip', 'decline_trip', 'share_trip', 'make_gathering']);

async function fallback(roomId: ID, err: unknown): Promise<void> {
  warn('handler failed:', err);
  ctx.io.to(`room:${roomId}`).emit('toast', { text: '잠시 문제가 있었어요. 다시 시도해 주세요.' });
  await tachiSay(roomId, { text: '잠깐 생각이 엉켰어요. 한 번만 더 말씀해 주시겠어요?' }).catch(() => undefined);
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
    ? { senderId: userId, kind: 'photo', text: text || '사진을 보냈어요', payload: { type: 'photo', url: photoUrl } }
    : { senderId: userId, kind: 'text', text: text! });
  void enqueue(roomId, async () => {
    try { await route(room, userId, text, photoUrl, msg); } catch (e) { await fallback(roomId, e); }
  });
}

async function route(room: Room, userId: ID, text: string | undefined, photoUrl: string | undefined, msg: Message): Promise<void> {
  const fresh = ctx.db.rooms.get(room.id) ?? room;
  if (fresh.type === 'tachi') await handleSeniorInput(fresh, userId, text, photoUrl);
  else if (fresh.type === 'family') await handleFamilyInput(fresh, userId, text, msg);
  else await handleSideMessage(fresh, userId, text);
}

export function handleAction(userId: ID, p: { roomId: ID; messageId: ID; actionId: string; data?: Record<string, unknown> }): void {
  const room = ctx.db.rooms.get(p.roomId);
  if (!room || !isMember(room, userId) || typeof p.actionId !== 'string') return;
  void enqueue(p.roomId, async () => {
    try {
      const msg = ctx.db.messages.get(p.messageId);
      if (!msg || msg.roomId !== p.roomId) return;
      const actor = userId === DIRECTOR_ID ? SENIOR_ID : userId;
      if (SENIOR_ACTIONS.has(p.actionId)) await handleSeniorAction(p.roomId, msg, p.actionId, p.data);
      else await handleFamilyAction(room, actor, msg, p.actionId, p.data);
    } catch (e) { await fallback(p.roomId, e); }
  });
}
