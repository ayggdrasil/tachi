// Calendar provider registry. Only the local store exists today; TACHI_CALENDAR_PROVIDER selects another one once it is added.
import { ctx } from '../orchestrator/ctx';
import { clockNow } from '../util/misc';
import type { CalendarProvider } from './contract';
import { createLocalCalendar } from './local';

let cached: CalendarProvider | undefined;

/** The active calendar provider (local SQLite store backed by ctx.db.calendarEvents, read lazily so a reopened db is used). */
export function calendar(): CalendarProvider {
  if (!cached) {
    const want = process.env.TACHI_CALENDAR_PROVIDER ?? 'local';
    if (want !== 'local') console.warn(`[tachi:warn] calendar provider "${want}" is not available, using the local store`);
    cached = createLocalCalendar(() => ctx.db.calendarEvents, clockNow);
  }
  return cached;
}

export type { CalendarProvider, CalendarEventInput } from './contract';
export { buildIcs } from './ics';
