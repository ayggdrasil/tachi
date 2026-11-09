import { AlertCircle, Bell, CalendarPlus, Check, Circle, ExternalLink, Loader } from 'lucide-react';
import type { TaskCardPayload, TaskStatus } from '../../../../shared/types';
import { TASK_STATUS_LABEL, dateLabel, koreanTime } from '../../../../shared/constants';
import { useTachi } from '../../lib/store';
import { Avatar } from '../common/Avatar';
import type { CardProps } from './types';
import './cards.css';

const STATUS_ICON: Record<TaskStatus, typeof Check> = { todo: Circle, in_progress: Loader, done: Check, blocked: AlertCircle };

/** Monochrome status chip: meaning by fill / outline / icon shape, never by hue. */
export function TaskStatusChip({ status = 'todo', compact }: { status?: TaskStatus; compact?: boolean }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={`badge cd-st cd-st-${status}`}>
      <Icon size={12} strokeWidth={status === 'done' ? 2.25 : 1.75} aria-hidden />
      {compact ? <span className="sr-only">{TASK_STATUS_LABEL[status]}</span> : TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function dueLabel(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dateLabel(d)} ${koreanTime(d)}`;
}

const STAGE_KICKER: Record<TaskCardPayload['stage'], string> = {
  invite: '캘린더 초대', booking: '예약 링크', reminder: '할 일 알림', nudge: '다시 한 번 알림', escalate: '아직 남은 할 일', done: '할 일 완료',
};

export function TaskCard({ message, variant }: CardProps) {
  const p = message.payload as TaskCardPayload;
  const users = useTachi(s => s.users);
  const senior = variant === 'senior';
  const assignee = p.assigneeId ? users[p.assigneeId] : undefined;

  if (p.stage === 'done') {
    return (
      <article className="cd cd-compact cd-task-done" aria-label={STAGE_KICKER.done}>
        <p className="cd-row"><Check size={16} strokeWidth={2} aria-hidden /><span>{message.text}</span></p>
      </article>
    );
  }

  if (p.stage === 'invite' && p.event) {
    const ev = p.event;
    return (
      <article className="cd cd-invite" aria-label={`${STAGE_KICKER.invite}: ${ev.title}`}>
        <p className="cd-cap-top cd-kicker"><CalendarPlus size={14} strokeWidth={1.5} aria-hidden />{STAGE_KICKER.invite}</p>
        <h3 className="cd-title">{ev.title}</h3>
        <p className="cd-bigdate">{ev.label}</p>
        {ev.location && <p className="cd-meta">{ev.location}</p>}
        {!senior && ev.attendeeIds.length > 0 && (
          <div className="cd-avs" aria-label={`초대한 가족 ${ev.attendeeIds.length}명`}>
            {ev.attendeeIds.map(id => <Avatar key={id} user={users[id]} size={24} />)}
          </div>
        )}
        {p.icsUrl && (
          <a className={`btn ${senior ? '' : 'btn-primary'} cd-ics`} href={p.icsUrl} download>
            <CalendarPlus size={16} strokeWidth={1.5} aria-hidden />캘린더에 추가 (.ics)
          </a>
        )}
      </article>
    );
  }

  const Kicker = p.stage === 'escalate' ? AlertCircle : p.stage === 'booking' ? ExternalLink : Bell;
  return (
    <article className="cd cd-taskcard" aria-label={`${STAGE_KICKER[p.stage]}: ${p.taskText ?? p.title}`}>
      <p className="cd-cap-top cd-kicker"><Kicker size={14} strokeWidth={1.5} aria-hidden />{STAGE_KICKER[p.stage]} · {p.title}</p>
      {p.taskText && <h3 className="cd-title">{p.taskText}</h3>}
      {p.stage !== 'booking' && message.text && <p className="cd-warm">{message.text}</p>}
      <div className="cd-row">
        {p.status && <TaskStatusChip status={p.status} />}
        {assignee && <span className="cd-who"><Avatar user={assignee} size={20} decorative /><span className="cd-meta">{assignee.shortName} 담당</span></span>}
        {p.dueAt && <span className="cd-meta">· {dueLabel(p.dueAt)}까지</span>}
      </div>
      {p.links && p.links.length > 0 && (
        <ul className="cd-links" aria-label="예약 링크">
          {p.links.map(l => (
            <li key={l.url}>
              <a className="cd-booklink" href={l.url} target="_blank" rel="noopener noreferrer">
                <span>{l.label}</span><ExternalLink size={14} strokeWidth={1.5} aria-hidden /><span className="sr-only">(새 창)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
