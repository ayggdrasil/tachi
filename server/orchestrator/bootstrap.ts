// Per-viewer Bootstrap (hello ack).
import { DIRECTOR_ID } from '../../shared/constants';
import type { Bootstrap, GraphDelta, ID } from '../../shared/types';
import { ctx } from './ctx';
import { DIRECTOR_USER, scrubHiddenTitles, getDemo, getPrivacy, healthFor, memoryVisibleToFamily, messageFor, presence, seesAll, tripVisibleToFamily, viewerIsKin } from './core';
import { warn } from '../util/misc';

export async function buildBootstrap(viewerId: ID): Promise<Bootstrap> {
  const { db } = ctx;
  const director = viewerId === DIRECTOR_ID;
  const me = director ? DIRECTOR_USER : db.users.get(viewerId)!;
  const all = seesAll(viewerId);
  const kin = viewerIsKin(viewerId);
  const privacy = getPrivacy();

  const rooms = db.rooms.all().filter(r => director || r.memberIds.includes(viewerId));
  const roomIds = new Set(rooms.map(r => r.id));
  const messages: Bootstrap['messages'] = {};
  for (const r of rooms) messages[r.id] = db.messages.byRoom(r.id, 200).map(m => messageFor(viewerId, m));

  const memories = db.memories.all().filter(m => all || (kin && memoryVisibleToFamily(m)));
  const artifacts = db.artifacts.all().filter(a => roomIds.has(a.roomId)).map(a => scrubHiddenTitles(viewerId, a));
  const polls = db.polls.all().filter(p => roomIds.has(p.familyRoomId) || Object.values(p.sideRoomIds).some(id => roomIds.has(id)));
  const trips = db.trips.all().filter(t => all || (kin && tripVisibleToFamily(t))).map(t => scrubHiddenTitles(viewerId, t));

  let graph: GraphDelta = { nodes: [], edges: [] };
  try {
    if (all) graph = await ctx.graph.subgraph();
    else if (memories.length) graph = await ctx.graph.subgraph(memories.map(m => m.id));
  } catch (e) { warn('graph bootstrap failed:', e); }

  return {
    me, users: db.users.all(), contacts: db.contacts.all(), rooms, messages, memories, artifacts, polls, trips,
    privacy, health: healthFor(viewerId), models: ctx.brain.getModelState(), demo: getDemo(), presence: presence(), graph,
  };
}
