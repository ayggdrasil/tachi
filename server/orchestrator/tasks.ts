// Gathering to-dos as real actions (booking link / assignee reminder) + polite follow-up tracking.
import {
  DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ID, SENIOR_ROOM_ID, TACHI_ID, TASK_DUE, TASK_FOLLOWUP, dateLabel, koreanTime, pad2,
} from '../../shared/constants';
import type {
  Artifact, ArtifactTask, CardAction, ID, Message, ReportOpenTask, Room, TaskActionKind, TaskCardPayload, TaskFollowUp, TaskStatus,
} from '../../shared/types';
import { ctx } from './ctx';
import {
  emitRoomTo, getUser, isMember, isStale, joinRoomSockets, later, markActionDone, now, tachiSay,
} from './core';
import { emitArtifact } from './artifacts';
import { buildBookingLinks } from '../data/booking';
import { TASK_KINDS, classifyTask } from '../brain/heuristics/tasks';
import { nowIso, uid, warn } from '../util/misc';

const MIN = 60_000;
export const TASK_ACTIONS = new Set(['task_done', 'task_help', 'task_later', 'task_booked', 'task_take']);
export type TaskReply = 'done' | 'help' | 'later';
export interface TaskResult { ok: boolean; error?: string; message?: string }

export const isOpen = (t: ArtifactTask): boolean => !t.done && t.status !== 'done';
const name = (id?: ID): string => (id ? getUser(id)?.shortName ?? id : '');
const honor = (id?: ID): string => (id === SENIOR_ID ? '어머님' : `${name(id)}님`);
const dueText = (iso?: string): string => { if (!iso) return ''; const d = new Date(iso); return `${dateLabel(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
/** Korean object particle for the task text ('…예약을' / '…준비를'). */
const eul = (s: string): string => { const c = s.trim().replace(/\s*\(.*\)$/, '').slice(-1).charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '을' : '를'; };
const short = (t: ArtifactTask): string => t.text.replace(/\s*\(.*?\)\s*/g, ' ').trim();

// ── normalization (sync, heuristic) ─────────────────────────────────────────

/** Default due time: booking tasks a few days before the confirmed gathering, other tasks the day before; undated plans get a few days. */
export function defaultDue(t: ArtifactTask, a: Artifact, at: Date = now()): string {
  const floor = at.getTime() + 2 * 60 * MIN;
  if (a.slot) {
    const lead = (t.action?.kind === 'booking_link' ? TASK_DUE.bookingLeadDays : TASK_DUE.otherLeadDays) * 24 * 60 * MIN;
    return new Date(Math.max(floor, Date.parse(a.slot.startsAt) - lead)).toISOString();
  }
  return new Date(at.getTime() + TASK_DUE.undatedDays * 24 * 60 * MIN).toISOString();
}

/** First automatic reminder: `firstAfterMin` after the task got its owner, or `dueLeadMin` before the due time if that is earlier. */
export function firstFollowUpAt(t: ArtifactTask, at: Date = now()): string {
  const soon = at.getTime() + TASK_FOLLOWUP.firstAfterMin * MIN;
  const byDue = t.dueAt ? Math.max(at.getTime(), Date.parse(t.dueAt) - TASK_FOLLOWUP.dueLeadMin * MIN) : Infinity;
  return new Date(Math.min(soon, byDue)).toISOString();
}

/** Tasks that the follow-up scheduler chases: open, owned, and something a person has to do. */
export const followable = (t: ArtifactTask): boolean =>
  isOpen(t) && !!t.assigneeId && t.action?.kind !== 'none';

/** Fill in action / status / due / next follow-up for every task (idempotent; never downgrades a user's choice). */
export function normalizeTasks(a: Artifact, at: Date = now()): Artifact {
  for (const t of a.tasks) {
    // unclassified, or a kind this version no longer has → classify again
    if (!t.action || !TASK_KINDS.includes(t.action.kind)) t.action = { ...classifyTask(t.text), classifiedBy: 'heuristic' };
    if (t.done) t.status = 'done';
    else if (!t.status || t.status === 'done') t.status = 'todo';
    if (!t.dueAt && isOpen(t) && t.action.kind !== 'none') t.dueAt = defaultDue(t, a, at);
    if (!followable(t) || (t.followUpLevel ?? 0) >= TASK_FOLLOWUP.maxLevel) delete t.nextFollowUpAt;
    else if (!t.nextFollowUpAt) t.nextFollowUpAt = (t.followUpLevel ?? 0) === 0 ? firstFollowUpAt(t, at) : new Date(at.getTime() + TASK_FOLLOWUP.repeatAfterMin * MIN).toISOString();
  }
  return a;
}

function record(t: ArtifactTask, f: Omit<TaskFollowUp, 'id' | 'at'>): void {
  t.followUps = [...(t.followUps ?? []), { id: uid('fu'), at: nowIso(), ...f }].slice(-20);
}

function save(a: Artifact, by: ID = TACHI_ID): Artifact {
  normalizeTasks(a);
  a.updatedBy = by;
  a.updatedAt = nowIso();
  ctx.db.artifacts.put(a);
  emitArtifact(a);
  return a;
}

/** Mark a task done (any path: checkbox, card button, typed '완료', booking confirmation). */
export function completeTask(t: ArtifactTask, by: ID, note?: string): void {
  t.done = true;
  t.status = 'done';
  t.completedBy = by;
  t.completedAt = nowIso();
  delete t.nextFollowUpAt;
  if (note) t.result = note;
}

/** Explicit status change (socket artifact:task:status / checkbox toggle). */
export function setTaskStatus(t: ArtifactTask, status: TaskStatus, by: ID): void {
  if (status === 'done') { completeTask(t, by); record(t, { kind: 'status', by, note: '완료로 표시' }); return; }
  const wasDone = !isOpen(t);
  t.done = false;
  t.status = status;
  delete t.completedAt; delete t.completedBy;
  if (wasDone) { t.followUpLevel = 0; delete t.nextFollowUpAt; }
  record(t, { kind: 'status', by, note: `${status === 'blocked' ? '도움 필요' : status === 'in_progress' ? '진행 중' : '할 일'}로 표시` });
}

/** After an owner change: the follow-up ladder starts over for the new owner. */
export function resetFollowUps(t: ArtifactTask): void {
  t.followUpLevel = 0;
  delete t.nextFollowUpAt;
  if (t.status === 'blocked') t.status = 'todo';
}

// ── LLM refinement (async, only for live providers) ─────────────────────────

/** Ask the live model to (re)classify heuristic-classified tasks; the family's own choices are never overwritten. */
export function refineTaskActions(artifactId: ID): void {
  const opt = ctx.brain.getModelState().options.find(o => o.key === ctx.brain.getModelState().active);
  if (!ctx.brain.classifyTasks || !opt || opt.provider === 'mock' || !opt.available) return;
  later(0, async () => {
    const a = ctx.db.artifacts.get(artifactId);
    if (!a) return;
    const todo = a.tasks.filter(t => isOpen(t) && t.action?.classifiedBy !== 'user' && t.action?.classifiedBy !== 'llm');
    if (!todo.length) return;
    const ai = await ctx.brain.classifyTasks!({ tasks: todo.map(t => ({ id: t.id, text: t.text, assigneeId: t.assigneeId })), title: a.title, place: a.place });
    if (ai.fallback || ai.source !== 'llm' || isStale()) return;
    const fresh = ctx.db.artifacts.get(artifactId);
    if (!fresh) return;
    let changed = false;
    for (const t of fresh.tasks) {
      const c = ai.value[t.id];
      if (!c || t.action?.classifiedBy === 'user') continue;
      t.action = { ...t.action, kind: c.kind, category: c.category, query: c.query, classifiedBy: 'llm' };
      changed = true;
    }
    if (changed) save(fresh);
  });
}

// ── rooms ───────────────────────────────────────────────────────────────────

/** The member's 1:1 room with Tachi: the senior's own room, or a reused / new side room. */
export function taskRoomFor(userId: ID, title: string): Room {
  if (userId === SENIOR_ID) return ctx.db.rooms.get(SENIOR_ROOM_ID)!;
  const existing = ctx.db.rooms.all().find(r => r.type === 'side' && r.memberIds.includes(userId) && r.memberIds.length === 2);
  if (existing) return existing;
  const room: Room = { id: uid('room-side'), type: 'side', title: `할 일 · ${title}`, memberIds: [TACHI_ID, userId], createdBy: TACHI_ID, createdAt: nowIso() };
  ctx.db.rooms.put(room);
  joinRoomSockets(room);
  emitRoomTo(room);
  return room;
}

/** Close the buttons of every earlier card about this task (one answer settles them all). */
function settleCards(taskId: ID): void {
  for (const r of ctx.db.rooms.all()) {
    for (const m of ctx.db.messages.byRoom(r.id, 120)) {
      if (m.kind !== 'task_card' || m.payload?.type !== 'task_card' || m.payload.taskId !== taskId) continue;
      if (m.actions?.some(x => !x.done)) markActionDone(m);
    }
  }
}

const replyActions = (a: Artifact, t: ArtifactTask): CardAction[] => [
  { id: 'task_done', label: '완료했어요', style: 'primary', data: { artifactId: a.id, taskId: t.id } },
  { id: 'task_help', label: '도움이 필요해요', data: { artifactId: a.id, taskId: t.id } },
  { id: 'task_later', label: '나중에 할게요', data: { artifactId: a.id, taskId: t.id } },
];

const cardFor = (a: Artifact, t: ArtifactTask, stage: TaskCardPayload['stage'], extra: Partial<TaskCardPayload> = {}): TaskCardPayload => ({
  type: 'task_card', artifactId: a.id, taskId: t.id, action: t.action?.kind ?? 'reminder', stage, title: a.title, taskText: t.text,
  assigneeId: t.assigneeId, status: t.status, dueAt: t.dueAt, ...(t.action?.links?.length ? { links: t.action.links } : {}), ...extra,
});

// ── actions ─────────────────────────────────────────────────────────────────

/** Remind the assignee in their 1:1 room. `stage` 'reminder' (first), 'nudge' (second) or a manual '리마인드'. */
export async function remindAssignee(a: Artifact, t: ArtifactTask, by: ID | 'auto', stage: 'reminder' | 'nudge' = 'reminder'): Promise<TaskResult> {
  if (!t.assigneeId || !getUser(t.assigneeId)) return { ok: false, error: 'no assignee', message: '담당자를 먼저 정해 주세요.' };
  if (!isOpen(t)) return { ok: false, error: 'done', message: '이미 끝난 일이에요.' };
  const room = taskRoomFor(t.assigneeId, a.title);
  const due = t.dueAt ? ` ${dueText(t.dueAt)}까지 부탁드려요.` : '';
  const text = stage === 'nudge'
    ? `${honor(t.assigneeId)}, ‘${short(t)}’ 아직 남아 있어서 한 번 더 여쭤봐요. 어려우시면 ‘도움이 필요해요’를 눌러 주세요.`
    : `${honor(t.assigneeId)}, ‘${a.title}’ 준비 중 ‘${short(t)}’${eul(t.text)} 맡아 주셨어요.${due}`;
  await tachiSay(room.id, { kind: 'task_card', text, payload: cardFor(a, t, stage), actions: replyActions(a, t) });
  const fresh = ctx.db.artifacts.get(a.id);
  const ft = fresh?.tasks.find(x => x.id === t.id);
  if (!fresh || !ft) return { ok: true };
  const auto = by === 'auto';
  const level = auto ? (stage === 'nudge' ? 2 : 1) : Math.max(1, ft.followUpLevel ?? 0);
  ft.followUpLevel = Math.max(ft.followUpLevel ?? 0, level);
  ft.executedAt = ft.executedAt ?? nowIso();
  record(ft, { kind: auto ? stage : 'manual', by, level: ft.followUpLevel, roomId: room.id, note: `${name(ft.assigneeId)}님께 ${stage === 'nudge' ? '한 번 더 ' : ''}알림` });
  const gap = ft.followUpLevel >= 2 ? TASK_FOLLOWUP.escalateAfterMin : TASK_FOLLOWUP.repeatAfterMin;
  ft.nextFollowUpAt = new Date(now().getTime() + gap * MIN).toISOString();
  save(fresh, auto ? TACHI_ID : by);
  return { ok: true };
}

/** Tell the family room the task is still open (or that the owner asked for help) and offer to take it over. */
export async function escalateTask(a: Artifact, t: ArtifactTask, by: ID | 'auto', reason: 'timeout' | 'help'): Promise<void> {
  const text = reason === 'help'
    ? `${honor(t.assigneeId)}이 ‘${short(t)}’에 도움이 필요하대요. 함께 맡아 주실 분 계세요?`
    : `‘${short(t)}’ 할 일이 아직 남아 있어요.${t.assigneeId ? ` ${honor(t.assigneeId)}이 바쁘시면` : ''} 다른 분이 맡아 주실래요?`;
  await tachiSay(a.roomId, {
    kind: 'task_card', text, payload: cardFor(a, t, 'escalate'),
    actions: [
      { id: 'task_take', label: '제가 맡을게요', style: 'primary', data: { artifactId: a.id, taskId: t.id } },
      { id: 'task_done', label: '이미 끝났어요', data: { artifactId: a.id, taskId: t.id } },
    ],
  });
  const fresh = ctx.db.artifacts.get(a.id);
  const ft = fresh?.tasks.find(x => x.id === t.id);
  if (!fresh || !ft) return;
  ft.followUpLevel = TASK_FOLLOWUP.maxLevel;
  if (reason === 'help') ft.status = 'blocked';
  delete ft.nextFollowUpAt;
  record(ft, { kind: 'escalate', by, level: ft.followUpLevel, roomId: a.roomId, note: reason === 'help' ? '가족방에 도움 요청' : '가족방에 아직 남았다고 알림' });
  save(fresh);
}

/** Booking link card in the family room: deep links built from the place (no network), who is responsible, and '예약 완료'. */
export async function shareBooking(a: Artifact, t: ArtifactTask, by: ID): Promise<TaskResult> {
  const cls = t.action?.kind === 'booking_link' ? t.action : { ...classifyTask(t.text), kind: 'booking_link' as const };
  const plan = buildBookingLinks({ category: cls.category ?? 'other', taskText: t.text, place: a.place, query: cls.query, date: a.slot ? new Date(a.slot.startsAt) : undefined });
  // '숙소·식당 예약': one task, two bookings → restaurant links follow the lodging ones
  if (cls.category === 'lodging' && /식당|맛집|한정식/.test(t.text)) {
    const food = buildBookingLinks({ category: 'restaurant', taskText: t.text, place: a.place, query: /한정식/.test(t.text) ? '한정식' : '식당' });
    plan.links.push(...food.links);
  }
  t.action = { ...t.action, ...cls, kind: 'booking_link', query: plan.query, links: plan.links, classifiedBy: t.action?.classifiedBy ?? 'heuristic' };
  t.link = plan.links[0]?.url;
  t.executedAt = nowIso();
  if (t.status === 'todo') t.status = 'in_progress';
  record(t, { kind: 'booking', by, note: `예약 링크 공유 · ${plan.query}` });
  save(a, by === TACHI_ID ? TACHI_ID : by);
  const who = t.assigneeId ? `${honor(t.assigneeId)}이 맡아 주세요.` : '맡아 주실 분을 정해 주세요.';
  await tachiSay(a.roomId, {
    kind: 'task_card',
    text: `‘${short(t)}’ 예약 링크를 준비했어요 (${plan.query}). ${who}`,
    payload: cardFor(a, t, 'booking', { links: plan.links }),
    actions: [{ id: 'task_booked', label: '예약 완료', style: 'primary', data: { artifactId: a.id, taskId: t.id } }],
  });
  return { ok: true };
}

/** Confirmed gathering date (schedule_result / '이 시간으로 확정'): re-derive the open tasks' due dates from the new slot. */
export function replanTaskDueDates(artifactId: ID): void {
  try {
    const a = ctx.db.artifacts.get(artifactId);
    if (!a || !a.slot) return;
    for (const t of a.tasks) if (isOpen(t)) {
      t.dueAt = defaultDue(t, a);
      if ((t.followUpLevel ?? 0) === 0) delete t.nextFollowUpAt; // re-planned from the new due date
    }
    save(a);
  } catch (e) { warn('due-date replan failed:', e); }
}

/** Run a task's action now (socket artifact:task:execute). `kind` overrides the classified action (remembered as the user's choice). */
export async function executeTask(userId: ID, artifactId: ID, taskId: ID, kind?: TaskActionKind): Promise<TaskResult> {
  const a = ctx.db.artifacts.get(artifactId);
  const room = a && ctx.db.rooms.get(a.roomId);
  if (!a || !room || !isMember(room, userId)) return { ok: false, error: 'forbidden' };
  const t = a.tasks.find(x => x.id === taskId);
  if (!t) return { ok: false, error: 'unknown task' };
  normalizeTasks(a);
  const by = userId === DIRECTOR_ID ? TACHI_ID : userId;
  if (kind && TASK_KINDS.includes(kind) && kind !== t.action?.kind) {
    const h = classifyTask(t.text);
    t.action = { ...(kind === h.kind ? h : {}), kind, classifiedBy: 'user' };
    save(a, by);
  }
  switch (t.action?.kind) {
    case 'booking_link': return shareBooking(a, t, by);
    case 'reminder': return remindAssignee(a, t, by);
    default: return { ok: false, error: 'no action', message: '타치가 대신 할 수 있는 일이 없어요.' };
  }
}

// ── replies ─────────────────────────────────────────────────────────────────

/** 완료 / 도움 필요 / 나중에 from the assignee (card button or typed reply). */
export async function applyTaskReply(actor: ID, artifactId: ID, taskId: ID, reply: TaskReply, roomId: ID): Promise<TaskResult> {
  const a = ctx.db.artifacts.get(artifactId);
  const t = a?.tasks.find(x => x.id === taskId);
  if (!a || !t) return { ok: false, error: 'unknown task' };
  const by = actor === DIRECTOR_ID ? (t.assigneeId ?? TACHI_ID) : actor;
  if (!isOpen(t) && reply !== 'done') { settleCards(t.id); await tachiSay(roomId, { text: `‘${short(t)}’ 할 일은 이미 끝났어요. 고마워요!` }); return { ok: true }; }
  settleCards(t.id);
  if (reply === 'done') {
    const wasOpen = isOpen(t);
    completeTask(t, by, t.result ?? `완료 · ${name(by)}`);
    record(t, { kind: 'reply', by, reply, roomId, note: '완료했어요' });
    save(a, by);
    await tachiSay(roomId, { kind: roomId === a.roomId ? 'task_card' : 'text', text: `고마워요! ‘${short(t)}’ 완료로 표시했어요.`, ...(roomId === a.roomId ? { payload: cardFor(a, t, 'done') } : {}) });
    if (wasOpen && roomId !== a.roomId) {
      await tachiSay(a.roomId, { kind: 'task_card', text: `${honor(by)}이 ‘${short(t)}’${eul(t.text)} 마쳤어요.`, payload: cardFor(a, t, 'done') });
    }
  } else if (reply === 'later') {
    const next = new Date(now().getTime() + TASK_FOLLOWUP.snoozeMin * MIN);
    t.nextFollowUpAt = next.toISOString();
    t.status = t.status === 'blocked' ? 'todo' : t.status;
    record(t, { kind: 'reply', by, reply, roomId, note: `나중에 · ${koreanTime(next)}에 다시` });
    save(a, by);
    await tachiSay(roomId, { text: `알겠어요. ${koreanTime(next)}쯤 다시 여쭤볼게요.` });
  } else {
    t.status = 'blocked';
    record(t, { kind: 'reply', by, reply, roomId, note: '도움이 필요해요' });
    save(a, by);
    await tachiSay(roomId, { text: '알겠어요. 가족방에 함께 맡아 줄 분을 찾아볼게요.' });
    await escalateTask(ctx.db.artifacts.get(a.id) ?? a, t, by, 'help');
  }
  return { ok: true };
}

/**
 * Task card buttons (authorization: room membership; data from the stored action only).
 * task_done/help/later in a 1:1 room: the assignee (or the Director). In the family room any member may mark done / take over / booked.
 */
export async function handleTaskAction(userId: ID, msg: Message, actionId: string): Promise<TaskResult> {
  const room = ctx.db.rooms.get(msg.roomId);
  if (!room || !isMember(room, userId)) return { ok: false, error: 'not a member' };
  const act = msg.actions?.find(x => x.id === actionId);
  if (!act) return { ok: false, error: 'action not on message' };
  if (act.done) return { ok: true };
  const artifactId = typeof act.data?.artifactId === 'string' ? act.data.artifactId : '';
  const taskId = typeof act.data?.taskId === 'string' ? act.data.taskId : '';
  const a = ctx.db.artifacts.get(artifactId);
  const t = a?.tasks.find(x => x.id === taskId);
  if (!a || !t) return { ok: false, error: 'unknown task' };
  const familyCard = room.id === a.roomId;
  const director = userId === DIRECTOR_ID;
  if (actionId === 'task_take') {
    if (!familyCard || director || !room.memberIds.includes(userId)) return { ok: false, error: 'forbidden' };
    markActionDone(msg, undefined, actionId);
    t.assigneeId = userId;
    resetFollowUps(t);
    record(t, { kind: 'status', by: userId, note: `${name(userId)}님이 맡음` });
    save(a, userId);
    await tachiSay(room.id, { kind: 'task_card', text: `${honor(userId)}이 ‘${short(t)}’${eul(t.text)} 맡아 주셨어요. 고마워요!`, payload: cardFor(a, t, 'reminder') });
    return { ok: true };
  }
  if (actionId === 'task_booked') {
    markActionDone(msg, undefined, actionId);
    const by = director ? (t.assigneeId ?? TACHI_ID) : userId;
    if (isOpen(t)) {
      completeTask(t, by, `예약 완료 · ${name(by)}`);
      record(t, { kind: 'reply', by, reply: 'done', roomId: room.id, note: '예약 완료' });
      save(a, by);
      settleCards(t.id);
      await tachiSay(room.id, { kind: 'task_card', text: `‘${short(t)}’ 예약 완료로 표시했어요. 고마워요, ${honor(by)}!`, payload: cardFor(a, t, 'done') });
    }
    return { ok: true };
  }
  const reply: TaskReply | undefined = actionId === 'task_done' ? 'done' : actionId === 'task_help' ? 'help' : actionId === 'task_later' ? 'later' : undefined;
  if (!reply) return { ok: false, error: 'unknown action' };
  const assignee = t.assigneeId === userId || director;
  if (!assignee && !(familyCard && reply === 'done')) return { ok: false, error: 'not the assignee' };
  markActionDone(msg, undefined, actionId);
  return applyTaskReply(userId, a.id, t.id, reply, room.id);
}

const DONE_RE = /완료|다\s*했|했어요|했어|끝났|끝냈|마쳤|예약\s*했/;
const HELP_RE = /도움|도와|못\s*하겠|어려워|힘들|못 할/;
const LATER_RE = /나중에|이따|내일|조금\s*있다|좀\s*있다/;

/** Typed reply in a 1:1 room to the latest pending reminder card. Returns true when handled. */
export async function tryTaskReply(room: Room, userId: ID, text: string): Promise<boolean> {
  const recent = ctx.db.messages.byRoom(room.id, 8).reverse();
  const card = recent.find(m => m.kind === 'task_card' && m.payload?.type === 'task_card' && m.payload.taskId && m.actions?.some(x => !x.done));
  if (!card || card.payload?.type !== 'task_card') return false;
  const a = ctx.db.artifacts.get(card.payload.artifactId);
  const t = a?.tasks.find(x => x.id === (card.payload as TaskCardPayload).taskId);
  if (!a || !t || (t.assigneeId !== userId)) return false;
  const reply: TaskReply | undefined = HELP_RE.test(text) ? 'help' : LATER_RE.test(text) ? 'later' : DONE_RE.test(text) ? 'done' : undefined;
  if (!reply) {
    if (room.pollId && ctx.db.polls.get(room.pollId)?.status === 'open') return false; // an availability answer
    await tachiSay(room.id, { text: `‘${short(t)}’ 말씀이시죠? 완료했어요 / 도움이 필요해요 / 나중에 할게요 중에서 골라 주세요.` });
    return true;
  }
  markActionDone(card);
  await applyTaskReply(userId, a.id, t.id, reply, room.id);
  return true;
}

// ── follow-up scheduler ─────────────────────────────────────────────────────

/**
 * Find open tasks whose follow-up time has passed (demo clock) and take the next polite step:
 * level 0 → reminder DM, 1 → second nudge, 2 → tell the family room / offer to reassign. Returns the number of steps taken.
 */
export async function runFollowUps(at: Date = now()): Promise<number> {
  let n = 0;
  for (const a0 of ctx.db.artifacts.all()) {
    const room = ctx.db.rooms.get(a0.roomId);
    if (!room || room.type !== 'family') continue;
    const before = JSON.stringify(a0);
    const a = normalizeTasks(a0, at);
    if (JSON.stringify(a) !== before) { ctx.db.artifacts.put(a); emitArtifact(a); }
    const due = a.tasks.filter(t => followable(t) && t.nextFollowUpAt && Date.parse(t.nextFollowUpAt) <= at.getTime());
    for (const t0 of due) {
      if (isStale()) return n;
      const fresh = ctx.db.artifacts.get(a.id);
      const t = fresh?.tasks.find(x => x.id === t0.id);
      if (!fresh || !t || !followable(t)) continue;
      const level = t.followUpLevel ?? 0;
      if (level <= 0) await remindAssignee(fresh, t, 'auto', 'reminder');
      else if (level === 1) await remindAssignee(fresh, t, 'auto', 'nudge');
      else await escalateTask(fresh, t, 'auto', 'timeout');
      n++;
    }
  }
  return n;
}

// ── report ──────────────────────────────────────────────────────────────────

/** Open to-dos of the family room's gatherings for the daily report (blocked first, then by due time). */
export function openTasksForReport(roomId: ID = FAMILY_ROOM_ID): ReportOpenTask[] {
  const rank = (s?: TaskStatus) => (s === 'blocked' ? 0 : s === 'in_progress' ? 1 : 2);
  return ctx.db.artifacts.all().filter(a => a.roomId === roomId).flatMap(a => a.tasks.filter(isOpen).map(t => ({
    artifactId: a.id, taskId: t.id, text: t.text, assigneeId: t.assigneeId, status: (t.status ?? 'todo') as TaskStatus, dueAt: t.dueAt,
    followUpCount: (t.followUps ?? []).filter(f => f.kind === 'reminder' || f.kind === 'nudge' || f.kind === 'escalate' || f.kind === 'manual').length,
  }))).sort((x, y) => rank(x.status) - rank(y.status) || (x.dueAt ?? '9').localeCompare(y.dueAt ?? '9')).slice(0, 5);
}

