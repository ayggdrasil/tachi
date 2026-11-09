import { Lock, Users } from 'lucide-react';
import type { MemoryCardPayload, PhotoPayload, RecallCardPayload, ShareCardPayload, Visibility } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { MemoryGraph } from '../graph/MemoryGraph';
import type { CardProps } from './types';
import './cards.css';

export function PhotoCard({ message }: CardProps) {
  const p = message.payload as PhotoPayload;
  return <img className="cd-photo" src={p.url} alt={message.text || '보낸 사진'} loading="lazy" width={p.width} height={p.height} />;
}

export function VisibilitySwitch({ memoryId, value }: { memoryId: string; value: Visibility }) {
  return (
    <div className="cd-seg" role="group" aria-label="공개 범위">
      <button type="button" aria-pressed={value === 'family'} onClick={() => tachi.setMemoryVisibility(memoryId, 'family')}><Users size={14} />가족 공개</button>
      <button type="button" aria-pressed={value === 'private'} onClick={() => tachi.setMemoryVisibility(memoryId, 'private')}><Lock size={14} />나만 보기</button>
    </div>
  );
}

export function MemoryCard({ message, variant }: CardProps) {
  const p = message.payload as MemoryCardPayload;
  const live = useTachi(s => s.memories.find(m => m.id === p.memoryId));
  const meId = useTachi(s => s.meId);
  const m = live ?? p.memory;
  const rows: [string, string | undefined][] = [
    ['시기', [m.era, m.year ? `${m.year}년` : '', m.season].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ')],
    ['장소', m.place],
    ['함께한 사람', m.people.map(x => x.name).join(', ')],
    ['감정', m.emotions.join(', ')],
  ];
  const nodes = p.graphDelta?.nodes ?? [];
  const edges = p.graphDelta?.edges ?? [];
  const canToggle = meId === m.ownerId || variant === 'senior';
  return (
    <article className="cd cd-memory" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in" src={m.photoUrl} alt="" loading="lazy" />}
      <h3 className="cd-title">{m.title}</h3>
      <dl className="cd-dl">
        {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        {m.tags.length > 0 && <div><dt>키워드</dt><dd className="cd-badges">{m.tags.map(t => <span key={t} className="badge">{t}</span>)}</dd></div>}
      </dl>
      {m.story && <blockquote className="cd-story">“{m.story}”</blockquote>}
      {canToggle && <VisibilitySwitch memoryId={m.id} value={m.visibility} />}
      {nodes.length > 0 && (
        <div className="cd-graph">
          <MemoryGraph nodes={nodes} edges={edges} highlightIds={[...nodes.map(n => n.id), ...edges.map(e => e.id)]} compact height={variant === 'senior' ? 190 : 170} />
          <p className="cd-cap">기억 그래프에 저장됨 · 노드 {nodes.length} · 연결 {edges.length}</p>
        </div>
      )}
    </article>
  );
}

export function ShareCard({ message }: CardProps) {
  const p = message.payload as ShareCardPayload;
  const meta = [p.era, p.place].filter(Boolean).join(' · ');
  return (
    <article className="cd cd-share" aria-label={p.title}>
      <p className="cd-cap cd-cap-top">어머님이 공유한 추억</p>
      {p.photoUrl && <img className="cd-photo-in" src={p.photoUrl} alt="" loading="lazy" />}
      <h3 className="cd-title">{p.title}</h3>
      {meta && <p className="cd-meta">{meta}</p>}
      <p className="cd-warm">{p.summary}</p>
      {p.people.length > 0 && <p className="cd-people"><Users size={14} />{p.people.join(', ')}</p>}
    </article>
  );
}

export function RecallCard({ message, variant }: CardProps) {
  const p = message.payload as RecallCardPayload;
  const m = p.memory;
  const nodeBy = new Map(p.path.nodes.map(n => [n.id, n]));
  const hops = p.path.edges.map(e => ({ id: e.id, a: nodeBy.get(e.source)?.name ?? e.source, b: nodeBy.get(e.target)?.name ?? e.target, t: e.type }));
  const excerpt = m.story.length > 110 ? m.story.slice(0, 108) + '…' : m.story;
  return (
    <article className="cd cd-recall" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in" src={m.photoUrl} alt="" loading="lazy" />}
      <h3 className="cd-title">{m.title}</h3>
      <p className="cd-warm">{excerpt}</p>
      {p.matched.length > 0 && (
        <div className="cd-row"><span className="cd-label">찾은 단서</span>{p.matched.map(x => <span key={x} className="badge">{x}</span>)}</div>
      )}
      {hops.length > 0 && (
        <div className="cd-path" aria-label="그래프 경로">
          {hops.map(h => <span key={h.id} className="cd-hop">{h.a} <b>—{h.t}→</b> {h.b}</span>)}
        </div>
      )}
      {p.cypher && <code className={`mono faint cd-cypher ${variant === 'senior' ? 'cd-cypher-s' : ''}`}>{p.cypher}</code>}
      {p.alternatives.length > 0 && (
        <p className="cd-alt">이런 추억도 있어요: {p.alternatives.map((a, i) => (
          <span key={a.memoryId}>{i > 0 && ' · '}<button type="button" className="cd-link" onClick={() => tachi.send(message.roomId, a.title)}>{a.title}</button></span>
        ))}</p>
      )}
    </article>
  );
}
