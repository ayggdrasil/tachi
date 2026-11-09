import { useState } from 'react';
import { Accessibility, MapPin } from 'lucide-react';
import type { ItineraryPayload, TripSuggestionPayload } from '../../../../shared/types';
import type { CardProps } from './types';
import './cards.css';

export function TripSuggestionCard({ message }: CardProps) {
  const p = message.payload as TripSuggestionPayload;
  return (
    <article className="cd" aria-label={p.title}>
      <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3><span className="badge">{p.durationLabel}</span></div>
      <p className="cd-warm">{p.reason}</p>
      <ul className="cd-list">
        {p.highlights.map(h => <li key={h}><MapPin size={14} />{h}</li>)}
      </ul>
    </article>
  );
}

export function ItineraryCard({ message }: CardProps) {
  const p = message.payload as ItineraryPayload;
  const [day, setDay] = useState(0);
  const d = p.days[Math.min(day, p.days.length - 1)];
  return (
    <article className="cd" aria-label={p.title}>
      <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3>{p.dateLabel && <span className="badge">{p.dateLabel}</span>}</div>
      {p.days.length > 1 && (
        <div className="cd-tabs" role="tablist">
          {p.days.map((x, i) => <button key={i} type="button" role="tab" aria-selected={i === day} className="cd-tab" onClick={() => setDay(i)}>{x.label}</button>)}
        </div>
      )}
      {p.days.length === 1 && <p className="cd-label">{p.days[0].label}</p>}
      {d && (
        <ol className="cd-tl">
          {d.stops.map((s, i) => (
            <li key={i}>
              <i className="cd-tl-dot" aria-hidden />
              <div className="cd-tl-body">
                <div><span className="cd-time">{s.time}</span> <b className="cd-stop">{s.title}</b></div>
                <p className="cd-desc">{s.description}</p>
                {s.travel && <p className="cd-travel">{s.travel}</p>}
                {s.note && <p className="cd-note"><Accessibility size={13} />{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {p.tips.length > 0 && (
        <ul className="cd-tips">{p.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
      )}
    </article>
  );
}
