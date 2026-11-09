// Gathering artifacts (4.6): creation, live edits, Tachi assist.
import { TACHI_ID } from '../../shared/constants';
import type { Artifact, ArtifactPatch, ID, Memory, Trip, User } from '../../shared/types';
import { ctx } from './ctx';
import {
  emitTyping, getPrivacy, isStale, memoryVisibleToFamily, getUser, isMember, now, roomChannel, seesAll, senior, tachiSay, withTyping,
} from './core';
import { nowIso, uid } from '../util/misc';
import { reactBots } from './bots';
import { findPlaces, placeById, resolvePlace } from '../data/places';

/** Regions named by the proposal text (gazetteer match) or the linked trip's destination. */
function destinationRegions(text: string, trip?: Trip): { regions: Set<string>; display?: string } {
  const regions = new Set<string>();
  const found = findPlaces(text);
  for (const p of found) regions.add(p.region);
  const display = resolvePlace(text)?.display;
  if (!regions.size && trip) for (const p of findPlaces(`${trip.suggestion.destination} ${trip.suggestion.title}`)) regions.add(p.region);
  return { regions, display: display ?? (regions.size && trip ? trip.suggestion.destination : undefined) };
}

function memoryMatchesRegions(m: Memory, regions: Set<string>): boolean {
  const pl = placeById(m.placeId);
  if (pl && regions.has(pl.region)) return true;
  return findPlaces(`${m.place ?? ''} ${m.title}`).some(p => regions.has(p.region));
}

/** Link a family-visible memory only when its place/region matches the destination the proposal names. */
export function pickMemoryForGathering(proposal: string, trip?: Trip): Memory | undefined {
  const { regions } = destinationRegions(proposal, trip);
  if (!regions.size) return undefined;
  const last = ctx.db.kv.get<string>('last-memory');
  const mems = ctx.db.memories.all().filter(m => memoryVisibleToFamily(m) && memoryMatchesRegions(m, regions));
  return (last ? mems.find(m => m.id === last) : undefined)
    ?? [...mems].sort((a, b) => (b.sharedAt ?? '').localeCompare(a.sharedAt ?? ''))[0];
}

function pickTrip(proposal: string): Trip | undefined {
  if (getPrivacy().trip !== 'family') return undefined;
  const trips = ctx.db.trips.all().filter(t => t.status !== 'declined');
  const t = trips.find(x => x.status === 'accepted') ?? trips.at(-1);
  if (!t) return undefined;
  const named = new Set(findPlaces(proposal).map(p => p.region));
  if (named.size && !destinationRegions(`${t.suggestion.destination} ${t.suggestion.title}`).regions.size) return undefined;
  if (named.size && ![...destinationRegions(`${t.suggestion.destination} ${t.suggestion.title}`).regions].some(r => named.has(r))) return undefined;
  return t;
}

export function latestOpenArtifact(roomId: ID): Artifact | undefined {
  return ctx.db.artifacts.all().filter(a => a.roomId === roomId).at(-1);
}

export function emitArtifact(a: Artifact): void {
  if (isStale()) return;
  ctx.io.to(roomChannel(a.roomId)).emit('artifact:upsert', a);
}

async function mergeIntoArtifact(a: Artifact, roomId: ID, proposer: User, members: User[], text: string): Promise<Artifact> {
  const ai = await withTyping(roomId, () => ctx.brain.assistArtifact(a, members));
  if (isStale()) throw new Error('stale');
  const fresh = ctx.db.artifacts.get(a.id) ?? a;
  const ids = new Set(members.map(m => m.id));
  const have = new Set(fresh.tasks.map(t => t.text));
  for (const t of ai.value.newTasks ?? []) {
    if (have.has(t.text)) continue;
    fresh.tasks.push({ id: uid('task'), text: t.text, assigneeId: t.assigneeId && ids.has(t.assigneeId) ? t.assigneeId : undefined, done: false });
  }
  const named = resolvePlace(text);
  if (named && (!fresh.place || /협의/.test(fresh.place))) fresh.place = `${named.display} 일대`;
  if (!fresh.background?.trim()) fresh.background = `${proposer.name}님이 "${text.replace(/[!.]+$/, '')}"라고 제안했어요.`;
  fresh.updatedBy = TACHI_ID;
  fresh.updatedAt = nowIso();
  ctx.db.artifacts.put(fresh);
  emitArtifact(fresh);
  const m = await tachiSay(roomId, {
    kind: 'artifact',
    text: '기존 모임 기획서에 반영했어요.',
    payload: { type: 'artifact', artifactId: fresh.id },
    actions: [
      { id: 'start_scheduling', label: '일정 조율 시작', style: 'primary', data: { artifactId: fresh.id } },
      { id: 'open_artifact', label: '기획서 열기', data: { artifactId: fresh.id } },
    ],
  }, ai);
  reactBots(roomId, m);
  return fresh;
}

export async function createGathering(
  roomId: ID, proposer: User, text: string, opts: { memory?: Memory; trip?: Trip } = {},
): Promise<Artifact> {
  const room = ctx.db.rooms.get(roomId);
  if (!room) throw new Error('room not found');
  const members = room.memberIds.map(getUser).filter((u): u is User => !!u && u.id !== TACHI_ID);
  // P1-4: a recent artifact (< 24h, virtual time) absorbs the new proposal instead of spawning a twin.
  const recent = ctx.db.artifacts.all().filter(a => a.roomId === roomId && a.kind === 'gathering'
    && now().getTime() - Date.parse(a.createdAt) < 24 * 3600 * 1000).at(-1);
  if (recent) return mergeIntoArtifact(recent, roomId, proposer, members, text);
  const trip = opts.trip ?? pickTrip(text);
  const memory = opts.memory ?? pickMemoryForGathering(text, trip);
  const ai = await withTyping(roomId, () => ctx.brain.draftGathering({
    proposalText: text, proposer, members, senior: senior(),
    linkedMemory: memory ? { id: memory.id, title: memory.title, summary: memory.summary, place: memory.place, year: memory.year, people: memory.people } : undefined,
    linkedTrip: trip ? { title: trip.suggestion.title, destination: trip.suggestion.destination, itinerary: trip.itinerary } : undefined,
  }));
  if (isStale()) throw new Error('stale');
  const d = ai.value;
  const dest = destinationRegions(text, trip);
  if (dest.display && dest.regions.size && ![...dest.regions].some(r => (d.place ?? '').includes(r))) d.place = `${dest.display} 일대`;
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
  if (isStale()) return;
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
