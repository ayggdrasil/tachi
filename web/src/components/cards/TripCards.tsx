import { useState } from 'react';
import { Accessibility, MapPin } from 'lucide-react';
import { SpeakButton } from '../common/SpeakButton';
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

export function ItineraryCard({ message, variant }: CardProps) {
  const p = message.payload as ItineraryPayload;
  const [day, setDay] = useState(0);
  const [all, setAll] = useState(false);
  const [tips, setTips] = useState(false);
  const di = Math.min(day, p.days.length - 1);
  const d = p.days[di];
  const stops = d ? (all ? d.stops : d.stops.slice(0, 3)) : [];
  const hidden = d ? d.stops.length - 3 : 0;
  const senior = variant === 'senior';
  const readText = d ? `${p.title}. ${d.label}. ` + d.stops.map(s => `${s.time}, ${s.title}. ${s.description}`).join(' ') : p.title;
  return (
    <article className="cd cd-trip" aria-label={p.title}>
      <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3>{senior && <SpeakButton text={readText} />}</div>
      <p className="cd-meta">{[p.destination, p.days.length > 1 ? `${p.days.length}일 일정` : '당일 일정', p.dateLabel].filter(Boolean).join(' · ')}</p>
      {p.days.length > 1 && (
        <div className="cd-tabs" role="tablist">
          {p.days.map((x, i) => <button key={i} type="button" role="tab" aria-selected={i === di} className="cd-tab" onClick={() => { setDay(i); setAll(false); }}>{x.label}</button>)}
        </div>
      )}
      {p.days.length === 1 && <p className="cd-label">{p.days[0].label}</p>}
      {d && (
        <ol className="cd-tl">
          {stops.map((s, i) => (
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
      {hidden > 0 && <button type="button" className="cd-link cd-more" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? '일정 접기' : `전체 일정 보기 (+${hidden})`}</button>}
      {p.tips.length > 0 && (
        <>
          <button type="button" className="cd-link cd-more" aria-expanded={tips} onClick={() => setTips(t => !t)}>{tips ? '팁 접기' : '여행 팁 보기'}</button>
          {tips && <ul className="cd-tips">{p.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </>
      )}
    </article>
  );
}
