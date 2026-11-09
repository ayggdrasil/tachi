// Person-to-person 1:1 side chats ('dm' rooms): plain chat, Tachi never answers; unclaimed personas reply in character.
import { DIRECTOR_ID, SENIOR_ID, TACHI_ID } from '../../shared/constants';
import type { ID, Message, Room } from '../../shared/types';
import { ctx } from './ctx';
import { emitRoomTo, getUser, joinRoomSockets, later, post } from './core';
import { botSpeak } from './bots';
import { st } from '../i18n';
import { nowIso, rand, uid } from '../util/misc';

export function findDm(a: ID, b: ID): Room | undefined {
  return ctx.db.rooms.all().find(r => r.type === 'dm' && r.memberIds.length === 2 && r.memberIds.includes(a) && r.memberIds.includes(b));
}

/** Find or create the 1:1 room between `me` and `otherId` (both must be real people; Tachi and the Director have no DMs). */
export function getOrCreateDm(me: ID, otherId: ID): Room | { error: string } {
  const a = me && me !== DIRECTOR_ID && me !== TACHI_ID ? getUser(me) : undefined;
  const b = typeof otherId === 'string' && otherId !== DIRECTOR_ID && otherId !== TACHI_ID ? getUser(otherId) : undefined;
  if (!a || !b || a.id === b.id || a.role === 'ai' || b.role === 'ai') return { error: st('dm.unavailable') };
  const existing = findDm(a.id, b.id);
  if (existing) { joinRoomSockets(existing); emitRoomTo(existing); return existing; }
  const room: Room = {
    id: uid('room-dm'), type: 'dm', title: `${a.shortName} · ${b.shortName}`, memberIds: [a.id, b.id], createdBy: a.id, createdAt: nowIso(),
  };
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  emitRoomTo(room);
  return room;
}

/** A human wrote in a DM. Nobody but the other person answers; an unclaimed persona answers in character after 1.5-3 s. */
export async function handleDmMessage(room: Room, senderId: ID, msg: Message): Promise<void> {
  const other = room.memberIds.map(getUser).find(u => u && u.id !== senderId);
  if (!other || !other.isBot || !ctx.db.rooms.get(room.id)) return;
  const demo = ctx.db.kv.get<{ botsEnabled?: boolean }>('demo');
  if (demo && demo.botsEnabled === false) return;
  later(rand(1500, 3000), async () => {
    const fresh = getUser(other.id);
    if (!fresh?.isBot) return; // a human claimed this persona meanwhile
    const said = await botSpeak(room.id, fresh, { kind: msg.kind === 'photo' ? 'photo' : 'text', text: msg.text }, msg);
    // a DM must never go unanswered: when the brain has nothing to say, the persona still acknowledges
    if (said || !getUser(other.id)?.isBot || !ctx.db.rooms.get(room.id)) return;
    const text = senderId === SENIOR_ID ? st('dm.botAckSenior', { call: st('dm.callSenior') }) : st('dm.botAck');
    post(room.id, { senderId: other.id, text, meta: { generatedBy: 'bot', source: 'rule' } });
  });
}
