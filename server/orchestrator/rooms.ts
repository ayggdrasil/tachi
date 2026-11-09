// 4.10 rooms: create / invite.
import { TACHI_ID } from '../../shared/constants';
import type { Room, User } from '../../shared/types';
import { ctx } from './ctx';
import { emitRoomTo, getUser, joinRoomSockets, systemNote, userChannel } from './core';
import { greetInvitee } from './bots';
import { nowIso, uid } from '../util/misc';

export function createRoom(creatorId: string, title: string, memberIds: string[]): Room | { error: string } {
  const name = (title ?? '').trim().slice(0, 40);
  if (!name) return { error: '방 이름을 입력해 주세요.' };
  const members = [...new Set([creatorId, ...(memberIds ?? []).filter(id => typeof id === 'string' && getUser(id)), TACHI_ID])].filter(id => id === 'director' ? false : !!getUser(id));
  const room: Room = { id: uid('room'), type: 'family', title: name, memberIds: members, createdBy: creatorId, createdAt: nowIso() };
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  emitRoomTo(room);
  systemNote(room.id, `'${name}' 방이 만들어졌어요.`);
  return room;
}

function givenName(full: string): string { return /^[가-힣]{3}$/.test(full) ? full.slice(1) : full; }

export function inviteContact(roomId: string, contactId: string): void {
  const room = ctx.db.rooms.get(roomId);
  const contact = ctx.db.contacts.get(contactId);
  if (!room || !contact || room.type === 'tachi') return;
  let user: User | undefined = contact.userId ? getUser(contact.userId) : undefined;
  if (!user) {
    const gn = givenName(contact.name);
    user = {
      id: `u-${contact.id.replace(/^c-/, '')}`, name: contact.name, shortName: gn, role: 'family', relation: contact.relation,
      phone: contact.phone, initials: gn.charAt(0), isBot: true, persona: `${contact.relation}. 다정하고 짧게 말함.`,
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
  systemNote(room.id, `${contact.name}님이 초대되었어요.`);
  void greetInvitee(room.id, user);
}
