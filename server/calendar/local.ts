// Local calendar provider: events live in SQLite (db.calendarEvents). Swap for a Google Calendar provider via server/calendar/index.ts.
import { nanoid } from 'nanoid';
import type { CalendarEvent, ID } from '../../shared/types';
import type { CalendarEventInput, CalendarProvider } from './contract';

/** The subset of the document table the provider needs (keeps it testable without the whole Db). */
export interface CalendarDoc {
  get(id: string): CalendarEvent | undefined;
  all(): CalendarEvent[];
  put(e: CalendarEvent): CalendarEvent;
}

export function createLocalCalendar(store: () => CalendarDoc, clock: () => Date = () => new Date()): CalendarProvider {
  const iso = () => clock().toISOString();
  const provider: CalendarProvider = {
    id: 'local',
    async create(input: CalendarEventInput) {
      const t = iso();
      const id = input.id ?? `cal-${nanoid(16)}`; // unguessable: the .ics URL uses it as a capability
      const e: CalendarEvent = {
        id, uid: `${id}@tachi.local`, artifactId: input.artifactId, title: input.title, description: input.description ?? '',
        location: input.location, startsAt: input.startsAt, endsAt: input.endsAt, organizerId: input.organizerId,
        attendeeIds: [...new Set(input.attendeeIds)], sequence: 0, status: 'confirmed', provider: 'local', createdAt: t, updatedAt: t,
        ...(input.visibility ? { visibility: input.visibility } : {}), ...(input.note ? { note: input.note } : {}),
        ...(input.source ? { source: input.source } : {}), ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      };
      return store().put(e);
    },
    async update(id: ID, patch) {
      const cur = store().get(id);
      if (!cur) return undefined;
      const next: CalendarEvent = { ...cur };
      let major = false;
      let minor = false;
      for (const k of ['title', 'description', 'location', 'startsAt', 'endsAt'] as const) {
        const v = patch[k];
        if (typeof v === 'string' && v !== cur[k]) { next[k] = v; if (k === 'description') minor = true; else major = true; }
      }
      if (patch.attendeeIds) {
        const ids = [...new Set(patch.attendeeIds)];
        if (ids.join() !== cur.attendeeIds.join()) { next.attendeeIds = ids; major = true; }
      }
      if (patch.status && patch.status !== cur.status) { next.status = patch.status; major = true; }
      if (!major && !minor) return cur;
      if (major) next.sequence = cur.sequence + 1;
      next.updatedAt = iso();
      return store().put(next);
    },
    async get(id: ID) { return store().get(id); },
    async list(opts = {}) {
      return store().all()
        .filter(e => (!opts.from || e.endsAt > opts.from) && (!opts.to || e.startsAt < opts.to))
        .filter(e => opts.includeCancelled !== false || e.status !== 'cancelled')
        .filter(e => !opts.attendeeId || e.attendeeIds.includes(opts.attendeeId) || e.organizerId === opts.attendeeId)
        .filter(e => !opts.attendeeIds?.length || [e.organizerId, ...e.attendeeIds].some(id => opts.attendeeIds!.includes(id)))
        .filter(e => !opts.artifactId || e.artifactId === opts.artifactId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    async cancel(id: ID) { return provider.update(id, { status: 'cancelled' }); },
  };
  return provider;
}
