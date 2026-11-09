import { useRef, useState } from 'react';
import { Lock, Users, X } from 'lucide-react';
import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import type { GraphEdge, GraphNode, Memory } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { MemoryTile } from '../../components/memory/MemoryTile';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { Segmented } from '../../components/common/Segmented';
import { useModal } from '../../components/common/useModal';

export function MemoryAlbum({ onAskTachi }: { onAskTachi: () => void }) {
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
      <h1 className="sa-h sa-h1">우리 추억</h1>
      {list.length === 0 ? (
        <p className="muted sa-pad">아직 저장된 추억이 없어요. 대화에서 사진을 보여 주세요.</p>
      ) : (
        <div className="sa-grid">
          {list.map(m => <MemoryTile key={m.id} memory={m} onClick={() => setOpenId(m.id)} />)}
        </div>
      )}
      <h2 className="sa-h sa-h2">기억 그래프</h2>
      <p className="muted sa-pad-s">타치가 추억을 서로 이어 놓은 모습이에요. 점을 눌러 끌어 보세요.</p>
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
  const rows: [string, string][] = [
    ['시기', m.year ? `${m.year}년${m.season ? ' ' + m.season : ''}` : (m.era ?? '')],
    ['장소', m.place ?? ''],
    ['함께한 사람', m.people.map(p => p.name).join(', ')],
    ['감정', m.emotions.join(', ')],
  ];
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sa-sheet" role="dialog" aria-modal="true" aria-labelledby="sa-sheet-title" ref={ref}>
        <div className="sa-sheet-bar">
          <button type="button" className="sa-icon-btn" aria-label="닫기" data-autofocus onClick={onClose}><X size={24} /></button>
        </div>
        <div className="sa-sheet-body">
          {m.photoUrl && <img className="sa-sheet-img" src={m.photoUrl} alt={m.title} decoding="async" />}
          <h2 className="sa-sheet-t" id="sa-sheet-title">{m.title}</h2>
          <dl className="sa-dl">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {m.story && <p className="sa-story">{m.story}</p>}
          <Segmented label="공개 범위" size="senior" value={m.visibility} onChange={v => tachi.setMemoryVisibility(m.id, v)}
            options={[{ value: 'family', label: '가족 공개', icon: <Users size={20} aria-hidden /> }, { value: 'private', label: '나만 보기', icon: <Lock size={20} aria-hidden /> }]} />
          <button type="button" className="btn btn-primary sa-wide" onClick={onAsk}>타치에게 이 이야기 다시 듣기</button>
        </div>
      </div>
    </>
  );
}
