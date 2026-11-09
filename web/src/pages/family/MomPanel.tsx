import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Lock } from 'lucide-react';
import type { Memory, ReportPayload } from '../../../../shared/types';
import { FAMILY_ROOM_ID } from '../../../../shared/constants';
import { useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { MemoryTile } from '../../components/memory/MemoryTile';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { HealthSummaryView } from '../../components/health/HealthSummaryView';
import { Dialog } from './Dialog';
import './MomPanel.css';

type Tab = 'memory' | 'health' | 'report';
const TABS: { id: Tab; key: string }[] = [
  { id: 'memory', key: 'mp.memory' }, { id: 'health', key: 'mp.health' }, { id: 'report', key: 'mp.report' },
];

export function MomPanel() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('memory');
  const tabsRef = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex(t => t.id === tab);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(TABS[n].id);
    tabsRef.current?.querySelector<HTMLElement>(`#mp-tab-${TABS[n].id}`)?.focus();
  };
  return (
    <div className="mp">
      <div className="mp-tabs" role="tablist" aria-label={t('fam.momNews')} ref={tabsRef} onKeyDown={onKey}>
        {TABS.map(tb => (
          <button key={tb.id} role="tab" id={`mp-tab-${tb.id}`} aria-selected={tab === tb.id} tabIndex={tab === tb.id ? 0 : -1} aria-controls={`mp-pane-${tb.id}`}
            className={`mp-tab ${tab === tb.id ? 'is-on' : ''}`} onClick={() => setTab(tb.id)}>{t(tb.key)}</button>
        ))}
      </div>
      <div className="mp-pane" role="tabpanel" id={`mp-pane-${tab}`} aria-labelledby={`mp-tab-${tab}`}>
        {tab === 'memory' && <MemoryTab />}
        {tab === 'health' && <HealthTab />}
        {tab === 'report' && <ReportTab />}
      </div>
    </div>
  );
}

function MemoryTab() {
  const t = useT();
  const memories = useTachi(s => s.memories);
  const graph = useTachi(s => s.graph);
  const fresh = useTachi(s => s.freshGraphIds);
  const [open, setOpen] = useState<Memory | null>(null);
  const shared = useMemo(
    () => memories.filter(m => m.visibility === 'family' && m.status === 'saved').sort((a, b) => (b.sharedAt ?? b.createdAt).localeCompare(a.sharedAt ?? a.createdAt)),
    [memories],
  );
  const nodes = useMemo(() => Object.values(graph.nodes), [graph.nodes]);
  const edges = useMemo(() => Object.values(graph.edges), [graph.edges]);

  return (
    <>
      {shared.length === 0 ? (
        <p className="caption muted mp-empty">{t('mp.noMemories')}</p>
      ) : (
        <ul className="mp-list">
          {shared.map(m => <li key={m.id}><MemoryTile memory={m} onClick={() => setOpen(m)} /></li>)}
        </ul>
      )}
      {nodes.length > 0 && (
        <section className="mp-graph" aria-label={t('mp.graph')}>
          <h3 className="mp-h">{t('mp.graph')} <span className="faint">· {t('mp.links', { n: edges.length })}</span></h3>
          <div className="mp-graph-box"><MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} height={220} compact /></div>
        </section>
      )}
      {open && <MemoryDetail memory={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function MemoryDetail({ memory: m, onClose }: { memory: Memory; onClose: () => void }) {
  const t = useT();
  const meta = [m.era ?? (m.year ? t('mp.year', { y: m.year }) : undefined), m.season, m.place].filter(Boolean).join(' · ');
  return (
    <Dialog title={m.title} onClose={onClose} width={520}>
      {m.photoUrl && <img className="mp-photo" src={m.photoUrl} alt={m.title} />}
      {meta && <p className="caption muted mp-meta">{meta}</p>}
      <p className="mp-story">{m.story}</p>
      {m.people.length > 0 && (
        <p className="caption mp-people"><span className="muted">{t('mp.with')}</span> {m.people.map(p => (p.relation ? `${p.name}(${p.relation})` : p.name)).join(', ')}</p>
      )}
      {m.emotions.length > 0 && <p className="caption muted">{m.emotions.join(' · ')}</p>}
    </Dialog>
  );
}

function HealthTab() {
  const t = useT();
  const health = useTachi(s => s.health);
  if (!health) {
    return (
      <div className="mp-locked">
        <Lock size={20} strokeWidth={1.5} aria-hidden />
        <p>{t('mp.healthPrivate')}</p>
        <p className="caption faint">{t('mp.healthPrivateHint')}</p>
      </div>
    );
  }
  return <HealthSummaryView summary={health} variant="family" headingLevel={3} />;
}

function ReportTab() {
  const t = useT();
  const msgs = useTachi(s => s.messages[FAMILY_ROOM_ID]);
  const reports = useMemo(
    () => (msgs ?? []).filter(m => m.kind === 'report' && m.payload?.type === 'report').slice(-5).reverse(),
    [msgs],
  );
  if (reports.length === 0) return <p className="caption muted mp-empty">{t('mp.noReports')}</p>;
  return (
    <ul className="mp-reports">
      {reports.map(m => {
        const p = m.payload as ReportPayload;
        return (
          <li key={m.id} className="mp-report">
            <h3 className="mp-report-date">{p.dateLabel}{p.moodLabel && <span className="badge">{t('mp.mood', { mood: p.moodLabel })}</span>}</h3>
            {p.highlight && <p className="caption">{p.highlight}</p>}
            <ul className="mp-sessions">
              {p.sessions.map((s, i) => (
                <li key={i} className="mp-session">
                  <span className="mono muted">{s.time}</span>
                  <span className="mp-session-main">
                    <span className="mp-session-title">{s.title}</span>
                    <span className={`caption ${s.isPrivate ? 'faint' : 'muted'}`}>{s.isPrivate ? t('mp.privateChat') : s.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
