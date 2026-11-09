// 4.10 rooms: create / invite.
import { TACHI_ID, isKinRelation } from '../../shared/constants';
import { st } from '../i18n';
import type { ID, Room, User } from '../../shared/types';
import { ctx } from './ctx';
import { emitRoomTo, getUser, joinRoomSockets, systemNote, userChannel } from './core';
import { greetInvitee } from './bots';
import { nowIso, uid } from '../util/misc';

export function createRoom(creatorId: string, title: string, memberIds: string[]): Room | { error: string } {
  const name = (title ?? '').trim().slice(0, 40);
  if (!name) return { error: st('room.nameRequired') };
  const members = [...new Set([creatorId, ...(memberIds ?? []).filter(id => typeof id === 'string' && getUser(id)), TACHI_ID])].filter(id => id === 'director' ? false : !!getUser(id));
  const room: Room = { id: uid('room'), type: 'family', title: name, memberIds: members, createdBy: creatorId, createdAt: nowIso() };
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  emitRoomTo(room);
  systemNote(room.id, st('room.created', { name }));
  return room;
}

function givenName(full: string): string {
  if (/^[가-힣]{3}$/.test(full)) return full.slice(1);
  return full.split(/\s+/)[0]; // 'Younghee Kim' → 'Younghee'
}
const initialOf = (name: string): string => (name.charAt(0) || '?').toUpperCase();

export async function inviteContact(roomId: ID, contactId: ID, inviterId: ID): Promise<void> {
  void inviterId;
  const room = ctx.db.rooms.get(roomId);
  const contact = ctx.db.contacts.get(contactId);
  if (!room || !contact || room.type === 'tachi' || room.type === 'dm') return;
  let user: User | undefined = contact.userId ? getUser(contact.userId) : undefined;
  if (!user) {
    const gn = givenName(contact.name);
    const kin = isKinRelation(contact.relation);
    // UserRole has no 'friend'; kin-ness is decided by `relation` (KIN_RELATIONS) everywhere privacy matters.
    user = {
      id: `u-${contact.id.replace(/^c-/, '')}`, name: contact.name, shortName: gn, role: 'family', relation: contact.relation,
      phone: contact.phone, initials: initialOf(gn), isBot: true,
      persona: kin ? st('invite.persona.kin', { relation: contact.relation }) : st('invite.persona.other', { relation: contact.relation }),
    };
    ctx.db.users.put(user);
    contact.userId = user.id;
    ctx.db.contacts.put(contact);
    ctx.io.emit('user:upsert', user);
    ctx.io.emit('contact:upsert', contact);
  }
  if (room.memberIds.includes(user.id)) return;
  room.memberIds = [...room.memberIds, user.id];
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  ctx.io.to(userChannel(user.id)).emit('room:upsert', room);
  emitRoomTo(room);
  await systemNote(room.id, st('room.invited', { name: contact.name }));
  void greetInvitee(room.id, user);
}
