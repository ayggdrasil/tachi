import { Lock, Users } from 'lucide-react';
import { SENIOR_ID } from '../../../../shared/constants';
import type { MemoryCardPayload, PhotoPayload, RecallCardPayload, ShareCardPayload, Visibility } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { Segmented } from '../common/Segmented';
import { MemoryGraph } from '../graph/MemoryGraph';
import { SpeakButton } from '../common/SpeakButton';
import type { CardProps } from './types';
import './cards.css';

export function PhotoCard({ message }: CardProps) {
  const t = useT();
  const p = message.payload as PhotoPayload;
  return <img className="cd-photo" src={p.url} alt={message.text || t('card.sentPhoto')} loading="lazy" width={p.width} height={p.height} />;
}

export function VisibilitySwitch({ memoryId, value, variant = 'family' }: { memoryId: string; value: Visibility; variant?: 'senior' | 'family' }) {
  const t = useT();
  const size = variant === 'senior' ? 20 : 14;
  return (
    <Segmented label={t('vis.scope')} size={variant} value={value} onChange={v => tachi.setMemoryVisibility(memoryId, v)}
      options={[
        { value: 'family', label: t('vis.family'), icon: <Users size={size} aria-hidden /> },
        { value: 'private', label: t('vis.private'), icon: <Lock size={size} aria-hidden /> },
      ]} />
  );
}

export function MemoryCard({ message, variant, actionSlot }: CardProps) {
  const t = useT();
  const p = message.payload as MemoryCardPayload;
  const live = useTachi(s => s.memories.find(m => m.id === p.memoryId));
  const meId = useTachi(s => s.meId);
  const m = live ?? p.memory;
  // Exact year + season ('1984년 봄'); the decade is only a fallback when there is no year.
  const when = m.year ? (m.season ? t('mem.yearSeason', { year: m.year, season: m.season }) : t('mem.year', { year: m.year })) : (m.era ?? '');
  const rows: [string, string | undefined, boolean?][] = [
    [t('mem.when'), when],
    [t('mem.place'), m.place],
    [t('mem.people'), m.people.map(x => x.name).join(', '), true],
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
        ? senior && <p className="cd-cap">{m.visibility === 'family' ? t('card.familyCanSee') : t('card.onlyYouSee')}</p>
        : actionSlot}
      {nodes.length > 0 && (
        <div className="cd-graph cd-graph-c" role="group" aria-label={t('card.graphSaved', { nodes: nodes.length, edges: edges.length })}>
          <span className="cd-label">{t('graph.title')}</span>
          <MemoryGraph nodes={nodes} edges={edges} highlightIds={[...nodes.map(n => n.id), ...edges.map(e => e.id)]} compact large={senior} height={senior ? 150 : 130} />
        </div>
      )}
      {(m.story || m.tags.length > 0) && (
        <details className="cd-disc">
          <summary>{t('card.viewStory')}</summary>
          {m.emotions.length > 0 && <p className="cd-meta"><b>{t('mem.emotion')}</b> {m.emotions.join(', ')}</p>}
          {m.story && <blockquote className="cd-story">“{m.story}”</blockquote>}
          {m.tags.length > 0 && <div className="cd-badges">{m.tags.map(tag => <span key={tag} className="badge">{tag}</span>)}</div>}
        </details>
      )}
      {canToggle && <VisibilitySwitch memoryId={m.id} value={m.visibility} variant={variant} />}
    </article>
  );
}

export function ShareCard({ message }: CardProps) {
  const t = useT();
  const owner = useTachi(s => s.users[SENIOR_ID]);
  const p = message.payload as ShareCardPayload;
  const meta = [p.era, p.place].filter(Boolean).join(' · ');
  return (
    <article className="cd cd-share" aria-label={p.title}>
      <p className="cd-cap cd-cap-top">{t('card.sharedBy', { name: owner?.shortName })}</p>
      {p.photoUrl && <img className="cd-photo-in" src={p.photoUrl} alt="" loading="lazy" decoding="async" />}
      <h3 className="cd-title">{p.title}</h3>
      {meta && <p className="cd-meta">{meta}</p>}
      <p className="cd-warm">{p.summary}</p>
      {p.people.length > 0 && <p className="cd-people"><Users size={14} />{p.people.join(', ')}</p>}
    </article>
  );
}

const REL_IDS = new Set(['TAKEN_AT', 'APPEARS_IN', 'IN_ERA', 'ABOUT', 'EVOKES', 'MENTIONS', 'FAMILY_OF']);

const OPENER_RE = /^(그때|그해|그 해|\d{4}년|\d{2}년|[가-힣]+\s?(?:봄|여름|가을|겨울)에|(?:it was|that|in|back in|during|one)\b.*?\b(?:19|20)\d{2}\b|(?:in|back in|that)\s+(?:the\s+)?(?:spring|summer|autumn|fall|winter|year)\b)/i;
const ACTION_RE = /(했|갔|왔|울|웃|잃|도망|뛰|달려|찾|놀라|무서|기뻐|행복|눈물|안았|먹었|잡|넘어|터졌|혼났|다쳤|소리|\b(?:ran|cried|laughed|lost|laugh|cry|hugged|shouted|screamed|scared|surprised|happy|tears|caught|fell|burst|scolded|hurt|found|danced|sang|ate)\b)/i;

/** The memory's most distinctive sentence: an action/emotion beat, not the year/place opener. */
export function pickAnecdote(story: string): string {
  const sents = story.split(/(?<=[.!?。])\s+/).map(x => x.trim()).filter(Boolean);
  if (sents.length <= 1) return story;
  const score = (x: string, i: number) => (ACTION_RE.test(x) ? 3 : 0) + (OPENER_RE.test(x) ? -3 : 0) + (i === 0 ? -1 : 0) + Math.min(x.length, 80) / 80;
  return sents.map((x, i) => [x, score(x, i)] as const).sort((a, b) => b[1] - a[1])[0][0];
}

export function RecallCard({ message, variant }: CardProps) {
  const t = useT();
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
      {(m.story.length > anecdote.length || m.story.length > 110) && (
        <details className="cd-disc cd-disc-story">
          <summary>{t('card.viewFullStory')}</summary>
          <blockquote className="cd-story">“{m.story}”</blockquote>
        </details>
      )}
      {p.matched.length > 0 && (
        <div className="cd-row"><span className="cd-label">{t('card.clues')}</span>{p.matched.map(x => <span key={x} className="badge">{x}</span>)}</div>
      )}
      {hops.length > 0 && (
        <div className="cd-path" role="group" aria-label={t('card.graphPath')}>
          {hops.map(h => (
            <span key={h.id} className="cd-hop">
              <span className="cd-hop-n">{h.a}</span><b>{REL_IDS.has(h.t) ? t(`rel.card.${h.t}`) : h.t}</b><span className="cd-hop-n">{h.b}</span>
            </span>
          ))}
        </div>
      )}
      {!senior && p.cypher && (
        <details className="cd-tech"><summary>{t('card.techInfo')}</summary><code className="mono cd-cypher">{p.cypher}</code></details>
      )}
      {p.alternatives.length > 0 && (
        <div className="cd-alt">
          <span className="cd-label">{t('card.otherMemories')}</span>
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
