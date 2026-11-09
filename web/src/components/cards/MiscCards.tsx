import { Lock } from 'lucide-react';
import type { HealthCardPayload, ReportPayload } from '../../../../shared/types';
import { HealthSummaryView } from '../health/HealthSummaryView';
import type { CardProps } from './types';
import './cards.css';

export function HealthCard({ message, variant }: CardProps) {
  const p = message.payload as HealthCardPayload;
  return <article className="cd" aria-label="건강 요약"><h3 className="cd-title">최근 7일 건강 기록</h3><HealthSummaryView summary={p.summary} variant={variant} compact /></article>;
}

export function ReportCard({ message }: CardProps) {
  const p = message.payload as ReportPayload;
  const created = new Date(message.createdAt), now = new Date();
  const today = created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate();
  const title = `${today ? '오늘' : '어제'}의 타치 리포트`;
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
                ? <span className="cd-private"><Lock size={12} />비공개 대화예요</span>
                : <span className="cd-sess-sum">{s.summary}</span>}
            </span>
          </li>
        ))}
      </ul>
      {p.moodLabel && <p className="cd-row"><span className="cd-label">오늘 기분</span><span className="badge">{p.moodLabel}</span></p>}
      {p.highlight && <p className="cd-warm">{p.highlight}</p>}
    </article>
  );
}

export function SystemLine({ message }: CardProps) {
  return <p className="cd-system">{message.text}</p>;
}
