// Reminders: SQLite store + reminder_create / reminder_list tools. Delivery happens on the proactive ticker (orchestrator/agentic.ts).
import { nanoid } from 'nanoid';
import type { PrivacyCategory } from '../../shared/types';
import type { Db } from '../db';
import type { Reminder, Tool, ToolContext } from './types';
import { ToolError } from './types';
import { parseWhen, whenLabel } from './time';

const HEALTH_RE = /약|혈압|병원|진료|검진|주사|혈당|복용|내과|치과|한의원|물리치료/;
export const reminderCategory = (text: string): PrivacyCategory => (HEALTH_RE.test(text) ? 'health' : 'daily');

export function createReminder(db: Db, r: Omit<Reminder, 'id' | 'createdAt' | 'status' | 'category'> & { category?: PrivacyCategory }, now: Date): Reminder {
  return db.reminders.put({ ...r, category: r.category ?? reminderCategory(r.text), id: `rem-${nanoid(8)}`, status: 'scheduled', createdAt: now.toISOString() });
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
  description: '어머님께 정해진 시간에 알림을 보내도록 등록합니다. Schedule a reminder that Tachi will say to the senior at the given time '
    + '(in her chat). at: ISO local time or Korean ("내일 아침 8시", "오후 3시 반", "30분 뒤"). repeat: none | daily. Only the senior can be reminded.',
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
    const dup = scheduledReminders(ctx.db, target).find(r => r.text === args.text && Math.abs(Date.parse(r.dueAt) - due.getTime()) < 60000);
    const r = dup ?? createReminder(ctx.db, { userId: target, text: args.text, dueAt: due.toISOString(), repeat: args.repeat, createdBy: ctx.callerId }, now);
    if (!dup) ctx.notify?.({ kind: 'reminder_created', reminder: r });
    return {
      data: { created: !dup, duplicate: !!dup, reminder: view(r, ctx) },
      summary: `알림 ${whenLabel(due)} '${r.text}'${r.repeat === 'daily' ? ' (매일)' : ''}`,
      provenance: { categories: ctx.audience === 'family' && r.category === 'health' ? ['health'] : [] },
    };
  },
};

export const reminderList: Tool<{ forUserId?: string }> = {
  name: 'reminder_list',
  label: '알림 목록',
  description: '등록된 알림 목록을 봅니다. List the senior\'s scheduled reminders (family members only see the ones they set or that the senior made public).',
  audiences: ['senior', 'family'],
  inputSchema: { type: 'object', additionalProperties: false, properties: { forUserId: { type: 'string', maxLength: 20 } } },
  execute(args, ctx) {
    const target = args.forUserId ?? ctx.seniorId;
    if (target !== ctx.seniorId) throw new ToolError('forbidden', 'only the senior has reminders');
    const all = scheduledReminders(ctx.db, target);
    const shown = all.filter(r => visibleTo(r, ctx));
    const cats = [...new Set(shown.map(r => r.category))].filter(c => ctx.audience === 'family' && c !== 'daily');
    return {
      data: { reminders: shown.map(r => view(r, ctx)), hiddenCount: all.length - shown.length },
      summary: `알림 ${shown.length}건${all.length > shown.length ? ` (비공개 ${all.length - shown.length}건)` : ''}`,
      provenance: { categories: cats },
    };
  },
};
