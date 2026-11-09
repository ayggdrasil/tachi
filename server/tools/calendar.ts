// Calendar: provider interface + local SQLite store + demo seed + the calendar_list / calendar_invite tools.
import { nanoid } from 'nanoid';
import type { Db } from '../db';
import type { CalendarEvent, CalendarProvider, NewCalendarEvent, Tool, ToolContext } from './types';
import { ToolError } from './types';
import { parseRange, parseWhen, whenLabel } from './time';

const overlaps = (e: CalendarEvent, from: Date, to: Date) => Date.parse(e.startsAt) < to.getTime() && Date.parse(e.endsAt) > from.getTime();
const involves = (e: CalendarEvent, ids: string[]) => ids.includes(e.ownerId) || e.attendeeIds.some(a => ids.includes(a));

/** The built-in calendar (SQLite `calendar_events`). */
export class LocalCalendar implements CalendarProvider {
  readonly id = 'local';
  constructor(private db: Db) {}
  async list(q: { userIds?: string[]; from: Date; to: Date }): Promise<CalendarEvent[]> {
    return this.db.calendar.all()
      .filter(e => overlaps(e, q.from, q.to) && (!q.userIds?.length || involves(e, q.userIds)))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  }
  async create(e: NewCalendarEvent): Promise<CalendarEvent> {
    return this.db.calendar.put({ ...e, id: `cal-${nanoid(8)}`, createdAt: new Date().toISOString() });
  }
}

let override: ((db: Db) => CalendarProvider) | undefined;
/** Plug in another provider (e.g. a Google Calendar adapter). `null` restores the local store. */
export function setCalendarProviderFactory(f: ((db: Db) => CalendarProvider) | null): void { override = f ?? undefined; }
export function calendarProvider(db: Db): CalendarProvider { return override ? override(db) : new LocalCalendar(db); }

/** Plausible demo week for the personas, relative to `now`. Deterministic, idempotent per wipe. */
export function seedCalendar(db: Db, now: Date = new Date()): void {
  const at = (days: number, hh: number, mm = 0) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(hh, mm, 0, 0); return d; };
  const ev = (id: string, ownerId: string, title: string, start: Date, minutes: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
    id, ownerId, title, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + minutes * 60000).toISOString(),
    attendeeIds: [], visibility: 'family', source: 'seed', createdAt: now.toISOString(), ...extra,
  });
  const nextDow = (dow: number) => ((dow - now.getDay() + 7) % 7) || 7;
  const events: CalendarEvent[] = [
    ev('cal-seed-clinic', 'mom', '마포 연세내과 정기 검진', at(1, 10, 30), 60, { location: '마포 연세내과', note: '혈압약 처방 갱신' }),
    ev('cal-seed-calligraphy', 'mom', '서교동 노인정 서예 교실', at(2, 14), 90, { location: '서교동 노인정' }),
    ev('cal-seed-friend', 'mom', '정숙이와 망원시장 점심', at(3, 12), 120, { location: '망원시장', visibility: 'private' }),
    ev('cal-seed-church', 'mom', '주일 미사', at(nextDow(0), 9), 90, { location: '서교동 성당' }),
    ev('cal-seed-jieun-dinner', 'jieun', '팀 회식', at(1, 19), 150, { location: '광화문' }),
    ev('cal-seed-jieun-visit', 'jieun', '엄마 댁 방문', at(nextDow(6), 15), 120, { attendeeIds: ['mom'], location: '어머님 댁' }),
    ev('cal-seed-minjun-pickup', 'minjun', '아이 학원 픽업', at(nextDow(6), 10), 60, { location: '대전' }),
    ev('cal-seed-suyeon-yoga', 'suyeon', '요가 수업', at(2, 15), 60),
    ev('cal-seed-harin-exam', 'harin', '학교 시험', at(4, 9), 300, { visibility: 'private' }),
  ];
  for (const e of events) db.calendar.put(e);
}

// ── tools ────────────────────────────────────────────────────────────────────
const knownIds = (ctx: ToolContext) => new Set(ctx.users().filter(u => u.id !== 'tachi').map(u => u.id));
const nameOf = (ctx: ToolContext, id: string) => ctx.users().find(u => u.id === id)?.shortName ?? id;

/** What `viewerId` may see of an event: full details for their own / family-visible events, busy time otherwise. */
function project(e: CalendarEvent, viewerId: string, ctx: ToolContext) {
  const mine = e.ownerId === viewerId || e.attendeeIds.includes(viewerId);
  const base = { id: e.id, startsAt: e.startsAt, endsAt: e.endsAt, when: whenLabel(new Date(e.startsAt)), who: [e.ownerId, ...e.attendeeIds].map(id => nameOf(ctx, id)) };
  if (e.visibility === 'private' && !mine) return { ...base, title: '바쁨 (비공개 일정)', private: true };
  return { ...base, title: e.title, ...(e.location ? { location: e.location } : {}), ...(e.note && mine ? { note: e.note } : {}) };
}

/** Hour-aligned free windows (10:00–20:00) shared by everyone in `ids`. */
function freeSlots(events: CalendarEvent[], ids: string[], from: Date, to: Date, minutes: number, now: Date, limit = 5) {
  const out: { startsAt: string; when: string }[] = [];
  const d = new Date(Math.max(from.getTime(), now.getTime()));
  d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  while (d.getTime() < to.getTime() && out.length < limit) {
    const end = new Date(d.getTime() + minutes * 60000);
    const okHours = d.getHours() >= 10 && end.getHours() + end.getMinutes() / 60 <= 20 && end.getDate() === d.getDate();
    if (okHours && !events.some(e => involves(e, ids) && overlaps(e, d, end))) out.push({ startsAt: d.toISOString(), when: whenLabel(d) });
    d.setHours(d.getHours() + (okHours ? 2 : 1));
  }
  return out;
}

export const calendarList: Tool<{ userIds?: string[]; range?: string; from?: string; to?: string; freeSlotMinutes?: number }> = {
  name: 'calendar_list',
  label: '캘린더',
  description: '가족 구성원의 일정과 빈 시간을 조회합니다. List calendar events (and optionally common free slots) for family members. '
    + 'userIds: mom, jieun, minjun, suyeon, harin (default: mom). range: Korean phrase like "내일", "이번 주", "다음 주 토요일", "주말" (or give from/to as ISO). '
    + "Other people's private events appear only as busy time.",
  audiences: ['senior', 'family'],
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      userIds: { type: 'array', items: { type: 'string', maxLength: 20 }, maxItems: 8, description: 'whose calendars (user ids)' },
      range: { type: 'string', maxLength: 30, description: '오늘 / 내일 / 이번 주 / 다음 주 / 주말 / 금요일 …' },
      from: { type: 'string', maxLength: 40, description: 'ISO start (optional, overrides range)' },
      to: { type: 'string', maxLength: 40, description: 'ISO end (optional)' },
      freeSlotMinutes: { type: 'integer', minimum: 30, maximum: 480, description: 'also return common free slots of this length' },
    },
  },
  async execute(args, ctx) {
    const now = ctx.now();
    const ids = args.userIds?.length ? args.userIds : [ctx.seniorId];
    const known = knownIds(ctx);
    const bad = ids.filter(i => !known.has(i));
    if (bad.length) throw new ToolError('not_found', `unknown user ids: ${bad.join(', ')}`);
    let { from, to, label } = parseRange(args.range ?? '', now);
    if (args.from) { const f = parseWhen(args.from, now); if (!f) throw new ToolError('invalid', 'from: unrecognised time'); from = f; label = whenLabel(f); }
    if (args.to) { const t = parseWhen(args.to, now); if (!t) throw new ToolError('invalid', 'to: unrecognised time'); to = t; }
    if (to.getTime() <= from.getTime()) throw new ToolError('invalid', 'empty range');
    if (to.getTime() - from.getTime() > 31 * 86400000) throw new ToolError('invalid', 'range too long (max 31 days)');
    const events = await ctx.calendar.list({ userIds: ids, from, to });
    const viewer = ctx.callerId;
    const data = {
      range: { from: from.toISOString(), to: to.toISOString(), label }, users: ids.map(i => ({ id: i, name: nameOf(ctx, i) })),
      events: events.map(e => project(e, viewer, ctx)),
      ...(args.freeSlotMinutes ? { freeSlots: freeSlots(events, ids, from, to, args.freeSlotMinutes, now) } : {}),
    };
    return { data, summary: `${label} ${ids.map(i => nameOf(ctx, i)).join('·')} 일정 ${events.length}건` };
  },
};

export const calendarInvite: Tool<{ title: string; startsAt: string; durationMinutes: number; attendeeIds: string[]; location?: string; note?: string; allowConflicts?: boolean }> = {
  name: 'calendar_invite',
  label: '캘린더 초대',
  description: '일정을 만들고 가족에게 캘린더 초대를 보냅니다. Create an event and send calendar invites to family members. '
    + 'startsAt: ISO local time ("2026-11-15T12:00") or Korean ("다음 주 일요일 12시"). Refuses past times; reports conflicts unless allowConflicts=true.',
  audiences: ['senior', 'family'],
  mutates: true,
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['title', 'startsAt', 'attendeeIds'],
    properties: {
      title: { type: 'string', minLength: 2, maxLength: 60 },
      startsAt: { type: 'string', minLength: 2, maxLength: 40 },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 720, default: 120 },
      attendeeIds: { type: 'array', items: { type: 'string', maxLength: 20 }, minItems: 1, maxItems: 8 },
      location: { type: 'string', maxLength: 60 },
      note: { type: 'string', maxLength: 200 },
      allowConflicts: { type: 'boolean', default: false },
    },
  },
  async execute(args, ctx) {
    const now = ctx.now();
    const start = parseWhen(args.startsAt, now);
    if (!start) throw new ToolError('invalid', 'startsAt: unrecognised time');
    if (start.getTime() < now.getTime()) throw new ToolError('invalid', 'startsAt is in the past');
    if (start.getTime() - now.getTime() > 366 * 86400000) throw new ToolError('invalid', 'startsAt is too far ahead');
    const known = knownIds(ctx);
    const attendees = [...new Set(args.attendeeIds)].filter(i => i !== ctx.callerId);
    const bad = attendees.filter(i => !known.has(i));
    if (bad.length) throw new ToolError('not_found', `unknown attendee ids: ${bad.join(', ')}`);
    const end = new Date(start.getTime() + args.durationMinutes * 60000);
    const everyone = [ctx.callerId, ...attendees];
    const clashes = await ctx.calendar.list({ userIds: everyone, from: start, to: end });
    if (clashes.length && !args.allowConflicts) {
      return {
        data: { created: false, reason: 'conflict', conflicts: clashes.map(e => project(e, ctx.callerId, ctx)) },
        summary: `${whenLabel(start)} 일정 충돌 ${clashes.length}건 — 초대하지 않음`,
      };
    }
    const event = await ctx.calendar.create({
      title: args.title, startsAt: start.toISOString(), endsAt: end.toISOString(), ownerId: known.has(ctx.callerId) ? ctx.callerId : ctx.seniorId,
      attendeeIds: attendees, ...(args.location ? { location: args.location } : {}), ...(args.note ? { note: args.note } : {}),
      visibility: 'family', source: 'tachi', createdBy: ctx.callerId,
    });
    ctx.notify?.({ kind: 'calendar_invite', event });
    return {
      data: { created: true, event: project(event, ctx.callerId, ctx), invited: attendees.map(i => nameOf(ctx, i)) },
      summary: `'${event.title}' ${whenLabel(start)} 초대 → ${attendees.map(i => nameOf(ctx, i)).join('·')}`,
    };
  },
};
