import { Lock, Users } from 'lucide-react';
import type { MemoryCardPayload, PhotoPayload, RecallCardPayload, ShareCardPayload, Visibility } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { MemoryGraph } from '../graph/MemoryGraph';
import { SpeakButton } from '../common/SpeakButton';
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

export function MemoryCard({ message, variant, actionSlot }: CardProps) {
  const p = message.payload as MemoryCardPayload;
  const live = useTachi(s => s.memories.find(m => m.id === p.memoryId));
  const meId = useTachi(s => s.meId);
  const m = live ?? p.memory;
  // Exact year + season ('1984년 봄'); the decade is only a fallback when there is no year.
  const when = [m.year ? `${m.year}년` : m.era, m.season].filter(Boolean).join(' ');
  const rows: [string, string | undefined, boolean?][] = [
    ['시기', when],
    ['장소', m.place],
    ['함께한 사람', m.people.map(x => x.name).join(', '), true],
    ['감정', m.emotions.join(', '), true],
  ];
  const nodes = p.graphDelta?.nodes ?? [];
  const edges = p.graphDelta?.edges ?? [];
  // The share / skip actions ARE the decision: the visibility toggle only appears once no action is pending.
  const decided = (message.actions ?? []).every(a => a.done);
  const canToggle = decided && (meId === m.ownerId || variant === 'senior');
  const senior = variant === 'senior';
  return (
    <article className="cd cd-memory cd-compact" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in cd-photo-mem" src={m.photoUrl} alt="" loading="lazy" />}
      <div className="cd-row cd-between"><h3 className="cd-title">{m.title}</h3>
        {senior && <SpeakButton text={`${m.title}. ${m.story}`} />}</div>
      <dl className="cd-dl cd-dl-2 cd-facts">
        {rows.filter(([, v]) => v).map(([k, v, wide]) => <div key={k} className={wide ? 'cd-wide' : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {actionSlot}
      {nodes.length > 0 && (
        <div className="cd-graph cd-graph-c" role="group" aria-label={`기억 그래프에 저장됨 · 노드 ${nodes.length} · 연결 ${edges.length}`}>
          <span className="cd-label">기억 그래프</span>
          <MemoryGraph nodes={nodes} edges={edges} highlightIds={[...nodes.map(n => n.id), ...edges.map(e => e.id)]} compact height={110} />
        </div>
      )}
      {(m.story || m.tags.length > 0) && (
        <details className="cd-disc">
          <summary>이야기 보기</summary>
          {m.story && <blockquote className="cd-story">“{m.story}”</blockquote>}
          {m.tags.length > 0 && <div className="cd-badges">{m.tags.map(t => <span key={t} className="badge">{t}</span>)}</div>}
        </details>
      )}
      {canToggle && <VisibilitySwitch memoryId={m.id} value={m.visibility} />}
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

const REL_SENIOR: Record<string, string> = {
  TAKEN_AT: '찍은 곳', APPEARS_IN: '함께한 사람', IN_ERA: '시기', ABOUT: '사건', EVOKES: '감정', MENTIONS: '키워드', FAMILY_OF: '가족',
};

export function RecallCard({ message, variant }: CardProps) {
  const p = message.payload as RecallCardPayload;
  const m = p.memory;
  const senior = variant === 'senior';
  const nodeBy = new Map(p.path.nodes.map(n => [n.id, n]));
  const hops = p.path.edges.map(e => ({ id: e.id, a: nodeBy.get(e.source)?.name ?? e.source, b: nodeBy.get(e.target)?.name ?? e.target, t: e.type }));
  const excerpt = m.story.length > 110 ? m.story.slice(0, 108) + '…' : m.story;
  return (
    <article className="cd cd-recall cd-compact" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in cd-photo-recall" src={m.photoUrl} alt="" loading="lazy" />}
      <div className="cd-row cd-between"><h3 className="cd-title">{m.title}</h3>
        {senior && <SpeakButton text={[message.text, m.story].filter(Boolean).join(' ')} />}</div>
      <p className="cd-warm cd-clamp2">{excerpt}</p>
      {p.matched.length > 0 && (
        <div className="cd-row"><span className="cd-label">찾은 단서</span>{p.matched.map(x => <span key={x} className="badge">{x}</span>)}</div>
      )}
      {hops.length > 0 && (
        <div className="cd-path" aria-label="그래프 경로">
          {hops.map(h => (
            <span key={h.id} className="cd-hop">
              <span className="cd-hop-n">{h.a}</span><b>{senior ? REL_SENIOR[h.t] ?? h.t : `-${h.t}→`}</b><span className="cd-hop-n">{h.b}</span>
            </span>
          ))}
        </div>
      )}
      {!senior && p.cypher && (
        <details className="cd-tech"><summary>기술 정보 보기</summary><code className="mono cd-cypher">{p.cypher}</code></details>
      )}
      {p.alternatives.length > 0 && (
        <p className="cd-alt cd-alt-1">이런 추억도 있어요: {p.alternatives.map((a, i) => (
          <span key={a.memoryId}>{i > 0 && ' · '}<button type="button" className="cd-link" onClick={() => tachi.send(message.roomId, a.title)}>{a.title}</button></span>
        ))}</p>
      )}
    </article>
  );
}
