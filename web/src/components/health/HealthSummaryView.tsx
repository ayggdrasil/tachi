import { dateLabelL } from '../../../../shared/constants';
import type { HealthSummary } from '../../../../shared/types';
import { useLocale, useT } from '../../lib/i18n';
import './HealthSummaryView.css';

function Spark({ series, width = 220, height = 64, labels }: { series: { name: string; values: number[]; dashed?: boolean }[]; width?: number; height?: number; labels?: string[] }) {
  const all = series.flatMap(s => s.values);
  if (all.length === 0) return null;
  const min = Math.min(...all) - 6, max = Math.max(...all) + 6;
  const n = Math.max(...series.map(s => s.values.length));
  const x = (i: number) => 6 + (n <= 1 ? (width - 12) / 2 : (i * (width - 12)) / (n - 1));
  const y = (v: number) => 6 + (1 - (v - min) / (max - min || 1)) * (height - 12);
  return (
    <svg className="hs-spark" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img"
      aria-label={labels ? labels.join(', ') : undefined}>
      {series.map(s => (
        <g key={s.name}>
          <polyline fill="none" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            className={s.dashed ? 'hs-line hs-line-2' : 'hs-line'} vectorEffect="non-scaling-stroke" />
          {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === s.values.length - 1 ? 3 : 1.8} className={s.dashed ? 'hs-pt hs-pt-2' : 'hs-pt'} />)}
        </g>
      ))}
    </svg>
  );
}

const md = (d: string) => { const t = new Date(d); return isNaN(+t) ? d.slice(5) : `${t.getMonth() + 1}/${t.getDate()}`; };
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function HealthSummaryView({ summary, variant, headingLevel = 4, compact }: { summary: HealthSummary; variant: 'senior' | 'family'; headingLevel?: 3 | 4; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const H = headingLevel === 3 ? 'h3' : 'h4';
  const bp = summary.bloodPressure;
  const last = bp[bp.length - 1];
  const dates = Array.from(new Set(summary.medications.map(m => m.date))).sort();
  const names = Array.from(new Set(summary.medications.map(m => m.name)));
  const sleepAvg = avg(summary.sleepHours.map(s => s.hours));
  const lastSteps = summary.steps[summary.steps.length - 1];
  const maxSteps = Math.max(1, ...summary.steps.map(s => s.count));
  const maxSleep = Math.max(1, ...summary.sleepHours.map(s => s.hours));
  // Only recorded doses count: taken = true, missed = an explicit record with taken = false, anything else is "no record".
  const recorded = summary.medications.length;
  const taken = summary.medications.filter(m => m.taken).length;
  const missed = recorded - taken;

  return (
    <div className={`hs hs-${variant}${compact ? ' hs-compact' : ''}`}>
      <section className="hs-block">
        <div className="hs-head"><H className="hs-h">{t('health.bp')}</H>{last && <span className="hs-big">{last.systolic}/{last.diastolic}<small> mmHg · {md(last.date)}</small></span>}</div>
        {bp.length > 0 ? (
          <>
            <Spark series={[{ name: 'sys', values: bp.map(b => b.systolic) }, { name: 'dia', values: bp.map(b => b.diastolic), dashed: true }]}
              labels={bp.map(b => `${md(b.date)} ${b.systolic}/${b.diastolic}`)} />
            <div className="hs-axis"><span>{md(bp[0].date)}</span><span>{md(bp[bp.length - 1].date)}</span></div>
            <div className="hs-key"><i className="hs-k1" />{t('health.systolic')}<i className="hs-k2" />{t('health.diastolic')}</div>
          </>
        ) : <p className="faint caption">{t('health.noRecords')}</p>}
      </section>

      <section className="hs-block">
        <div className="hs-head"><H className="hs-h">{t('health.meds')}</H><span className="hs-sub">{t('health.taken', { taken, total: recorded })}{missed > 0 ? ` · ${t('health.missedN', { n: missed })}` : ''}</span></div>
        {names.map(name => (
          <div className="hs-med" key={name}>
            <span className="hs-med-name">{name}</span>
            <span className="hs-dots" role="list" aria-label={t('health.medLog', { name })}>
              {dates.map(d => {
                const items = summary.medications.filter(m => m.name === name && m.date === d);
                const state = items.length === 0 ? 'none' : items.every(m => m.taken) ? 'on' : 'miss';
                const tt = new Date(d); const label = isNaN(+tt) ? d : dateLabelL(tt, locale);
                const when = items.map(m => m.time).join('·');
                const word = state === 'on' ? t('health.on') : state === 'miss' ? t('health.miss') : t('health.none');
                return <i key={d} role="listitem" className={`hs-dot hs-dot-${state}`} aria-label={`${label}${when ? ' ' + when : ''} ${name}: ${word}`} title={`${md(d)} ${word}`}>{state === 'miss' ? <svg viewBox="0 0 12 12" aria-hidden><path d="M3 3l6 6M9 3l-6 6" /></svg> : null}</i>;
              })}
            </span>
          </div>
        ))}
        {names.length > 0 && <div className="hs-key hs-key-med" aria-hidden><span className="hs-dot hs-dot-on" />{t('health.on')}<span className="hs-dot hs-dot-miss"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" /></svg></span>{t('health.miss')}<span className="hs-dot hs-dot-none" />{t('health.none')}</div>}
        {names.length === 0 && <p className="faint caption">{t('health.noRecords')}</p>}
      </section>

      <section className="hs-grid">
        <div className="hs-block">
          <div className="hs-head"><H className="hs-h">{t('health.sleep')}</H><span className="hs-big">{sleepAvg ? sleepAvg.toFixed(1) : '-'}<small>{t('health.hoursAvg')}</small></span></div>
          <div className="hs-bars" aria-hidden>{summary.sleepHours.map(s => <i key={s.date} style={{ height: `${(s.hours / maxSleep) * 100}%` }} />)}</div>
        </div>
        <div className="hs-block">
          <div className="hs-head"><H className="hs-h">{t('health.steps')}</H><span className="hs-big">{lastSteps ? lastSteps.count.toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-US') : '-'}<small>{t('health.stepsToday')}</small></span></div>
          <div className="hs-bars" aria-hidden>{summary.steps.map(s => <i key={s.date} style={{ height: `${(s.count / maxSteps) * 100}%` }} />)}</div>
        </div>
      </section>

      {summary.notes.length > 0 && (
        <ul className="hs-notes">{summary.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
    </div>
  );
}
