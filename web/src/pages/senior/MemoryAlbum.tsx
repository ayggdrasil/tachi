import { useRef, useState } from 'react';
import { Lock, Users, X } from 'lucide-react';
import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import type { GraphEdge, GraphNode, Memory } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { MemoryTile } from '../../components/memory/MemoryTile';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { Segmented } from '../../components/common/Segmented';
import { useModal } from '../../components/common/useModal';

export function MemoryAlbum({ onAskTachi }: { onAskTachi: () => void }) {
  const t = useT();
  const memories = useTachi(s => s.memories);
  const graph = useTachi(s => s.graph);
  const fresh = useTachi(s => s.freshGraphIds);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = memories.find(m => m.id === openId) ?? null;
  const nodes: GraphNode[] = Object.values(graph.nodes);
  const edges: GraphEdge[] = Object.values(graph.edges);
  const list = memories.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="sa-scroll">
      <h1 className="sa-h sa-h1">{t('album.title')}</h1>
      {list.length === 0 ? (
        <p className="muted sa-pad">{t('album.empty')}</p>
      ) : (
        <div className="sa-grid">
          {list.map(m => <MemoryTile key={m.id} memory={m} onClick={() => setOpenId(m.id)} />)}
        </div>
      )}
      <h2 className="sa-h sa-h2">{t('graph.title')}</h2>
      <p className="muted sa-pad-s">{t('album.graphHelp')}</p>
      <div className="sa-graph"><MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} interactive large height={340} /></div>

      {open && (
        <MemorySheet memory={open} onClose={() => setOpenId(null)} onAsk={() => {
          tachi.send(SENIOR_ROOM_ID, open.title); setOpenId(null); onAskTachi();
        }} />
      )}
    </div>
  );
}

function MemorySheet({ memory: m, onClose, onAsk }: { memory: Memory; onClose: () => void; onAsk: () => void }) {
  const t = useT();
  const rows: [string, string][] = [
    [t('mem.when'), m.year ? (m.season ? t('mem.yearSeason', { year: m.year, season: m.season }) : t('mem.year', { year: m.year })) : (m.era ?? '')],
    [t('mem.place'), m.place ?? ''],
    [t('mem.people'), m.people.map(p => p.name).join(', ')],
    [t('mem.emotion'), m.emotions.join(', ')],
  ];
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sa-sheet" role="dialog" aria-modal="true" aria-labelledby="sa-sheet-title" ref={ref}>
        <div className="sa-sheet-bar">
          <button type="button" className="sa-icon-btn" aria-label={t('common.close')} data-autofocus onClick={onClose}><X size={24} /></button>
        </div>
        <div className="sa-sheet-body">
          {m.photoUrl && <img className="sa-sheet-img" src={m.photoUrl} alt={m.title} decoding="async" />}
          <h2 className="sa-sheet-t" id="sa-sheet-title">{m.title}</h2>
          <dl className="sa-dl">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {m.story && <p className="sa-story">{m.story}</p>}
          <Segmented label={t('vis.scope')} size="senior" value={m.visibility} onChange={v => tachi.setMemoryVisibility(m.id, v)}
            options={[{ value: 'family', label: t('vis.family'), icon: <Users size={20} aria-hidden /> }, { value: 'private', label: t('vis.private'), icon: <Lock size={20} aria-hidden /> }]} />
          <button type="button" className="btn btn-primary sa-wide" onClick={onAsk}>{t('album.askAgain')}</button>
        </div>
      </div>
    </>
  );
}
