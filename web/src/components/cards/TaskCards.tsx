import { AlertCircle, Bell, Check, Circle, ExternalLink, Loader } from 'lucide-react';
import type { TaskCardPayload, TaskStatus } from '../../../../shared/types';
import type { Locale } from '../../../../shared/types';
import { dateLabelL, timeLabelL } from '../../../../shared/constants';
import { useTachi } from '../../lib/store';
import { useLocale, useT } from '../../lib/i18n';
import { Avatar } from '../common/Avatar';
import type { CardProps } from './types';
import './cards.css';

const STATUS_ICON: Record<TaskStatus, typeof Check> = { todo: Circle, in_progress: Loader, done: Check, blocked: AlertCircle };

/** Monochrome status chip: meaning by fill / outline / icon shape, never by hue. */
export function TaskStatusChip({ status = 'todo', compact }: { status?: TaskStatus; compact?: boolean }) {
  const t = useT();
  const Icon = STATUS_ICON[status];
  const label = t(`task.status.${status}`);
  return (
    <span className={`badge cd-st cd-st-${status} ${compact ? 'cd-st-compact' : ''}`} title={compact ? label : undefined}>
      <Icon size={12} strokeWidth={status === 'done' ? 2.25 : 1.75} aria-hidden />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

/** 'Thu, Nov 12 10:00 AM' / '11월 12일(목) 오전 10:00' */
export function dueLabel(iso: string | undefined, locale: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dateLabelL(d, locale)} ${timeLabelL(d, locale)}`;
}

export function TaskCard({ message }: CardProps) {
  const t = useT();
  const locale = useLocale();
  const p = message.payload as TaskCardPayload;
  const users = useTachi(s => s.users);
  // live task state when the artifact is loaded (a card is a snapshot: its status would go stale after a reply)
  const live = useTachi(s => s.artifacts[p.artifactId]?.tasks.find(x => x.id === p.taskId));
  const status = live?.status ?? (live?.done ? 'done' : undefined) ?? p.status;
  const assigneeId = live ? live.assigneeId : p.assigneeId;
  const assignee = assigneeId ? users[assigneeId] : undefined;
  const kicker = t(`task.stage.${p.stage}`);

  if (p.stage === 'done') {
    return (
      <article className="cd cd-compact cd-task-done" aria-label={kicker}>
        <p className="cd-row"><Check size={16} strokeWidth={2} aria-hidden /><span>{message.text}</span></p>
      </article>
    );
  }

  const Kicker = p.stage === 'escalate' ? AlertCircle : p.stage === 'booking' ? ExternalLink : Bell;
  return (
    <article className="cd cd-taskcard" aria-label={`${kicker}: ${p.taskText ?? p.title}`}>
      <p className="cd-cap-top cd-kicker"><Kicker size={14} strokeWidth={1.5} aria-hidden />{kicker} · {p.title}</p>
      {p.taskText && <h3 className="cd-title">{p.taskText}</h3>}
      {p.stage !== 'booking' && message.text && <p className="cd-warm">{message.text}</p>}
      <div className="cd-row">
        {status && <TaskStatusChip status={status} />}
        {assignee && <span className="cd-who"><Avatar user={assignee} size={20} decorative /><span className="cd-meta">{t('task.owner', { name: assignee.shortName })}</span></span>}
        {p.dueAt && <span className="cd-meta">{t('task.due', { due: dueLabel(p.dueAt, locale) })}</span>}
      </div>
      {p.links && p.links.length > 0 && (
        <ul className="cd-links" aria-label={t('task.links')}>
          {p.links.map(l => (
            <li key={l.url}>
              <a className="cd-booklink" href={l.url} target="_blank" rel="noopener noreferrer">
                <span>{l.label}</span><ExternalLink size={14} strokeWidth={1.5} aria-hidden /><span className="sr-only">{t('task.newTab')}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
