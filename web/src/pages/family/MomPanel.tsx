import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import type { Memory, ReportPayload } from '../../../../shared/types';
import { FAMILY_ROOM_ID } from '../../../../shared/constants';
import { useTachi } from '../../lib/store';
import { MemoryTile } from '../../components/memory/MemoryTile';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { HealthSummaryView } from '../../components/health/HealthSummaryView';
import { Dialog } from './Dialog';
import './MomPanel.css';

type Tab = 'memory' | 'health' | 'report';
const TABS: { id: Tab; label: string }[] = [
  { id: 'memory', label: '추억' }, { id: 'health', label: '건강' }, { id: 'report', label: '리포트' },
];

export function MomPanel() {
  const [tab, setTab] = useState<Tab>('memory');
  return (
    <div className="mp">
      <div className="mp-tabs" role="tablist" aria-label="어머니 소식">
        {TABS.map(t => (
          <button key={t.id} role="tab" id={`mp-tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`mp-pane-${t.id}`}
            className={`mp-tab ${tab === t.id ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
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
        <p className="caption muted mp-empty">아직 공유된 추억이 없어요. 어머님이 가족에게 보내 주시면 여기에 모여요.</p>
      ) : (
        <ul className="mp-list">
          {shared.map(m => <li key={m.id}><MemoryTile memory={m} onClick={() => setOpen(m)} /></li>)}
        </ul>
      )}
      {nodes.length > 0 && (
        <section className="mp-graph" aria-label="기억 그래프">
          <h3 className="mp-h">기억 그래프 <span className="faint">· 노드 {nodes.length} · 관계 {edges.length}</span></h3>
          <div className="mp-graph-box"><MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} height={220} compact /></div>
        </section>
      )}
      {open && <MemoryDetail memory={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function MemoryDetail({ memory: m, onClose }: { memory: Memory; onClose: () => void }) {
  const meta = [m.era ?? (m.year ? `${m.year}년` : undefined), m.season, m.place].filter(Boolean).join(' · ');
  return (
    <Dialog title={m.title} onClose={onClose} width={520}>
      {m.photoUrl && <img className="mp-photo" src={m.photoUrl} alt={m.title} />}
      {meta && <p className="caption muted mp-meta">{meta}</p>}
      <p className="mp-story">{m.story}</p>
      {m.people.length > 0 && (
        <p className="caption mp-people"><span className="muted">함께한 사람</span> {m.people.map(p => (p.relation ? `${p.name}(${p.relation})` : p.name)).join(', ')}</p>
      )}
      {m.emotions.length > 0 && <p className="caption muted">{m.emotions.join(' · ')}</p>}
    </Dialog>
  );
}

function HealthTab() {
  const health = useTachi(s => s.health);
  if (!health) {
    return (
      <div className="mp-locked">
        <Lock size={20} strokeWidth={1.5} aria-hidden />
        <p>어머님이 건강 정보를 비공개로 설정하셨어요</p>
        <p className="caption faint">어머님이 공개하시면 이곳에서 함께 볼 수 있어요.</p>
      </div>
    );
  }
  return <HealthSummaryView summary={health} variant="family" />;
}

function ReportTab() {
  const msgs = useTachi(s => s.messages[FAMILY_ROOM_ID]);
  const reports = useMemo(
    () => (msgs ?? []).filter(m => m.kind === 'report' && m.payload?.type === 'report').slice(-5).reverse(),
    [msgs],
  );
  if (reports.length === 0) return <p className="caption muted mp-empty">아직 받은 리포트가 없어요. 하루가 끝나면 타치가 전해 드려요.</p>;
  return (
    <ul className="mp-reports">
      {reports.map(m => {
        const p = m.payload as ReportPayload;
        return (
          <li key={m.id} className="mp-report">
            <h3 className="mp-report-date">{p.dateLabel}{p.moodLabel && <span className="badge">기분 {p.moodLabel}</span>}</h3>
            {p.highlight && <p className="caption">{p.highlight}</p>}
            <ul className="mp-sessions">
              {p.sessions.map((s, i) => (
                <li key={i} className="mp-session">
                  <span className="mono muted">{s.time}</span>
                  <span className="mp-session-main">
                    <span className="mp-session-title">{s.title}</span>
                    <span className={`caption ${s.isPrivate ? 'faint' : 'muted'}`}>{s.isPrivate ? '비공개 대화예요' : s.summary}</span>
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
