// RFC 5545 iCalendar (.ics) serialization for calendar events — pure, no I/O.
import type { CalendarEvent } from '../../shared/types';

export interface IcsPerson { id: string; name: string }
export interface IcsOptions {
  /** resolves attendee / organizer ids to display names */
  people?: (id: string) => IcsPerson | undefined;
  /** PRODID product name */
  product?: string;
  /** add a VALARM this many minutes before the start (default 1440 = one day; 0 = none) */
  alarmMinutes?: number;
  /** DTSTAMP (defaults to now) */
  stamp?: Date;
  calendarName?: string;
}

/** 20261122T030000Z */
export function icsDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** TEXT value escaping (backslash, semicolon, comma, newline). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold content lines at 75 octets (UTF-8 aware: never splits a multi-byte character). */
export function icsFold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with one space
    if (curLen + n > limit) { out.push(cur); cur = ''; curLen = 0; }
    cur += ch; curLen += n;
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i ? ` ${l}` : l)).join('\r\n');
}

const mailto = (id: string) => `mailto:${id.replace(/[^a-zA-Z0-9._-]/g, '') || 'member'}@family.tachi.local`;
const cn = (s: string) => `"${s.replace(/"/g, "'")}"`;

export function eventLines(e: CalendarEvent, opts: IcsOptions = {}): string[] {
  const who = (id: string) => opts.people?.(id) ?? { id, name: id };
  const org = who(e.organizerId);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${icsDate(opts.stamp ?? new Date())}`,
    `DTSTART:${icsDate(e.startsAt)}`,
    `DTEND:${icsDate(e.endsAt)}`,
    `SUMMARY:${icsEscape(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    `ORGANIZER;CN=${cn(org.name)}:${mailto(org.id)}`,
    ...e.attendeeIds.map(id => { const p = who(id); return `ATTENDEE;CN=${cn(p.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:${mailto(p.id)}`; }),
    `SEQUENCE:${e.sequence}`,
    `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    `CREATED:${icsDate(e.createdAt)}`,
    `LAST-MODIFIED:${icsDate(e.updatedAt)}`,
  ];
  const alarm = opts.alarmMinutes ?? 1440;
  if (alarm > 0 && e.status !== 'cancelled') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.title)}`, `TRIGGER:-PT${Math.round(alarm)}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** A complete VCALENDAR document (CRLF line endings, folded lines). */
export function buildIcs(events: CalendarEvent[], opts: IcsOptions = {}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${opts.product ?? 'Tachi'}//Family Calendar//KO`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(opts.calendarName ? [`X-WR-CALNAME:${icsEscape(opts.calendarName)}`] : []),
    ...events.flatMap(e => eventLines(e, opts)),
    'END:VCALENDAR',
  ];
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
