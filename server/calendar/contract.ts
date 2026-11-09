// Calendar provider contract. The local SQLite store implements it today; a Google Calendar provider can be plugged in later
// (same calls, provider id on each event) without touching the orchestrator.
import type { CalendarEvent, ID, ISODate } from '../../shared/types';

export interface CalendarEventInput {
  artifactId?: ID;
  title: string;
  description?: string;
  location?: string;
  startsAt: ISODate;
  endsAt: ISODate;
  organizerId: ID;
  attendeeIds: ID[];
}

export interface CalendarProvider {
  /** provider id stored on each event ('local', later e.g. 'google') */
  readonly id: string;
  create(input: CalendarEventInput): Promise<CalendarEvent>;
  /** patch an event; bumps `sequence` when time / place / attendees / status change */
  update(id: ID, patch: Partial<CalendarEventInput> & { status?: CalendarEvent['status'] }): Promise<CalendarEvent | undefined>;
  get(id: ID): Promise<CalendarEvent | undefined>;
  /** events overlapping [from, to) (both optional), optionally only one attendee's / one artifact's */
  list(opts?: { from?: ISODate; to?: ISODate; attendeeId?: ID; artifactId?: ID }): Promise<CalendarEvent[]>;
  cancel(id: ID): Promise<CalendarEvent | undefined>;
}
