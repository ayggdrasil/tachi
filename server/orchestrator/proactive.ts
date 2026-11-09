// 4.8 Proactive greetings + family report.
import { DAILY_REPORT_TIME, FAMILY_ROOM_ID, SENIOR_ROOM_ID, dayHeaderLabel } from '../../shared/constants';
import type { Memory, PrivacyCategory, ProactiveKind, ReportPayload } from '../../shared/types';
import { ctx } from './ctx';
import { getDemo, markFiredUpTo, getHealth, getPrivacy, memoryVisibleToFamily, now, patchDemo, reportHighlight, runWithGen, senior, tachiSay } from './core';
import { reactBots } from './bots';
import { deliverDueReminders } from './agentic';
import { endSession, sessionHiddenFromFamily, startSession, todaysSessions } from './sessions';
import { pick, warn, ymd } from '../util/misc';
import { openTasksForReport, runFollowUps } from './tasks';
import { openTasksLine } from '../brain/heuristics/tasks';

const KEY_ACTIVE = 'active-proactive';
const TITLES: Record<ProactiveKind, string> = { morning: '아침 안부', memory: '추억 이야기', evening: '저녁 인사', ask_photo: '사진 이야기' };
const CATEGORY: Record<ProactiveKind, PrivacyCategory> = { morning: 'daily', evening: 'daily', memory: 'memory', ask_photo: 'memory' };
const INITIAL: Record<ProactiveKind, string> = {
  morning: '아침 인사를 건넸어요.', evening: '저녁 인사를 건넸어요.', memory: '옛 추억 이야기를 건넸어요.', ask_photo: '옛 사진을 보여달라고 부탁드렸어요.',
};
const DONE: Record<ProactiveKind, string> = {
  morning: '아침 인사를 나누며 하루 컨디션을 이야기하셨어요.', evening: '저녁 인사를 나누며 하루를 돌아보셨어요.',
  memory: '옛 추억 이야기를 나누셨어요.', ask_photo: '옛 사진 이야기를 나누기로 하셨어요.',
};

export function defaultKind(d = now()): ProactiveKind {
  const h = d.getHours();
  return h < 11 ? 'morning' : h < 17 ? 'memory' : 'evening';
}

function memoryFor(kind: ProactiveKind): { kind: ProactiveKind; memory?: Memory } {
  const saved = ctx.db.memories.all().filter(m => m.status === 'saved');
  if (kind === 'morning') return { kind, memory: saved.find(m => m.id === 'mem-haeundae-1988') ?? (saved.length ? pick(saved) : undefined) };
  if (kind === 'memory') return saved.length ? { kind, memory: pick(saved) } : { kind: 'ask_photo' };
  return { kind };
}

export async function fireProactive(requested?: ProactiveKind): Promise<void> {
  const want = requested ?? defaultKind();
  const { kind, memory } = memoryFor(want);
  const prev = ctx.db.kv.get<string>(KEY_ACTIVE);
  if (prev) endSession(prev);
  const sess = startSession('proactive', TITLES[kind], CATEGORY[kind], INITIAL[kind]);
  ctx.db.kv.set(KEY_ACTIVE, sess.id);
  const entry = getDemo().proactiveSchedule.find(e => e.kind === want || e.kind === kind);
  if (entry) markFired(entry.kind);
  markFiredUpTo(now()); // anything scheduled at or before 'now' must not re-fire from the ticker
  const ai = await ctx.brain.proactiveMessage({ kind, memory, senior: senior(), now: now() });
  if (memory) ctx.db.kv.set<ProactiveMemory>(KEY_PROACTIVE_MEMORY, { memoryId: memory.id, sessionId: sess.id, at: now().toISOString() });
  else ctx.db.kv.del(KEY_PROACTIVE_MEMORY);
  await tachiSay(SENIOR_ROOM_ID, {
    text: ai.value.text, quickReplies: ai.value.quickReplies,
    meta: { proactive: true, sessionId: sess.id, category: CATEGORY[kind], ...(memory ? { memoryId: memory.id } : {}) },
  }, ai);
}

const KEY_PROACTIVE_MEMORY = 'proactive-memory';
export interface ProactiveMemory { memoryId: string; sessionId: string; at: string }
/** The memory the latest proactive greeting referred to (for continuation replies like '그 사진 얘기해 줄게'); undefined once another flow started. */
export function getProactiveMemory(): ProactiveMemory | undefined {
  const p = ctx.db.kv.get<ProactiveMemory>(KEY_PROACTIVE_MEMORY);
  return p && now().getTime() - new Date(p.at).getTime() < 30 * 60000 ? p : undefined; // goes stale after 30 min
}
/** Another flow started: the proactive memory is no longer the conversational target. */
export function clearProactiveMemory(): void { if (ctx.db.kv.get(KEY_PROACTIVE_MEMORY)) ctx.db.kv.del(KEY_PROACTIVE_MEMORY); }

function markFired(kind: ProactiveKind): void {
  const today = ymd(now());
  const d = getDemo();
  patchDemo({ proactiveSchedule: d.proactiveSchedule.map(e => (e.kind === kind ? { ...e, firedOn: today } : e)) });
}

/** The senior answered inside a proactive session → close it (the family report goes out at 21:00 or on demand). */
export function noteSeniorReply(roomId: string): void {
  if (roomId !== SENIOR_ROOM_ID) return;
  const id = ctx.db.kv.get<string>(KEY_ACTIVE);
  if (!id) return;
  ctx.db.kv.del(KEY_ACTIVE);
  const s = ctx.db.sessions.get(id);
  if (s) endSession(id, s.summary === INITIAL[kindOfTitle(s.title)] || !s.endedAt ? DONE[kindOfTitle(s.title)] : s.summary);
}

function kindOfTitle(title: string): ProactiveKind {
  return (Object.entries(TITLES).find(([, t]) => t === title)?.[0] as ProactiveKind | undefined) ?? 'morning';
}

const MASKED_TITLE = '대화';
const MASKED_SUMMARY = '비공개 대화예요';

export async function postReport(auto = false): Promise<void> {
  ctx.db.kv.set('report-fired-on', ymd(now())); // manual or automatic: today's report is out, the ticker must not add another
  const sessions = todaysSessions();
  if (auto && !sessions.length) return;
  const privacy = getPrivacy();
  const moodToday = privacy.mood === 'family' ? getHealth()?.mood.at(-1)?.label : undefined;
  // sessions about a memory the family cannot see are masked before the brain ever sees them
  const hidden = new Set(sessions.filter(sessionHiddenFromFamily).map(s => s.id));
  const forBrain = sessions.map(s => (hidden.has(s.id) ? { ...s, title: MASKED_TITLE, summary: MASKED_SUMMARY, memoryId: undefined } : s));
  const openTasks = openTasksForReport(FAMILY_ROOM_ID);
  const people = Object.fromEntries(ctx.db.users.all().map(u => [u.id, u.shortName]));
  const ai = await ctx.brain.composeReport({ sessions: forBrain, privacy, moodToday, senior: senior(), now: now(), openTasks, people });
  const v = ai.value;
  const rows = (v.sessions ?? []).map(s => (
    privacy[s.category] === 'private' || (s.title === MASKED_TITLE && s.summary === MASKED_SUMMARY)
      ? { ...s, title: MASKED_TITLE, summary: MASKED_SUMMARY, isPrivate: true } : s));
  // the highlight must never carry a private memory's title (or a masked session's original wording)
  const secrets = [
    ...ctx.db.memories.all().filter(m => !memoryVisibleToFamily(m)).map(m => m.title),
    ...sessions.filter(s => hidden.has(s.id)).flatMap(s => [s.title, s.summary]),
  ].filter(t => t && t.length >= 2 && t !== MASKED_TITLE);
  let highlight = v.highlight;
  if (highlight && secrets.some(t => highlight!.includes(t))) highlight = undefined;
  if (!highlight || hidden.size || rows.some(r => r.isPrivate)) highlight = rows.length ? reportHighlight(rows) : v.highlight ?? reportHighlight(rows);
  const payload: ReportPayload = {
    ...v, type: 'report',
    dateLabel: v.dateLabel || dayHeaderLabel(now()),
    moodLabel: privacy.mood === 'family' ? v.moodLabel ?? moodToday : undefined,
    sessions: rows,
    highlight,
    // open gathering to-dos come from the orchestrator's own state (whatever the model returned)
    ...(openTasks.length ? { openTasks, tasksLine: v.tasksLine || openTasksLine(openTasks, people) } : { openTasks: undefined, tasksLine: undefined }),
  };
  sessions.forEach(s => ctx.db.sessions.put({ ...s, reported: true }));
  const m = await tachiSay(FAMILY_ROOM_ID, {
    kind: 'report', text: payload.highlight || `${payload.dateLabel} 어머님과 나눈 이야기를 정리했어요.`, payload,
  }, ai);
  reactBots(FAMILY_ROOM_ID, m);
}

// ── ticker ──────────────────────────────────────────────────────────────────
let timer: NodeJS.Timeout | undefined;

export function startTicker(): void {
  stopTicker();
  timer = setInterval(() => { if (ctx.resetting) return; runWithGen(ctx.gen, () => tick()).catch(e => warn('tick failed:', e)); }, 20_000);
  timer.unref?.();
}
export function stopTicker(): void { if (timer) clearInterval(timer); timer = undefined; }

function inWindow(t: Date, hhmm: string): boolean {
  const [h, m] = hhmm.split(':').map(Number);
  const diff = t.getHours() * 60 + t.getMinutes() - (h * 60 + m);
  return diff >= 0 && diff <= 5;
}

export async function tick(): Promise<void> {
  // reminders are promises made to the senior: delivered even while the Director drives the demo
  await deliverDueReminders().catch(e => warn('reminder delivery failed:', e));
  if (ctx.io?.sockets.adapter.rooms.get('user:director')?.size) return; // the Director drives the demo by hand
  const t = now();
  const today = ymd(t);
  for (const e of getDemo().proactiveSchedule) {
    if (e.firedOn !== today && inWindow(t, e.time)) { markFired(e.kind); await fireProactive(e.kind); }
  }
  if (ctx.db.kv.get<string>('report-fired-on') !== today && inWindow(t, DAILY_REPORT_TIME)) {
    ctx.db.kv.set('report-fired-on', today);
    await postReport(true);
  }
  await runFollowUps(t); // to-do follow-ups (reminder → second nudge → family room), demo clock
}

