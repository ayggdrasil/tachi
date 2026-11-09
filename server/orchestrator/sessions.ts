// Session logs (feed the family report).
import type { PrivacyCategory, SessionLog } from '../../shared/types';
import { ctx } from './ctx';
import { now } from './core';
import { sameDay, uid } from '../util/misc';

export function startSession(kind: SessionLog['kind'], title: string, category: PrivacyCategory, summary: string): SessionLog {
  const s: SessionLog = { id: uid('sess'), startedAt: now().toISOString(), kind, title, category, summary, reported: false };
  return ctx.db.sessions.put(s);
}

export function endSession(id: string, summary?: string): SessionLog | undefined {
  const s = ctx.db.sessions.get(id);
  if (!s) return undefined;
  s.endedAt = now().toISOString();
  if (summary) s.summary = summary;
  return ctx.db.sessions.put(s);
}

/** Log a senior-initiated conversation; merges into a recent session with the same title (30 min). */
export function logSeniorSession(category: PrivacyCategory, title: string, summary: string): SessionLog {
  const t = now();
  const recent = ctx.db.sessions.all().reverse().find(s =>
    s.kind === 'senior' && s.title === title && t.getTime() - new Date(s.endedAt ?? s.startedAt).getTime() < 30 * 60000);
  if (recent) {
    recent.endedAt = t.toISOString();
    recent.summary = summary;
    recent.reported = false;
    return ctx.db.sessions.put(recent);
  }
  const s = startSession('senior', title, category, summary);
  return endSession(s.id) ?? s;
}

export function todaysSessions(): SessionLog[] {
  const t = now();
  return ctx.db.sessions.all().filter(s => sameDay(new Date(s.startedAt), t));
}
