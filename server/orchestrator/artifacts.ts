// Gathering artifacts (4.6): creation, live edits, Tachi assist.
import { TACHI_ID } from '../../shared/constants';
import type { Artifact, ArtifactPatch, ID, Memory, Trip, User } from '../../shared/types';
import { ctx } from './ctx';
import {
  emitTyping, getPrivacy, memoryVisibleToFamily, getUser, isMember, roomChannel, seesAll, senior, tachiSay, withTyping,
} from './core';
import { nowIso, uid } from '../util/misc';
import { reactBots } from './bots';

function pickMemoryForGathering(roomId: ID): Memory | undefined {
  const last = ctx.db.kv.get<string>('last-memory');
  const mems = ctx.db.memories.all().filter(m => memoryVisibleToFamily(m));
  return (last ? mems.find(m => m.id === last) : undefined)
    ?? [...mems].sort((a, b) => (b.sharedAt ?? '').localeCompare(a.sharedAt ?? ''))[0];
}

function pickTrip(): Trip | undefined {
  if (getPrivacy().trip !== 'family') return undefined;
  const trips = ctx.db.trips.all().filter(t => t.status !== 'declined');
  return trips.find(t => t.status === 'accepted') ?? trips.at(-1);
}

export function latestOpenArtifact(roomId: ID): Artifact | undefined {
  return ctx.db.artifacts.all().filter(a => a.roomId === roomId).at(-1);
}

export function emitArtifact(a: Artifact): void {
  ctx.io.to(roomChannel(a.roomId)).emit('artifact:upsert', a);
}

export async function createGathering(
  roomId: ID, proposer: User, text: string, opts: { memory?: Memory; trip?: Trip } = {},
): Promise<Artifact> {
  const room = ctx.db.rooms.get(roomId);
  if (!room) throw new Error('room not found');
  const members = room.memberIds.map(getUser).filter((u): u is User => !!u && u.id !== TACHI_ID);
  const memory = opts.memory ?? pickMemoryForGathering(roomId);
  const trip = opts.trip ?? pickTrip();
  const ai = await withTyping(roomId, () => ctx.brain.draftGathering({
    proposalText: text, proposer, members, senior: senior(),
    linkedMemory: memory ? { id: memory.id, title: memory.title, summary: memory.summary, place: memory.place, year: memory.year, people: memory.people } : undefined,
    linkedTrip: trip ? { title: trip.suggestion.title, destination: trip.suggestion.destination, itinerary: trip.itinerary } : undefined,
  }));
  const d = ai.value;
  const t = nowIso();
  const memberIds = new Set(members.map(m => m.id));
  const art: Artifact = {
    id: uid('art'), roomId, kind: 'gathering', title: d.title, background: d.background, purpose: d.purpose, place: d.place,
    dateStatus: 'undecided', agenda: d.agenda ?? [],
    tasks: (d.tasks ?? []).map(x => ({ id: uid('task'), text: x.text, assigneeId: x.assigneeId && memberIds.has(x.assigneeId) ? x.assigneeId : undefined, done: false })),
    notes: d.notes ?? '', linkedMemoryId: memory?.id, linkedTripId: trip?.id, createdBy: proposer.id, updatedBy: TACHI_ID, updatedAt: t, createdAt: t,
  };
  ctx.db.artifacts.put(art);
  emitArtifact(art);
  const m = await tachiSay(roomId, {
    kind: 'artifact',
    text: `${art.title} — 모임 기획서를 만들어 봤어요. 함께 다듬어 주세요.`,
    payload: { type: 'artifact', artifactId: art.id },
    actions: [
      { id: 'start_scheduling', label: '일정 조율 시작', style: 'primary', data: { artifactId: art.id } },
      { id: 'open_artifact', label: '기획서 열기', data: { artifactId: art.id } },
    ],
  }, ai);
  reactBots(roomId, m);
  return art;
}

// ── live edits ──────────────────────────────────────────────────────────────
function editable(userId: ID, artifactId: ID): Artifact | undefined {
  const a = ctx.db.artifacts.get(artifactId);
  const room = a && ctx.db.rooms.get(a.roomId);
  return a && room && isMember(room, userId) ? a : undefined;
}

function touch(a: Artifact, userId: ID): void {
  a.updatedBy = seesAll(userId) && userId !== 'mom' ? 'director' : userId;
  a.updatedAt = nowIso();
  ctx.db.artifacts.put(a);
  emitArtifact(a);
}

export function updateArtifact(userId: ID, artifactId: ID, patch: ArtifactPatch): void {
  const a = editable(userId, artifactId);
  if (!a || !patch || typeof patch !== 'object') return;
  for (const k of ['title', 'background', 'purpose', 'place', 'notes', 'dateLabel'] as const) {
    const v = patch[k];
    if (typeof v === 'string') (a as unknown as Record<string, unknown>)[k] = v.slice(0, 2000);
  }
  if (Array.isArray(patch.agenda)) a.agenda = patch.agenda.filter(x => typeof x === 'string').map(x => x.slice(0, 300)).slice(0, 30);
  touch(a, userId);
}

export function artifactTask(userId: ID, p: { artifactId: ID; op: 'add' | 'toggle' | 'assign' | 'remove'; taskId?: ID; text?: string; assigneeId?: ID }): void {
  const a = editable(userId, p.artifactId);
  if (!a) return;
  if (p.op === 'add') {
    const text = (p.text ?? '').trim().slice(0, 300);
    if (!text) return;
    a.tasks.push({ id: uid('task'), text, assigneeId: p.assigneeId, done: false });
  } else {
    const t = a.tasks.find(x => x.id === p.taskId);
    if (!t) return;
    if (p.op === 'toggle') t.done = !t.done;
    else if (p.op === 'assign') t.assigneeId = p.assigneeId || undefined;
    else a.tasks = a.tasks.filter(x => x.id !== p.taskId);
  }
  touch(a, userId);
}

export async function assistArtifact(userId: ID, artifactId: ID): Promise<void> {
  const a = editable(userId, artifactId);
  if (!a) return;
  const room = ctx.db.rooms.get(a.roomId)!;
  const members = room.memberIds.map(getUser).filter((u): u is User => !!u && u.id !== TACHI_ID);
  emitTyping(a.roomId, TACHI_ID);
  const ai = await withTyping(a.roomId, () => ctx.brain.assistArtifact(a, members));
  const fresh = ctx.db.artifacts.get(artifactId) ?? a;
  const ids = new Set(members.map(m => m.id));
  for (const t of ai.value.newTasks ?? []) {
    fresh.tasks.push({ id: uid('task'), text: t.text, assigneeId: t.assigneeId && ids.has(t.assigneeId) ? t.assigneeId : undefined, done: false });
  }
  fresh.updatedBy = TACHI_ID;
  fresh.updatedAt = nowIso();
  ctx.db.artifacts.put(fresh);
  emitArtifact(fresh);
  await tachiSay(a.roomId, { text: ai.value.message || '할 일을 몇 가지 더 적어 두었어요.' }, ai);
}
