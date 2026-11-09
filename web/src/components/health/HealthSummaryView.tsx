import type { HealthSummary } from '../../../../shared/types';
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

export function HealthSummaryView({ summary, variant }: { summary: HealthSummary; variant: 'senior' | 'family' }) {
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
    <div className={`hs hs-${variant}`}>
      <section className="hs-block">
        <div className="hs-head"><h4>혈압</h4>{last && <span className="hs-big">{last.systolic}/{last.diastolic}<small> mmHg · {md(last.date)}</small></span>}</div>
        {bp.length > 0 ? (
          <>
            <Spark series={[{ name: 'sys', values: bp.map(b => b.systolic) }, { name: 'dia', values: bp.map(b => b.diastolic), dashed: true }]}
              labels={bp.map(b => `${md(b.date)} ${b.systolic}/${b.diastolic}`)} />
            <div className="hs-axis"><span>{md(bp[0].date)}</span><span>{md(bp[bp.length - 1].date)}</span></div>
            <div className="hs-key"><i className="hs-k1" />수축기<i className="hs-k2" />이완기</div>
          </>
        ) : <p className="faint caption">기록이 아직 없어요</p>}
      </section>

      <section className="hs-block">
        <div className="hs-head"><h4>복약 (최근 7일)</h4><span className="hs-sub">{taken}/{recorded}회 복용{missed > 0 ? ` · 거름 ${missed}회` : ''}</span></div>
        {names.map(name => (
          <div className="hs-med" key={name}>
            <span className="hs-med-name">{name}</span>
            <span className="hs-dots" role="list" aria-label={`${name} 복용 기록`}>
              {dates.map(d => {
                const items = summary.medications.filter(m => m.name === name && m.date === d);
                const state = items.length === 0 ? 'none' : items.every(m => m.taken) ? 'on' : 'miss';
                const t = new Date(d); const label = isNaN(+t) ? d : `${t.getMonth() + 1}월 ${t.getDate()}일`;
                const when = items.map(m => m.time).join('·');
                const word = state === 'on' ? '복용' : state === 'miss' ? '거름' : '기록 없음';
                return <i key={d} role="listitem" className={`hs-dot hs-dot-${state}`} aria-label={`${label}${when ? ' ' + when : ''} ${name}: ${word}`} title={`${md(d)} ${word}`}>{state === 'miss' ? <svg viewBox="0 0 12 12" aria-hidden><path d="M3 3l6 6M9 3l-6 6" /></svg> : null}</i>;
              })}
            </span>
          </div>
        ))}
        {names.length > 0 && <div className="hs-key hs-key-med" aria-hidden><span className="hs-dot hs-dot-on" />복용<span className="hs-dot hs-dot-miss"><svg viewBox="0 0 12 12"><path d="M3 3l6 6M9 3l-6 6" /></svg></span>거름<span className="hs-dot hs-dot-none" />기록 없음</div>}
        {names.length === 0 && <p className="faint caption">기록이 아직 없어요</p>}
      </section>

      <section className="hs-grid">
        <div className="hs-block">
          <div className="hs-head"><h4>수면</h4><span className="hs-big">{sleepAvg ? sleepAvg.toFixed(1) : '-'}<small>시간 평균</small></span></div>
          <div className="hs-bars" aria-hidden>{summary.sleepHours.map(s => <i key={s.date} style={{ height: `${(s.hours / maxSleep) * 100}%` }} />)}</div>
        </div>
        <div className="hs-block">
          <div className="hs-head"><h4>걸음 수</h4><span className="hs-big">{lastSteps ? lastSteps.count.toLocaleString('ko-KR') : '-'}<small>보 오늘</small></span></div>
          <div className="hs-bars" aria-hidden>{summary.steps.map(s => <i key={s.date} style={{ height: `${(s.count / maxSteps) * 100}%` }} />)}</div>
        </div>
      </section>

      {summary.notes.length > 0 && (
        <ul className="hs-notes">{summary.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
    </div>
  );
}
