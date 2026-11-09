import { Lock } from 'lucide-react';
import type { HealthCardPayload, ReportPayload } from '../../../../shared/types';
import { useT } from '../../lib/i18n';
import { HealthSummaryView } from '../health/HealthSummaryView';
import type { CardProps } from './types';
import { useTachi } from '../../lib/store';
import { TaskStatusChip } from './TaskCards';
import './cards.css';

export function HealthCard({ message, variant }: CardProps) {
  const t = useT();
  const p = message.payload as HealthCardPayload;
  return <article className="cd" aria-label={t('health.summary')}><h3 className="cd-title">{t('health.last7')}</h3><HealthSummaryView summary={p.summary} variant={variant} compact /></article>;
}

export function ReportCard({ message }: CardProps) {
  const t = useT();
  const p = message.payload as ReportPayload;
  const created = new Date(message.createdAt), now = new Date();
  const today = created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate();
  const title = t(today ? 'report.today' : 'report.yesterday');
  return (
    <article className="cd" aria-label={title}>
      <h3 className="cd-title">{title} · {p.dateLabel}</h3>
      <ul className="cd-sessions">
        {p.sessions.map((s, i) => (
          <li key={i}>
            <span className="mono cd-sess-time">{s.time}</span>
            <span className="cd-sess-body">
              <b>{s.title}</b>
              {s.isPrivate
                ? <span className="cd-private"><Lock size={12} />{t('report.private')}</span>
                : <span className="cd-sess-sum">{s.summary}</span>}
            </span>
          </li>
        ))}
      </ul>
      {p.moodLabel && <p className="cd-row"><span className="cd-label">{t('report.mood')}</span><span className="badge">{p.moodLabel}</span></p>}
      {p.highlight && <p className="cd-warm">{p.highlight}</p>}
      {p.openTasks && p.openTasks.length > 0 && <OpenTasks tasks={p.openTasks} line={p.tasksLine} />}
    </article>
  );
}

export function SystemLine({ message }: CardProps) {
  return <p className="cd-system">{message.text}</p>;
}

function OpenTasks({ tasks, line }: { tasks: NonNullable<ReportPayload['openTasks']>; line?: string }) {
  const tr = useT();
  const users = useTachi(s => s.users);
  return (
    <section className="cd-opentasks" aria-label={tr('task.openTasks')}>
      <p className="cd-cap-top">{line || tr('task.openCount', { n: tasks.length })}</p>
      <ul>
        {tasks.map(t => (
          <li key={t.taskId}>
            <TaskStatusChip status={t.status} compact />
            {/* one text column so a long task wraps beside the chip, with owner / reminders inline after it */}
            <span className="cd-ot-body">
              {t.text}
              {t.assigneeId && users[t.assigneeId] && <span className="cd-meta"> · {users[t.assigneeId].shortName}</span>}
              {t.followUpCount > 0 && <span className="cd-meta"> · {tr('task.reminded', { n: t.followUpCount })}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
