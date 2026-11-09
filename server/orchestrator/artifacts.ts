// Gathering artifacts (4.6): creation, live edits, Tachi assist.
import { TACHI_ID } from '../../shared/constants';
import type { Artifact, ArtifactPatch, ID, Memory, Message, Trip, User } from '../../shared/types';
import { ctx } from './ctx';
import {
  artifactFor, emitTyping, forViewers, getPrivacy, tripVisibleToFamily, viewerIsKin, markActionDone, isStale, memoryVisibleToFamily, getUser, isMember, now, roomChannel, seesAll, senior, tachiSay, withTyping,
} from './core';
import { nowIso, uid } from '../util/misc';
import { reactBots } from './bots';
import { findPlaces, placeById, resolvePlace } from '../data/places';
import { normalizeTasks, refineTaskActions, resetFollowUps, setTaskStatus } from './tasks';

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
  const trips = ctx.db.trips.all().filter(t => t.status !== 'declined' && tripVisibleToFamily(t));
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
  const room = ctx.db.rooms.get(a.roomId);
  forViewers((s, v) => { if (seesAll(v) || room?.memberIds.includes(v)) s.emit('artifact:upsert', artifactFor(v, a)); });
}

const EVENT_NOUNS: [string, RegExp][] = [
  ['birthday', /생신|생일/], ['seventy', /칠순|환갑|팔순/], ['wedding', /결혼|상견례/], ['graduation', /졸업/], ['holiday', /추석|설날|명절/],
];
const eventNoun = (t: string): string | undefined => EVENT_NOUNS.find(([, re]) => re.test(t))?.[0];

/** Does a new proposal refer to the same gathering as the artifact? Same destination region and no conflicting event noun. */
function sameGathering(a: Artifact, text: string): boolean {
  const newRegions = new Set(findPlaces(text).map(p => p.region));
  const oldRegions = new Set(findPlaces(`${a.place ?? ''} ${a.title}`).map(p => p.region));
  if (newRegions.size && oldRegions.size && ![...newRegions].some(r => oldRegions.has(r))) return false;
  const n = eventNoun(text);
  const o = eventNoun(`${a.title} ${a.purpose ?? ''}`);
  if (n && o && n !== o) return false;
  return true;
}

async function askGatheringChoice(roomId: ID, a: Artifact, text: string): Promise<void> {
  await tachiSay(roomId, {
    text: `“${a.title}” 기획서가 이미 있는데, 말씀하신 내용은 조금 달라 보여요. 기존 계획을 바꿀까요, 새 기획서를 만들까요?`,
    actions: [
      { id: 'revise_gathering', label: '기존 계획을 바꿀게요', data: { artifactId: a.id, proposal: text } },
      { id: 'new_gathering', label: '새 기획서를 만들어 주세요', style: 'primary', data: { proposal: text } },
    ],
  });
}

/** Apply the concrete differences of a new proposal onto an existing artifact; claims success only when something changed. */
async function mergeIntoArtifact(a: Artifact, roomId: ID, proposer: User, members: User[], text: string, forceDest = false): Promise<Artifact> {
  const ai = await withTyping(roomId, () => ctx.brain.draftGathering({ proposalText: text, proposer, members, senior: senior() }));
  if (isStale()) throw new Error('stale');
  const fresh = ctx.db.artifacts.get(a.id) ?? a;
  const d = ai.value;
  const ids = new Set(members.map(m => m.id));
  const changes: string[] = [];
  const named = resolvePlace(text);
  const dest = named ? `${named.display} 일대` : undefined;
  if (named && dest && (!fresh.place || /협의/.test(fresh.place))) { fresh.place = dest; changes.push(`장소를 ${dest}로`); }
  else if (forceDest && named && dest && !(fresh.place ?? '').includes(named.place.region)) {
    // explicit "revise": the destination/title/agenda follow the new proposal
    fresh.place = dest; changes.push(`장소를 ${dest}로`);
    if (d.title && d.title !== fresh.title) { fresh.title = d.title; changes.push('제목'); }
    if (d.agenda?.length) { fresh.agenda = d.agenda.slice(0, 30); changes.push('일정'); }
  } else {
    const haveAgenda = new Set(fresh.agenda);
    const addAgenda = (d.agenda ?? []).filter(x => !haveAgenda.has(x));
    if (addAgenda.length && (forceDest || !fresh.agenda.length)) { fresh.agenda = [...fresh.agenda, ...addAgenda].slice(0, 30); changes.push(`일정 ${addAgenda.length}개`); }
  }
  const have = new Set(fresh.tasks.map(t => t.text));
  const addTasks = (d.tasks ?? []).filter(t => !have.has(t.text));
  for (const t of addTasks) fresh.tasks.push({ id: uid('task'), text: t.text, assigneeId: t.assigneeId && ids.has(t.assigneeId) ? t.assigneeId : undefined, done: false });
  if (addTasks.length) changes.push(`할 일 ${addTasks.length}개`);
  if (!fresh.background?.trim()) { fresh.background = `${proposer.name}님이 "${text.replace(/[!.]+$/, '')}"라고 제안했어요.`; changes.push('배경'); }
  const line = `${proposer.name}: ${text.replace(/[!.]+$/, '')}`;
  if (!(fresh.notes ?? '').includes(line)) { fresh.notes = [fresh.notes, `• ${line}`].filter(Boolean).join('\n').slice(0, 2000); changes.push('제안 메모'); }
  // the proposal brings a birthday angle the plan did not have yet
  if (/생신|생일/.test(text) && !/생신|생일/.test(`${fresh.title} ${fresh.purpose ?? ''}`)) {
    const region = (fresh.place ?? '').replace(/\s*일대$/, '').trim();
    fresh.title = `어머니 생신 · ${region && !/협의/.test(region) ? `${region} 가족 여행` : '가족 모임'}`;
    fresh.purpose = '어머님 생신을 온 가족이 함께 축하하고, 예전 추억의 장소를 다시 걸으며 새 추억을 만들어요.';
    changes.push('생신 일정');
  }
  let m;
  if (changes.length) {
    fresh.updatedBy = TACHI_ID;
    fresh.updatedAt = nowIso();
    ctx.db.artifacts.put(normalizeTasks(fresh));
    emitArtifact(fresh);
    if (addTasks.length) refineTaskActions(fresh.id);
    m = await tachiSay(roomId, {
      kind: 'artifact',
      text: `기존 모임 기획서에 반영했어요. (${changes.join(', ')})`,
      payload: { type: 'artifact', artifactId: fresh.id },
      actions: [
        { id: 'start_scheduling', label: '일정 조율 시작', style: 'primary', data: { artifactId: fresh.id } },
        { id: 'open_artifact', label: '기획서 열기', data: { artifactId: fresh.id } },
      ],
    }, ai);
  } else {
    m = await tachiSay(roomId, {
      kind: 'artifact',
      text: '말씀하신 내용은 이미 기획서에 담겨 있어요. 바꾸고 싶은 부분을 알려 주세요.',
      payload: { type: 'artifact', artifactId: fresh.id },
      actions: [{ id: 'open_artifact', label: '기획서 열기', data: { artifactId: fresh.id } }],
    }, ai);
  }
  reactBots(roomId, m);
  return fresh;
}

/** revise_gathering / new_gathering button handler (family actions; ids come from the stored action data only). */
export async function handleGatheringChoice(userId: ID, msg: Message, actionId: string): Promise<void> {
  const room = ctx.db.rooms.get(msg.roomId);
  if (!room || !isMember(room, userId)) return;
  const stored = ctx.db.messages.get(msg.id);
  const act = stored?.actions?.find(x => x.id === actionId);
  if (!stored || !act || act.done) return;
  const proposal = typeof act.data?.proposal === 'string' ? act.data.proposal : '';
  const proposer = getUser(userId);
  if (!proposal || !proposer) return;
  const members = room.memberIds.map(getUser).filter((u): u is User => !!u && u.id !== TACHI_ID);
  if (actionId === 'revise_gathering') {
    const a = typeof act.data?.artifactId === 'string' ? ctx.db.artifacts.get(act.data.artifactId) : undefined;
    if (!a || a.roomId !== room.id) throw new Error('artifact missing');
    await mergeIntoArtifact(a, room.id, proposer, members, proposal, true);
  } else if (actionId === 'new_gathering') {
    await createGathering(room.id, proposer, proposal, { forceNew: true });
  } else return;
  markActionDone(stored, 'revise_gathering', actionId);
  markActionDone(stored, 'new_gathering', actionId);
}

export async function createGathering(
  roomId: ID, proposer: User, text: string, opts: { memory?: Memory; trip?: Trip; forceNew?: boolean } = {},
): Promise<Artifact> {
  const room = ctx.db.rooms.get(roomId);
  if (!room) throw new Error('room not found');
  const members = room.memberIds.map(getUser).filter((u): u is User => !!u && u.id !== TACHI_ID);
  // P1-4: a recent artifact (< 24h, virtual time) absorbs the new proposal instead of spawning a twin.
  const recent = ctx.db.artifacts.all().filter(a => a.roomId === roomId && a.kind === 'gathering'
    && now().getTime() - Date.parse(a.createdAt) < 24 * 3600 * 1000).at(-1);
  if (recent && !opts.forceNew) {
    if (sameGathering(recent, text)) return mergeIntoArtifact(recent, roomId, proposer, members, text);
    if (!opts.trip) { await askGatheringChoice(roomId, recent, text); return recent; }
  }
  // non-kin proposers (e.g. an invited friend) never pull the senior's memories / trips into a draft; hidden resources are dropped too
  const kinProposer = viewerIsKin(proposer.id);
  let trip = kinProposer ? (opts.trip ?? pickTrip(text)) : undefined;
  if (trip && !seesAll(proposer.id) && !tripVisibleToFamily(trip)) trip = undefined;
  let memory = kinProposer ? (opts.memory ?? pickMemoryForGathering(text, trip)) : undefined;
  if (memory && !seesAll(proposer.id) && !memoryVisibleToFamily(memory)) memory = undefined;
  const ai = await withTyping(roomId, () => ctx.brain.draftGathering({
    proposalText: text, proposer, members, senior: senior(),
    linkedMemory: memory ? { id: memory.id, title: memory.title, summary: memory.summary, place: memory.place, year: memory.year, people: memory.people } : undefined,
    linkedTrip: trip ? { title: trip.suggestion.title, destination: trip.suggestion.destination, itinerary: trip.itinerary } : undefined,
  }));
  if (isStale()) throw new Error('stale');
  const d = ai.value;
  if (!kinProposer) d.background = `${proposer.name}님이 "${text.replace(/[!.]+$/, '')}"라고 제안했어요.`;
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
  ctx.db.artifacts.put(normalizeTasks(art));
  emitArtifact(art);
  refineTaskActions(art.id);
  const m = await tachiSay(roomId, {
    kind: 'artifact',
    text: `${art.title} 모임 기획서를 만들어 봤어요. 함께 다듬어 주세요.`,
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
  ctx.db.artifacts.put(normalizeTasks(a));
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
    const room = ctx.db.rooms.get(a.roomId);
    const assignee = typeof p.assigneeId === 'string' && room?.memberIds.includes(p.assigneeId) ? p.assigneeId : undefined;
    a.tasks.push({ id: uid('task'), text, assigneeId: assignee, done: false });
  } else {
    const t = a.tasks.find(x => x.id === p.taskId);
    if (!t) return;
    if (p.op === 'toggle') setTaskStatus(t, t.done ? 'todo' : 'done', userId);
    else if (p.op === 'assign') {
      const next = p.assigneeId || undefined;
      if (next !== t.assigneeId) { t.assigneeId = next; resetFollowUps(t); }
    } else a.tasks = a.tasks.filter(x => x.id !== p.taskId);
  }
  touch(a, userId);
  if (p.op === 'add') refineTaskActions(a.id);
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
  ctx.db.artifacts.put(normalizeTasks(fresh));
  emitArtifact(fresh);
  refineTaskActions(fresh.id);
  await tachiSay(a.roomId, { text: ai.value.message || '할 일을 몇 가지 더 적어 두었어요.' }, ai);
}
