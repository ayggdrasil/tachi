import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Check, Info } from 'lucide-react';
import type { CardAction, Message, User } from '../../../../shared/types';
import { SYSTEM_ID, TACHI_ID, dayHeaderLabel, koreanTime } from '../../../../shared/constants';
import { selectRoomMessages, tachi, useTachi } from '../../lib/store';
import { Avatar } from '../common/Avatar';
import { SpeakButton } from '../common/SpeakButton';
import { CardRenderer } from '../cards/CardRenderer';
import './MessageList.css';

interface Props { roomId: string; variant: 'senior' | 'family'; onOpenArtifact?: (artifactId: string) => void; emptyHint?: React.ReactNode }

function ActionBar({ message, onOpenArtifact }: { message: Message; onOpenArtifact?: (id: string) => void }) {
  const [clicked, setClicked] = useState<Set<string>>(new Set());
  const actions = message.actions ?? [];
  if (actions.length === 0) return null;
  const run = (a: CardAction) => {
    if (a.id === 'open_artifact') {
      const id = (a.data?.artifactId as string | undefined) ?? (message.payload?.type === 'artifact' ? message.payload.artifactId : undefined);
      if (id) onOpenArtifact?.(id);
      return;
    }
    setClicked(s => new Set(s).add(a.id));
    tachi.action(message.roomId, message.id, a.id, a.data);
  };
  return (
    <div className="ml-actions">
      {actions.map(a => {
        const done = !!a.done;
        const disabled = done || (clicked.has(a.id) && a.id !== 'open_artifact');
        return (
          <button key={a.id} type="button" className={`btn ${a.style === 'primary' && !done ? 'btn-primary' : ''}`} disabled={disabled} onClick={() => run(a)}>
            {done && <Check size={16} />}{a.label}
          </button>
        );
      })}
    </div>
  );
}

function ModelLine({ message, variant }: { message: Message; variant: 'senior' | 'family' }) {
  const [open, setOpen] = useState(false);
  const m = message.meta; if (!m?.model && !m?.fallback) return null;
  const line = `${m.model ?? '타치'}${m.fallback ? ' · 오프라인 응답' : ''}`;
  if (variant === 'family') return <span className="ml-model">{line}</span>;
  return (
    <span className="ml-info">
      <button type="button" className="ml-info-btn" aria-label="응답 정보" aria-expanded={open} onClick={() => setOpen(o => !o)}><Info size={16} /></button>
      {open && <span className="ml-model ml-model-s" role="status">{line}</span>}
    </span>
  );
}

function dateKey(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

export function MessageList({ roomId, variant, onOpenArtifact, emptyHint }: Props) {
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
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };
  const lastTop = useRef(0);
  const onScroll = () => {
    const el = scrollRef.current; if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only an upward scroll by the user unpins; smooth programmatic scrolls and late-growing content never do.
    if (dist < 80) { atBottom.current = true; setShowNew(false); }
    else if (el.scrollTop < lastTop.current - 4) atBottom.current = false;
    lastTop.current = el.scrollTop;
  };

  // Photos and cards grow after they render: stay pinned to the bottom when they finish loading.
  useEffect(() => {
    const el = scrollRef.current; if (!el) return;
    const onLoad = () => { if (atBottom.current) el.scrollTop = el.scrollHeight; };
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
    if (atBottom.current || last?.senderId === meId) toBottom(true);
    else setShowNew(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, tick]);

  useEffect(() => { if (typing && atBottom.current) toBottom(true); }, [typing]);
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
          const body = m.kind === 'text' ? null : <CardRenderer message={m} variant={variant} onOpenArtifact={onOpenArtifact} />;
          return (
            <Fragment key={m.id}>
              {showDate && <div className="ml-date"><span>{dayHeaderLabel(date)}</span></div>}
              {isSystem ? (
                <div className="ml-sys"><CardRenderer message={{ ...m, kind: 'system' }} variant={variant} /></div>
              ) : (
                <div className={`ml-row ${mine ? 'ml-me' : 'ml-other'} ${head ? 'ml-head' : ''}`}>
                  {!mine && <div className="ml-av">{head && <Avatar user={sender} size={senior ? 36 : 30} />}</div>}
                  <div className="ml-col">
                    {!mine && head && <div className="ml-name">{isTachi ? '타치' : sender?.shortName ?? m.senderId}<span className="ml-time">{koreanTime(date)}</span></div>}
                    {isTachi && m.meta?.proactive && head && <div className="ml-pro">타치가 먼저 말을 걸었어요 · {koreanTime(date)}</div>}
                    {m.kind === 'text' && (
                      <div className={`ml-text ${mine ? 'ml-bubble' : isTachi ? 'ml-tachi' : 'ml-light'}`}>
                        {m.text}
                        {senior && isTachi && <span className="ml-speak"><SpeakButton text={m.text} /></span>}
                      </div>
                    )}
                    {body && <div className="ml-card">{body}</div>}
                    <ActionBar message={m} onOpenArtifact={onOpenArtifact} />
                    {isTachi && <ModelLine message={m} variant={variant} />}
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
          <div className="ml-row ml-other ml-head" aria-hidden={false}>
            <div className="ml-av"><Avatar user={typer} size={senior ? 36 : 30} /></div>
            <div className="ml-col"><div className="ml-typing"><i /><i /><i /><span>{typingText}</span></div></div>
          </div>
        )}
      </div>
      {showNew && (
        <button type="button" className="ml-new" onClick={() => { toBottom(true); setShowNew(false); }}><ArrowDown size={14} />새 메시지</button>
      )}
    </div>
  );
}
