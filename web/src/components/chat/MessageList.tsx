import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2 } from 'lucide-react';
import type { CardAction, Message, User } from '../../../../shared/types';
import { SYSTEM_ID, TACHI_ID, dayHeaderLabel, koreanTime } from '../../../../shared/constants';
import { selectRoomMessages, tachi, useTachi } from '../../lib/store';
import { Avatar } from '../common/Avatar';
import { SpeakButton } from '../common/SpeakButton';
import { CardRenderer } from '../cards/CardRenderer';
import { ActionBar } from './ActionBar';
import './MessageList.css';

interface Props { roomId: string; variant: 'senior' | 'family'; onOpenArtifact?: (artifactId: string) => void; onOpenRoom?: (roomId: string) => void; emptyHint?: React.ReactNode }

const CARD_KINDS = new Set(['memory_card', 'recall_card', 'trip_suggestion', 'itinerary', 'share_card', 'artifact', 'schedule_request', 'schedule_result', 'health_card', 'report', 'task_card']);
/** Cards that render their own actions inside (right under the primary content) so they stay above the fold. */
const INLINE_ACTIONS = new Set(['memory_card', 'itinerary', 'trip_suggestion']);
const TEXT_ABOVE = new Set(['recall_card']);
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ModelLine({ message, variant, inline }: { message: Message; variant: 'senior' | 'family'; inline?: boolean }) {
  // Seniors never see technical provenance; the family variant shows what actually produced the text.
  if (variant === 'senior') return null;
  const m = message.meta; if (!m?.model && !m?.fallback && !m?.source) return null;
  const line = m.source === 'rule' ? '자동 안내'
    : m.source === 'heuristic' || m.fallback ? '기본 응답'
    : m.model ?? '타치';
  return <span className="ml-model">{inline ? `· ${line}` : line}</span>;
}

function GenBadge({ message }: { message: Message }) {
  const g = message.meta?.generatedBy; if (!g) return null;
  return <span className="badge ml-gen">{g === 'bot' ? 'AI 봇' : '자동 응답'}</span>;
}

function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export function MessageList({ roomId, variant, onOpenArtifact, onOpenRoom, emptyHint }: Props) {
  const messages = useTachi(selectRoomMessages(roomId));
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const typing = useTachi(s => s.typing[roomId]);
  const tick = useTachi(s => s.messageTick);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [showNew, setShowNew] = useState(false);
  const prevLen = useRef(0);
  const senior = variant === 'senior';

  const toBottom = (smooth: boolean) => {
    const el = scrollRef.current; if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  };
  const pinMode = useRef<'bottom' | 'card' | 'answer'>('bottom');
  const toCard = (id: string) => {
    const el = scrollRef.current; if (!el) return;
    const row = el.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`); if (!row) return toBottom(true);
    const top = row.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 8;
    el.scrollTo({ top: Math.max(0, top), behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const lastTop = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only an upward scroll by the user unpins; smooth programmatic scrolls and late-growing content never do.
    if (dist < 80) { atBottom.current = true; setShowNew(false); if (pinMode.current === 'answer') pinMode.current = 'bottom'; }
    else if (el.scrollTop < lastTop.current - 4) atBottom.current = false;
    lastTop.current = el.scrollTop;
  };

  // Photos and cards grow after they render: stay pinned to the bottom when they finish loading.
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onLoad = () => { if (atBottom.current && pinMode.current === 'bottom') el.scrollTop = el.scrollHeight; };
    el.addEventListener('load', onLoad, true);
    return () => el.removeEventListener('load', onLoad, true);
  }, []);

  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    const first = prevLen.current === 0;
    const grew = messages.length > prevLen.current;
    prevLen.current = messages.length;
    if (first) { toBottom(false); return; }
    if (!grew) return;
    const isCard = !!last && CARD_KINDS.has(last.kind) && last.senderId !== meId;
    // A health Q&A is one presentation turn: Tachi's numeric answer (the text right before the card) and the card stay together.
    const answer = last?.kind === 'health_card' ? messages[messages.length - 2] : undefined;
    const answerId = answer && answer.senderId === TACHI_ID && answer.kind === 'text' ? answer.id : undefined;
    if (answerId && atBottom.current) { pinMode.current = 'answer'; toCard(answerId); return; }
    // Later bot reactions never re-pin: the answer stays where it is, with a "새 메시지" pill.
    if (pinMode.current === 'answer' && last && last.senderId !== meId) { setShowNew(true); return; }
    pinMode.current = isCard ? 'card' : 'bottom';
    if (isCard && atBottom.current) toCard(last.id);
    else if (atBottom.current || last?.senderId === meId) toBottom(true);
    else setShowNew(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, tick]);

  useEffect(() => { if (typing && atBottom.current && pinMode.current === 'bottom') toBottom(true); }, [typing]);
  useEffect(() => { prevLen.current = 0; setShowNew(false); }, [roomId]);

  const lastMsg = messages[messages.length - 1];
  const showTyping = !!typing && typing.until > Date.now() && typing.userId !== meId;
  const typer: User | undefined = typing ? users[typing.userId] : undefined;
  const typingText = typing?.userId === TACHI_ID ? '타치가 생각하고 있어요'
    : `${typer?.shortName ?? '누군가'}${typer?.shortName === '어머니' ? '가' : '님이'} 입력 중`;

  let prev: Message | undefined;
  return (
    <div className={`ml-wrap ml-${variant}`}>
      <div className="ml" ref={scrollRef} onScroll={onScroll} role="log" aria-live="polite" aria-relevant="additions" aria-label="대화">
        <h2 className="sr-only">{senior ? '타치와 나눈 대화' : '대화 내용'}</h2>
        {messages.length === 0 && <div className="ml-empty">{emptyHint ?? <p className="faint">아직 대화가 없어요</p>}</div>}
        {messages.map(m => {
          const showDate = !prev || dateKey(prev.createdAt) !== dateKey(m.createdAt);
          const isSystem = m.kind === 'system' || m.senderId === SYSTEM_ID;
          const mine = m.senderId === meId;
          const isTachi = m.senderId === TACHI_ID;
          const sender = users[m.senderId];
          const gap = prev ? new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() : 0;
          const head = showDate || !prev || prev.senderId !== m.senderId || prev.kind === 'system' || gap > 5 * 60_000;
          prev = m;
          const isLast = m === lastMsg;
          const date = new Date(m.createdAt);
          const inline = INLINE_ACTIONS.has(m.kind) && (m.actions?.length ?? 0) > 0;
          const body = m.kind === 'text' ? null : (
            <CardRenderer message={m} variant={variant} onOpenArtifact={onOpenArtifact} onOpenRoom={onOpenRoom}
              actionSlot={inline ? <ActionBar message={m} onOpenArtifact={onOpenArtifact} inline /> : undefined} />
          );
          return (
            <Fragment key={m.id}>
              {showDate && <div className="ml-date"><span>{dayHeaderLabel(date)}</span></div>}
              {isSystem ? (
                <div className="ml-sys"><CardRenderer message={{ ...m, kind: 'system' }} variant={variant} /></div>
              ) : (
                <div data-mid={m.id} className={`ml-row ${mine ? 'ml-me' : 'ml-other'} ${head ? 'ml-head' : ''}`}>
                  {!mine && <div className="ml-av">{head && <Avatar user={sender} size={senior ? 36 : 30} decorative />}</div>}
                  <div className="ml-col">
                    {!mine && head && <div className="ml-name">{isTachi ? '타치' : sender?.shortName ?? m.senderId}<GenBadge message={m} /><span className="ml-time">{koreanTime(date)}</span>{isTachi && <ModelLine message={m} variant={variant} inline />}</div>}
                    {!head && !mine && m.meta?.generatedBy && <div className="ml-name"><GenBadge message={m} /></div>}
                    {isTachi && m.meta?.proactive && head && <div className="ml-pro">타치가 먼저 말을 걸었어요 · {koreanTime(date)}</div>}
                    {m.kind === 'text' && (
                      <div className={`ml-text ${mine ? 'ml-bubble' : isTachi ? 'ml-tachi' : 'ml-light'}`}>
                        {m.text}
                      </div>
                    )}
                    {m.kind === 'text' && senior && isTachi && <div className="ml-tools"><SpeakButton text={m.text} /></div>}
                    {m.kind !== 'text' && TEXT_ABOVE.has(m.kind) && m.text && (
                      <div className="ml-text ml-tachi">{m.text}</div>
                    )}
                    {body && <div className="ml-card">{body}</div>}
                    {senior && mine && m.meta?.generatedBy === 'assisted' && <span className="ml-auto-cap">자동 응답</span>}
                    {!inline && <ActionBar message={m} onOpenArtifact={onOpenArtifact} />}
                    {isTachi && !head && <ModelLine message={m} variant={variant} />}
                    {isTachi && isLast && m.quickReplies && m.quickReplies.length > 0 && (
                      <div className="ml-chips">
                        {m.quickReplies.map(q => <button key={q} type="button" className="chip" onClick={() => tachi.send(roomId, q)}>{q}</button>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
        {showTyping && (
          <div className="ml-row ml-other ml-head">
            <div className="ml-av"><Avatar user={typer} size={senior ? 36 : 30} decorative /></div>
            <div className="ml-col"><div className="ml-typing"><Loader2 size={senior ? 18 : 14} className="ml-spin" aria-hidden /><span>{typingText}</span></div></div>
          </div>
        )}
      </div>
      {showNew && (
        <button type="button" className="ml-new" onClick={() => { toBottom(true); setShowNew(false); }}><ArrowDown size={14} />새 메시지</button>
      )}
    </div>
  );
}
