// Reminders: SQLite store + reminder_create / reminder_list tools. Delivery happens on the proactive ticker (orchestrator/agentic.ts).
import { nanoid } from 'nanoid';
import type { PrivacyCategory } from '../../shared/types';
import type { Db } from '../db';
import type { Reminder, Tool, ToolContext } from './types';
import { ToolError } from './types';
import { parseWhen, whenLabel } from './time';

const HEALTH_RE = /약|혈압|병원|진료|검진|주사|혈당|복용|내과|치과|한의원|물리치료|\bpills?\b|\bmedic(?:ine|ation)s?\b|\bblood (?:pressure|sugar)\b|\bhospital\b|\bdoctor\b|\bclinic\b|check-?up|\bdentist\b|\binsulin\b|\binjection\b|\bphysio(?:therapy)?\b|\btablets?\b|\bprescription\b/i;
export const reminderCategory = (text: string): PrivacyCategory => (HEALTH_RE.test(text) ? 'health' : 'daily');

export function createReminder(db: Db, r: Omit<Reminder, 'id' | 'createdAt' | 'status' | 'category'> & { category?: PrivacyCategory }, now: Date): Reminder {
  return db.reminders.put({ ...r, category: r.category ?? reminderCategory(r.text), id: `rem-${nanoid(8)}`, status: 'scheduled', createdAt: now.toISOString() });
}
// Words that do not change what a reminder is about ("take your pill in the morning" = "Take your pill.").
const FILLER = new Set(['take', 'your', 'my', 'her', 'the', 'a', 'an', 'to', 'please', 'remind', 'reminder', 'me', 'mom', 'of', 'in', 'at', 'on', 'for',
  'morning', 'afternoon', 'evening', 'night', 'tonight', 'tomorrow', 'today', 'daily', 'every', 'day',
  '드시기', '드세요', '먹기', '하기', '챙기기', '챙겨', '드시라고', '아침', '점심', '저녁', '밤', '오전', '오후', '내일', '오늘', '매일']);
// Korean particles glued to a word ("화분에" = "화분", "약을" = "약")
const PARTICLE = /(에서|으로|에게|한테|에|을|를|은|는|이|가|도|로|과|와|랑)$/;
const stem = (w: string): string => (/[가-힣]/.test(w) && w.length > 2 ? w.replace(PARTICLE, '') : w);
const coreWords = (text: string): Set<string> =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).map(stem).filter(w => w && !FILLER.has(w)));
/** Same reminder in other words: identical core words, or one set contains the other. */
export function sameReminderText(a: string, b: string): boolean {
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  const x = coreWords(a), y = coreWords(b);
  if (!x.size || !y.size) return false;
  const [small, big] = x.size <= y.size ? [x, y] : [y, x];
  return [...small].every(w => big.has(w));
}
export const scheduledReminders = (db: Db, userId?: string): Reminder[] =>
  db.reminders.all().filter(r => r.status === 'scheduled' && (!userId || r.userId === userId)).sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
export const dueReminders = (db: Db, now: Date): Reminder[] => scheduledReminders(db).filter(r => Date.parse(r.dueAt) <= now.getTime());

/** Mark delivered; a daily reminder is rescheduled for the next day instead. */
export function markDelivered(db: Db, r: Reminder, now: Date): Reminder {
  if (r.repeat === 'daily') {
    let next = Date.parse(r.dueAt);
    while (next <= now.getTime()) next += 86400000;
    return db.reminders.put({ ...r, dueAt: new Date(next).toISOString(), deliveredAt: now.toISOString() });
  }
  return db.reminders.put({ ...r, status: 'delivered', deliveredAt: now.toISOString() });
}

/** Family members only see reminders they set, or ones whose category the senior made public. */
function visibleTo(r: Reminder, ctx: ToolContext): boolean {
  if (ctx.audience === 'senior') return true;
  return r.createdBy === ctx.callerId || ctx.privacy()[r.category] === 'family';
}
const nameOf = (ctx: ToolContext, id: string) => ctx.users().find(u => u.id === id)?.shortName ?? id;
const view = (r: Reminder, ctx: ToolContext) => ({
  id: r.id, text: r.text, when: whenLabel(new Date(r.dueAt)), dueAt: r.dueAt, repeat: r.repeat, setBy: nameOf(ctx, r.createdBy),
});

export const reminderCreate: Tool<{ text: string; at: string; repeat: 'none' | 'daily'; forUserId?: string }> = {
  name: 'reminder_create',
  label: '알림 등록',
  labelEn: 'set a reminder',
  description: '어머님께 정해진 시간에 알림을 보내도록 등록합니다. Schedule a reminder that Tachi will say to the senior at the given time '
    + '(in her chat). at: ISO local time, English ("tomorrow 8am", "3:30 pm", "in 30 minutes") or Korean ("내일 아침 8시", "오후 3시 반", "30분 뒤"). '
    + 'text: what to remind her of, in the language of the conversation. repeat: none | daily. Only the senior can be reminded.',
  audiences: ['senior', 'family'],
  mutates: true,
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['text', 'at'],
    properties: {
      text: { type: 'string', minLength: 2, maxLength: 80, description: '무엇을 알려 드릴지 (예: 혈압약 드시기)' },
      at: { type: 'string', minLength: 2, maxLength: 40 },
      repeat: { type: 'string', enum: ['none', 'daily'], default: 'none' },
      forUserId: { type: 'string', maxLength: 20, description: 'defaults to the senior (mom)' },
    },
  },
  execute(args, ctx) {
    const now = ctx.now();
    const target = args.forUserId ?? ctx.seniorId;
    if (target !== ctx.seniorId) throw new ToolError('forbidden', 'reminders can only be set for the senior');
    const due = parseWhen(args.at, now);
    if (!due) throw new ToolError('invalid', 'at: unrecognised time');
    if (due.getTime() < now.getTime() - 60000) throw new ToolError('invalid', 'at is in the past');
    if (due.getTime() - now.getTime() > 180 * 86400000) throw new ToolError('invalid', 'at is too far ahead (max 180 days)');
    const dup = scheduledReminders(ctx.db, target).find(r => Math.abs(Date.parse(r.dueAt) - due.getTime()) < 60000 && sameReminderText(r.text, args.text));
    const r = dup ?? createReminder(ctx.db, { userId: target, text: args.text, dueAt: due.toISOString(), repeat: args.repeat, createdBy: ctx.callerId }, now);
    if (!dup) ctx.notify?.({ kind: 'reminder_created', reminder: r });
    return {
      data: { created: !dup, duplicate: !!dup, reminder: view(r, ctx) },
      summary: `알림 ${whenLabel(due)} '${r.text}'${r.repeat === 'daily' ? ' (매일)' : ''}`,
      provenance: { categories: [] }, // the caller's own reminder: nothing of the senior's is disclosed (ISSUE-017)
    };
  },
};

export const reminderList: Tool<{ forUserId?: string }> = {
  name: 'reminder_list',
  label: '알림 목록',
  labelEn: 'reminder list',
  description: '등록된 알림 목록을 봅니다. List the senior\'s scheduled reminders (family members only see the ones they set or that the senior made public).',
  audiences: ['senior', 'family'],
  inputSchema: { type: 'object', additionalProperties: false, properties: { forUserId: { type: 'string', maxLength: 20 } } },
  execute(args, ctx) {
    const target = args.forUserId ?? ctx.seniorId;
    if (target !== ctx.seniorId) throw new ToolError('forbidden', 'only the senior has reminders');
    const all = scheduledReminders(ctx.db, target);
    const shown = all.filter(r => visibleTo(r, ctx));
    // only reminders shown because the senior shared that category count; the asker's own ones disclose nothing (ISSUE-017)
    const cats = [...new Set(shown.filter(r => r.createdBy !== ctx.callerId).map(r => r.category))].filter(c => ctx.audience === 'family' && c !== 'daily');
    return {
      data: { reminders: shown.map(r => view(r, ctx)), hiddenCount: all.length - shown.length },
      summary: `알림 ${shown.length}건${all.length > shown.length ? ` (비공개 ${all.length - shown.length}건)` : ''}`,
      provenance: { categories: cats },
    };
  },
};
