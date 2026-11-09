import { useRef, useState } from 'react';
import { Accessibility, CalendarDays, ChevronDown, MapPin } from 'lucide-react';
import { useTachi } from '../../lib/store';
import { SpeakButton } from '../common/SpeakButton';
import { useT } from '../../lib/i18n';
import type { ItineraryPayload, TripSuggestionPayload } from '../../../../shared/types';
import type { CardProps } from './types';
import './cards.css';

export function TripSuggestionCard({ message, variant, actionSlot }: CardProps) {
  const p = message.payload as TripSuggestionPayload;
  return (
    <article className="cd" aria-label={message.text || p.title}>
      <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3>
        <span className="cd-row">
          {!p.title.includes(p.durationLabel) && <span className="badge">{p.durationLabel}</span>}
          {variant === 'senior' && <SpeakButton text={`${p.title}. ${p.reason}`} />}
        </span></div>
      <p className="cd-warm">{p.reason}</p>
      <ul className="cd-list">
        {p.highlights.map(h => <li key={h}><MapPin size={14} />{h}</li>)}
      </ul>
      {actionSlot}
    </article>
  );
}

/** '서울역 출발' + '신경주역 도착, 점심' → one-line route; null when the day does not open with a departure and an arrival. */
function routeSummary(stops: ItineraryPayload['days'][number]['stops']) {
  const [a, b] = stops;
  const DEP = /(출발|\bdepart\w*|\bleave\w*)/i, ARR = /(도착|\barriv\w*)/i;
  if (!a || !b || !DEP.test(a.title) || !ARR.test(b.title)) return null;
  const from = a.title.replace(/\s*(출발|depart\w*|leave\w*).*$/i, '').trim();
  const to = b.title.replace(/\s*(도착|arriv\w*).*$/i, '').trim();
  if (!from || !to) return null;
  const mode = (a.travel ?? '').match(/KTX|SRT|버스|기차|택시|자가용|\b(?:train|bus|taxi|car|drive|flight)\b/i)?.[0];
  return { from, to, depart: a.time, arrive: b.time, mode };
}

/** Family-room share: a travel-story card (memory it grew from + highlights + date). The day plan unfolds on demand. */
export function ItineraryCard(props: CardProps) {
  const p = props.message.payload as ItineraryPayload;
  return p.story ? <TripStoryCard {...props} /> : <ItineraryPlan {...props} />;
}

function TripStoryCard({ message, variant, actionSlot }: CardProps) {
  const t = useT();
  const p = message.payload as ItineraryPayload;
  const story = p.story!;
  const mem = useTachi(s => (story.memoryId ? s.memories.find(m => m.id === story.memoryId && m.status === 'saved') : undefined));
  const [open, setOpen] = useState(false);
  const when = [p.dateLabel, p.days.length > 1 ? t('trip.nDays', { n: p.days.length }) : t('trip.dayTrip')].filter(Boolean).join(' · ');
  const memYear = mem?.year ? String(mem.year) : mem?.era ?? '';
  const planId = `trip-plan-${message.id}`;
  return (
    <article className="cd cd-trip cd-story-trip" aria-label={p.title}>
      {mem?.photoUrl && (
        <figure className="cd-ts-hero">
          <img className="cd-photo-in" src={mem.photoUrl} alt="" loading="lazy" decoding="async" />
          <figcaption className="cd-ts-cap">{t('trip.memoryEyebrow')}{memYear ? ` · ${memYear}` : ''}</figcaption>
        </figure>
      )}
      <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3>{variant === 'senior' && <SpeakButton text={`${p.title}. ${story.reason}`} />}</div>
      {mem && !mem.photoUrl && <p className="cd-meta">{t('trip.memoryEyebrow')}{memYear ? ` · ${memYear}` : ''}</p>}
      {mem && <p className="cd-ts-mem"><b>{mem.title}</b></p>}
      {story.reason && <p className="cd-warm">{story.reason}</p>}
      {story.highlights.length > 0 && (
        <section aria-label={t('trip.highlights')}>
          <p className="cd-label">{t('trip.highlights')}</p>
          <ul className="cd-ts-hl">{story.highlights.map(h => <li key={h}><MapPin size={14} aria-hidden />{h}</li>)}</ul>
        </section>
      )}
      <p className="cd-ts-when"><CalendarDays size={15} aria-hidden /><span>{[when, p.destination].filter(Boolean).join(' · ')}</span></p>
      <button type="button" className="cd-link cd-more cd-ts-toggle" aria-expanded={open} aria-controls={planId} onClick={() => setOpen(v => !v)}>
        {open ? t('trip.hidePlan') : t('trip.viewPlan')}<ChevronDown size={15} aria-hidden className={open ? 'cd-ts-flip' : undefined} />
      </button>
      {open && <div id={planId} className="cd-ts-plan"><ItineraryPlan message={message} variant={variant} embedded /></div>}
      {actionSlot}
    </article>
  );
}

function ItineraryPlan({ message, variant, actionSlot, embedded }: CardProps & { embedded?: boolean }) {
  const t = useT();
  const p = message.payload as ItineraryPayload;
  const [day, setDay] = useState(0);
  const [all, setAll] = useState(false);
  const [tips, setTips] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const di = Math.min(day, p.days.length - 1);
  const d = p.days[di];
  const route = d ? routeSummary(d.stops) : null;
  // Preview: one-line route + the first stop after it (the memory-linked place); everything else is behind the toggle.
  const previewCount = route ? 3 : 2;
  const stops = d ? (all ? d.stops : d.stops.slice(route ? 2 : 0, previewCount)) : [];
  const hidden = d ? d.stops.length - previewCount : 0;
  const senior = variant === 'senior';
  const readText = d ? `${p.title}. ${d.label}. ` + d.stops.map(s => `${s.time}, ${s.title}. ${s.description}`).join(' ') : p.title;
  return (
    <article className={`cd cd-trip cd-compact${embedded ? ' cd-embedded' : ''}`} aria-label={p.title}>
      {!embedded && <div className="cd-row cd-between"><h3 className="cd-title">{p.title}</h3>{senior && <SpeakButton text={readText} />}</div>}
      {!embedded && <p className="cd-meta">{[p.destination, p.days.length > 1 ? t('trip.nDays', { n: p.days.length }) : t('trip.dayTrip'), p.dateLabel].filter(Boolean).join(' · ')}</p>}
      {p.days.length > 1 && (
        <div className="cd-tabs" role="tablist" aria-label={t('trip.dayTabs')}>
          {p.days.map((x, i) => (
            <button key={i} ref={el => { tabRefs.current[i] = el; }} type="button" role="tab" id={`it-${message.id}-${i}`} aria-controls={`itp-${message.id}`}
              aria-selected={i === di} tabIndex={i === di ? 0 : -1} className="cd-tab"
              onClick={() => { setDay(i); setAll(false); }}
              onKeyDown={e => {
                if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
                e.preventDefault();
                const n = e.key === 'Home' ? 0 : e.key === 'End' ? p.days.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + p.days.length) % p.days.length;
                setDay(n); setAll(false); tabRefs.current[n]?.focus();
              }}>{x.label}</button>
          ))}
        </div>
      )}
      {p.days.length === 1 && <p className="cd-label">{p.days[0].label}</p>}
      {d && route && !all && <p className="cd-route"><b>{route.from}</b> {route.depart}<span aria-hidden> → </span><span className="sr-only"> {t('trip.to')} </span><b>{route.to}</b> {route.arrive}{route.mode ? ` · ${route.mode}` : ''}</p>}
      {d && (
        <div role={p.days.length > 1 ? 'tabpanel' : undefined} id={p.days.length > 1 ? `itp-${message.id}` : undefined} aria-labelledby={p.days.length > 1 ? `it-${message.id}-${di}` : undefined}>
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
        </div>
      )}
      {actionSlot}
      {hidden > 0 && <button type="button" className="cd-link cd-more" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? t('trip.collapse') : t('trip.showAll', { n: hidden })}</button>}
      {p.tips.length > 0 && (
        <>
          <button type="button" className="cd-link cd-more" aria-expanded={tips} onClick={() => setTips(v => !v)}>{tips ? t('trip.hideTips') : t('trip.showTips')}</button>
          {tips && <ul className="cd-tips">{p.tips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>}
        </>
      )}
    </article>
  );
}
