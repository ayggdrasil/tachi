import { Lock, Users } from 'lucide-react';
import type { MemoryCardPayload, PhotoPayload, RecallCardPayload, ShareCardPayload, Visibility } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { Segmented } from '../common/Segmented';
import { MemoryGraph } from '../graph/MemoryGraph';
import { SpeakButton } from '../common/SpeakButton';
import type { CardProps } from './types';
import './cards.css';

export function PhotoCard({ message }: CardProps) {
  const p = message.payload as PhotoPayload;
  return <img className="cd-photo" src={p.url} alt={message.text || '보낸 사진'} loading="lazy" width={p.width} height={p.height} />;
}

export function VisibilitySwitch({ memoryId, value, variant = 'family' }: { memoryId: string; value: Visibility; variant?: 'senior' | 'family' }) {
  const size = variant === 'senior' ? 20 : 14;
  return (
    <Segmented label="공개 범위" size={variant} value={value} onChange={v => tachi.setMemoryVisibility(memoryId, v)}
      options={[
        { value: 'family', label: '가족 공개', icon: <Users size={size} aria-hidden /> },
        { value: 'private', label: '나만 보기', icon: <Lock size={size} aria-hidden /> },
      ]} />
  );
}

export function MemoryCard({ message, variant, actionSlot }: CardProps) {
  const p = message.payload as MemoryCardPayload;
  const live = useTachi(s => s.memories.find(m => m.id === p.memoryId));
  const meId = useTachi(s => s.meId);
  const m = live ?? p.memory;
  // Exact year + season ('1984년 봄'); the decade is only a fallback when there is no year.
  const when = m.year ? `${m.year}년${m.season ? ' ' + m.season : ''}` : (m.era ?? '');
  const rows: [string, string | undefined, boolean?][] = [
    ['시기', when],
    ['장소', m.place],
    ['함께한 사람', m.people.map(x => x.name).join(', '), true],
  ];
  // The compact graph is a proof, not a dump: memory, people, place and year only. Emotion/topic nodes live in the album's full graph.
  const KEEP = new Set(['Memory', 'Person', 'Place', 'Era']);
  const nodes = (p.graphDelta?.nodes ?? []).filter(n => KEEP.has(n.label));
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = (p.graphDelta?.edges ?? []).filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  // The share / skip actions ARE the decision: the visibility toggle only appears once no action is pending.
  const decided = (message.actions ?? []).every(a => a.done);
  const canToggle = decided && (meId === m.ownerId || variant === 'senior');
  const senior = variant === 'senior';
  return (
    <article className="cd cd-memory cd-compact" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in cd-photo-mem" src={m.photoUrl} alt="" loading="lazy" decoding="async" />}
      <div className="cd-row cd-between"><h3 className="cd-title">{m.title}</h3>
        {senior && <SpeakButton text={`${m.title}. ${m.story}`} />}</div>
      <dl className="cd-dl cd-dl-2 cd-facts">
        {rows.filter(([, v]) => v).map(([k, v, wide]) => <div key={k} className={wide ? 'cd-wide' : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      {decided
        ? senior && <p className="cd-cap">{m.visibility === 'family' ? '가족도 볼 수 있어요' : '지금은 나만 볼 수 있어요'}</p>
        : actionSlot}
      {nodes.length > 0 && (
        <div className="cd-graph cd-graph-c" role="group" aria-label={`기억 그래프에 저장됨 · 노드 ${nodes.length} · 연결 ${edges.length}`}>
          <span className="cd-label">기억 그래프</span>
          <MemoryGraph nodes={nodes} edges={edges} highlightIds={[...nodes.map(n => n.id), ...edges.map(e => e.id)]} compact large={senior} height={senior ? 150 : 130} />
        </div>
      )}
      {(m.story || m.tags.length > 0) && (
        <details className="cd-disc">
          <summary>이야기 보기</summary>
          {m.emotions.length > 0 && <p className="cd-meta"><b>감정</b> {m.emotions.join(', ')}</p>}
          {m.story && <blockquote className="cd-story">“{m.story}”</blockquote>}
          {m.tags.length > 0 && <div className="cd-badges">{m.tags.map(t => <span key={t} className="badge">{t}</span>)}</div>}
        </details>
      )}
      {canToggle && <VisibilitySwitch memoryId={m.id} value={m.visibility} variant={variant} />}
    </article>
  );
}

export function ShareCard({ message }: CardProps) {
  const p = message.payload as ShareCardPayload;
  const meta = [p.era, p.place].filter(Boolean).join(' · ');
  return (
    <article className="cd cd-share" aria-label={p.title}>
      <p className="cd-cap cd-cap-top">어머님이 공유한 추억</p>
      {p.photoUrl && <img className="cd-photo-in" src={p.photoUrl} alt="" loading="lazy" decoding="async" />}
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

const OPENER_RE = /^(그때|그해|그 해|\d{4}년|\d{2}년|[가-힣]+\s?(?:봄|여름|가을|겨울)에)/;
const ACTION_RE = /(했|갔|왔|울|웃|잃|도망|뛰|달려|찾|놀라|무서|기뻐|행복|눈물|안았|먹었|잡|넘어|터졌|혼났|다쳤|소리)/;

/** The memory's most distinctive sentence: an action/emotion beat, not the year/place opener. */
export function pickAnecdote(story: string): string {
  const sents = story.split(/(?<=[.!?。])\s+/).map(x => x.trim()).filter(Boolean);
  if (sents.length <= 1) return story;
  const score = (x: string, i: number) => (ACTION_RE.test(x) ? 3 : 0) + (OPENER_RE.test(x) ? -3 : 0) + (i === 0 ? -1 : 0) + Math.min(x.length, 80) / 80;
  return sents.map((x, i) => [x, score(x, i)] as const).sort((a, b) => b[1] - a[1])[0][0];
}

export function RecallCard({ message, variant }: CardProps) {
  const p = message.payload as RecallCardPayload;
  const m = p.memory;
  const senior = variant === 'senior';
  const nodeBy = new Map(p.path.nodes.map(n => [n.id, n]));
  const hops = p.path.edges.map(e => ({ id: e.id, a: nodeBy.get(e.source)?.name ?? e.source, b: nodeBy.get(e.target)?.name ?? e.target, t: e.type }));
  const anecdote = pickAnecdote(m.story);
  const excerpt = anecdote.length > 110 ? anecdote.slice(0, 108) + '…' : anecdote;
  return (
    <article className="cd cd-recall cd-compact" aria-label={m.title}>
      {m.photoUrl && <img className="cd-photo-in cd-photo-recall" src={m.photoUrl} alt="" loading="lazy" decoding="async" />}
      <div className="cd-row cd-between"><h3 className="cd-title">{m.title}</h3>
        {senior && <SpeakButton text={[message.text, m.title, m.story].filter(Boolean).join('. ')} />}</div>
      <p className="cd-warm cd-clamp2">{excerpt}</p>
      {m.story.length > anecdote.length && (
        <details className="cd-disc cd-disc-story">
          <summary>이야기 전체 보기</summary>
          <blockquote className="cd-story">“{m.story}”</blockquote>
        </details>
      )}
      {p.matched.length > 0 && (
        <div className="cd-row"><span className="cd-label">찾은 단서</span>{p.matched.map(x => <span key={x} className="badge">{x}</span>)}</div>
      )}
      {hops.length > 0 && (
        <div className="cd-path" role="group" aria-label="그래프 경로">
          {hops.map(h => (
            <span key={h.id} className="cd-hop">
              <span className="cd-hop-n">{h.a}</span><b>{REL_SENIOR[h.t] ?? h.t}</b><span className="cd-hop-n">{h.b}</span>
            </span>
          ))}
        </div>
      )}
      {!senior && p.cypher && (
        <details className="cd-tech"><summary>기술 정보 보기</summary><code className="mono cd-cypher">{p.cypher}</code></details>
      )}
      {p.alternatives.length > 0 && (
        <div className="cd-alt">
          <span className="cd-label">이런 추억도 있어요</span>
          <div className="cd-row">
            {p.alternatives.map(a => (
              <button key={a.memoryId} type="button" className="chip" onClick={() => tachi.send(message.roomId, a.title)}>{a.title}</button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
