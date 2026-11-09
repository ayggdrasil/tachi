import { useCallback, useRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Home, HeartHandshake, MoreHorizontal, UserPlus, X } from 'lucide-react';
import { FAMILY_ROOM_ID } from '../../../../shared/constants';
import { initTachi, isEmbedded, rememberPersona, resolvePersona, useTachi } from '../../lib/store';
import { MessageList } from '../../components/chat/MessageList';
import { Composer } from '../../components/chat/Composer';
import { Avatar } from '../../components/common/Avatar';
import { useModal } from '../../components/common/useModal';
import { useIsNarrow } from './useMedia';
import { Sidebar } from './Sidebar';
import { ArtifactPanel } from './ArtifactPanel';
import { MomPanel } from './MomPanel';
import { InviteDialog } from './InviteDialog';
import { NewRoomDialog } from './NewRoomDialog';
import './FamilyApp.css';

type Panel = { kind: 'mom' } | { kind: 'artifact'; id: string } | null;

export default function FamilyApp() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const embedded = isEmbedded();
  const narrow = useIsNarrow();
  const personaId = resolvePersona('jieun') ?? 'jieun';

  useEffect(() => { initTachi(personaId); }, [personaId]);

  const status = useTachi(s => s.status);
  const me = useTachi(s => s.me);
  const users = useTachi(s => s.users);
  const rooms = useTachi(s => s.rooms);
  const messages = useTachi(s => s.messages);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'chat'>(embedded ? 'chat' : 'list');
  const [panel, setPanel] = useState<Panel>(null);
  const [invite, setInvite] = useState(false);
  const [newRoom, setNewRoom] = useState(false);
  const [more, setMore] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const panelOpener = useRef<HTMLElement | null>(null);
  const moreBox = useRef<HTMLDivElement>(null);
  const moreBtn = useRef<HTMLButtonElement>(null);
  const [seen, setSeen] = useState<Record<string, number>>({});

  const visibleRooms = useMemo(() => rooms.filter(r => r.type !== 'tachi'), [rooms]);
  const wantRoom = useRef(sp.get('room'));

  // pick a default room once rooms are known
  useEffect(() => {
    if (wantRoom.current && visibleRooms.some(r => r.id === wantRoom.current)) {
      const id = wantRoom.current;
      wantRoom.current = null;
      setActiveId(id);
      setView('chat');
      return;
    }
    if (activeId && visibleRooms.some(r => r.id === activeId)) return;
    const first = visibleRooms.find(r => r.id === FAMILY_ROOM_ID) ?? visibleRooms.find(r => r.type === 'family') ?? visibleRooms[0];
    setActiveId(first?.id ?? null);
  }, [visibleRooms, activeId]);

  const chatShown = !narrow || view === 'chat';

  // unread bookkeeping
  useEffect(() => {
    setSeen(prev => {
      let next = prev;
      for (const r of visibleRooms) {
        const len = (messages[r.id] ?? []).length;
        if (prev[r.id] === undefined || (r.id === activeId && chatShown)) {
          if (prev[r.id] !== len) { if (next === prev) next = { ...prev }; next[r.id] = len; }
        }
      }
      return next;
    });
  }, [messages, visibleRooms, activeId, chatShown]);

  const unread = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of visibleRooms) {
      const list = messages[r.id] ?? [];
      out[r.id] = list.slice(seen[r.id] ?? list.length).filter(m => m.senderId !== me?.id && m.senderId !== 'system').length;
    }
    return out;
  }, [messages, seen, visibleRooms, me]);

  const room = visibleRooms.find(r => r.id === activeId) ?? null;
  const family = useMemo(() => Object.values(users).filter(u => u.role === 'family'), [users]);
  const members = useMemo(() => (room?.memberIds ?? []).map(id => users[id]).filter(u => u && u.id !== 'tachi'), [room, users]);

  // embedded: a pending schedule request addressed to me in another room → slim banner
  const pendingReq = useMemo(() => {
    if (!embedded || !me) return null;
    let best: { roomId: string; at: string } | null = null;
    for (const r of visibleRooms) {
      if (r.type !== 'side') continue;
      for (const m of messages[r.id] ?? []) {
        if (m.payload?.type === 'schedule_request' && !m.payload.answered && (!best || m.createdAt > best.at)) best = { roomId: r.id, at: m.createdAt };
      }
    }
    return best;
  }, [embedded, me, visibleRooms, messages]);

  // side room: did I answer my schedule request here?
  // the room's CURRENT request: latest schedule_request for its pollId
  const currentReq = useMemo(() => {
    if (!room || room.type !== 'side') return null;
    let best: { id: string; answered: boolean; at: string } | null = null;
    for (const m of messages[room.id] ?? []) {
      const pl = m.payload;
      if (pl?.type !== 'schedule_request') continue;
      if (room.pollId && pl.pollId !== room.pollId) continue;
      if (!best || m.createdAt >= best.at) best = { id: m.id, answered: !!pl.answered, at: m.createdAt };
    }
    return best;
  }, [room, messages]);
  const answeredHere = !!currentReq?.answered;
  const answeredReqId = currentReq?.answered ? currentReq.id : null;
  const goFamily = useCallback(() => {
    setActiveId(FAMILY_ROOM_ID); setView('chat'); setPanel(null);
  }, []);
  useEffect(() => {
    if (!embedded || !answeredReqId) return;
    const t = window.setTimeout(goFamily, 1500);
    return () => window.clearTimeout(t);
  }, [embedded, answeredReqId, goFamily]);

  const switchPersona = useCallback((id: string) => {
    rememberPersona(id);
    const q = new URLSearchParams(sp);
    q.set('as', id);
    setActiveId(null);
    setSeen({});
    nav({ search: `?${q.toString()}` }, { replace: true });
  }, [nav, sp]);

  const openRoom = (id: string) => { setActiveId(id); setView('chat'); setPanel(null); };
  const selectRoom = (id: string) => { setActiveId(id); setView('chat'); setPanel(null); };
  const openPanel = (p: Panel) => { panelOpener.current = document.activeElement as HTMLElement | null; setPanel(p); };
  const closePanel = () => {
    const inside = !!document.activeElement?.closest('.fam-panel, .fam-sheet');
    setPanel(null);
    if (inside) requestAnimationFrame(() => panelOpener.current?.focus({ preventScroll: true }));
  };
  const togglePanel = (p: Panel) => {
    const same = !!(panel && p && panel.kind === p.kind && (panel.kind === 'mom' || (p.kind === 'artifact' && panel.kind === 'artifact' && panel.id === p.id)));
    if (same) closePanel(); else openPanel(p);
  };

  // Esc closes panel
  useEffect(() => {
    if (!panel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) closePanel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  // "더 보기" menu: outside press / Escape close, focus moves in on open
  useEffect(() => {
    if (!more) return;
    const placeMenu = () => { const r = moreBtn.current?.getBoundingClientRect(); if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right }); };
    placeMenu();
    const onResize = () => setMore(false);
    window.addEventListener('resize', onResize);
    moreBox.current?.querySelector<HTMLElement>('#fam-more-menu button')?.focus({ preventScroll: true });
    const on = (e: PointerEvent) => { if (!moreBox.current?.contains(e.target as Node)) setMore(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMore(false); moreBtn.current?.focus(); } };
    document.addEventListener('pointerdown', on);
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', onResize); document.removeEventListener('pointerdown', on); document.removeEventListener('keydown', key); };
  }, [more]);

  if (status === 'error') {
    return (
      <div className="fam-boot" role="alert">
        <span className="fam-mark">타치</span>
        <p className="fam-boot-title">연결이 잠시 끊겼어요.</p>
        <p className="caption muted fam-boot-msg">잠시 후 다시 연결해 주세요.</p>
        <div className="fam-boot-actions">
          <button className="btn btn-primary" onClick={() => initTachi(personaId, true)}>다시 연결</button>
          <Link to="/" className="btn">다른 가족으로 들어가기</Link>
        </div>
      </div>
    );
  }
  if (status !== 'ready' || !me) {
    return (
      <div className="fam-boot" role="status">
        <span className="fam-mark">타치</span>
        <p className="caption muted">가족방에 연결하는 중…</p>
      </div>
    );
  }

  const panelNode = panel && (
    <div className="fam-panel-body">
      <header className="fam-panel-head">
        <h2 className="fam-panel-title" id="fam-panel-title">{panel.kind === 'mom' ? '어머니 소식' : '모임 계획'}</h2>
        <button className="btn btn-icon" data-autofocus onClick={closePanel} aria-label="패널 닫기"><X size={18} strokeWidth={1.5} /></button>
      </header>
      <div className="fam-panel-scroll">
        {panel.kind === 'mom' ? <MomPanel /> : <ArtifactPanel artifactId={panel.id} />}
      </div>
    </div>
  );

  const showSidebar = !narrow || view === 'list';

  const SIDE_PREFIX = '일정 조율 · ';
  const fullTitle = room?.title ?? '대화방';
  const kicker = room?.type === 'side' && fullTitle.startsWith(SIDE_PREFIX) ? '일정 조율' : null;
  const name = kicker ? fullTitle.slice(SIDE_PREFIX.length) : fullTitle;

  return (
    <div className={`fam ${narrow ? 'is-narrow' : ''} ${panel && !narrow ? 'has-panel' : ''}`}>
      {showSidebar && (
        <Sidebar me={me} family={family} rooms={visibleRooms} activeId={activeId} unread={unread}
          onSelect={selectRoom} onNew={() => setNewRoom(true)} onSwitchPersona={switchPersona} full={narrow} />
      )}

      {chatShown && (
        <main className="fam-main">
          <header className="fam-head">
            {narrow && (
              <button className="btn btn-icon" onClick={() => setView('list')} aria-label="대화방 목록으로">
                <ArrowLeft size={18} strokeWidth={1.5} />
              </button>
            )}
            <h1 className="fam-head-title" title={fullTitle}>{kicker && <span className="fam-head-kicker">{kicker}</span>}<span className="fam-head-name">{name}</span></h1>
            <div className="fam-stack" role="group" aria-label={`참여자 ${members.length}명`}>
              {members.slice(0, 5).map(u => <span key={u.id} className="fam-stack-i"><Avatar user={u} size={24} /></span>)}
              {members.length > 5 && <span className="fam-stack-more">+{members.length - 5}</span>}
            </div>
            <span className="fam-spacer" />
            {room?.type === 'side' && (
              <button className={`btn ${answeredHere ? 'btn-primary' : ''} fam-head-btn`} onClick={goFamily} aria-label="가족방으로">
                <Home size={16} strokeWidth={1.5} /><span className="fam-head-label">가족방으로</span>
              </button>
            )}
            {room?.type === 'family' && (
              <button className="btn btn-ghost fam-head-btn" onClick={() => setInvite(true)} aria-label="초대">
                <UserPlus size={16} strokeWidth={1.5} /><span className="fam-head-label">초대</span>
              </button>
            )}
            <button className={`btn btn-ghost fam-head-btn ${panel?.kind === 'mom' ? 'is-on' : ''}`} onClick={() => togglePanel({ kind: 'mom' })}
              aria-pressed={panel?.kind === 'mom'} aria-label="어머니 소식">
              <HeartHandshake size={16} strokeWidth={1.5} /><span className="fam-head-label">어머니 소식</span>
            </button>
            <div className="fam-more" ref={moreBox}>
              <button ref={moreBtn} className="btn btn-icon" onClick={() => setMore(v => !v)} aria-label="더 보기" aria-expanded={more} aria-controls="fam-more-menu"><MoreHorizontal size={18} strokeWidth={1.5} /></button>
              {more && (
                <div className="fam-menu fam-more-menu" id="fam-more-menu" style={menuPos ?? undefined}>
                  <p className="caption muted fam-menu-h">참여자 {members.length}명</p>
                  {members.map(u => (
                    <div key={u.id} className="fam-menu-item"><Avatar user={u} size={22} /><span>{u.name} · {u.relation === '본인' ? '어머니' : u.relation}</span></div>
                  ))}
                  <div className="fam-menu-tips">
                    <p className="caption muted fam-menu-h">타치에게 이렇게 물어보세요</p>
                    <p className="fam-menu-tip">‘타치, 엄마 요즘 혈압 괜찮으셔?’</p>
                    <p className="fam-menu-tip">‘타치, 모임 시간 잡아줘’</p>
                    <p className="fam-menu-tip">‘엄마 생신에 다 같이 모이자’라고 하면 모임 기획서를 만들어요</p>
                  </div>
                  <button className="fam-menu-item fam-menu-close" onClick={() => { setMore(false); moreBtn.current?.focus(); }}>닫기</button>
                </div>
              )}
            </div>
          </header>

          {pendingReq && pendingReq.roomId !== activeId && (
            <button className="fam-banner" onClick={() => openRoom(pendingReq.roomId)}>
              <CalendarClock size={14} strokeWidth={1.5} /> 타치가 일정을 여쭤봐요 · <b>답하기</b>
            </button>
          )}
          {room ? (
            <>
              <div className="fam-thread">
                <div className="fam-thread-inner">
                  <MessageList roomId={room.id} variant="family"
                    onOpenArtifact={id => openPanel({ kind: 'artifact', id })}
                    onOpenRoom={id => openRoom(id)} />
                </div>
              </div>
              <div className="fam-composer">
                <div className="fam-composer-inner">
                  <Composer roomId={room.id} variant="family" placeholder="메시지 보내기" />
                  <p className="fam-hint caption faint">‘타치’라고 부르면 타치가 답해요</p>
                </div>
              </div>
            </>
          ) : (
            <div className="fam-none caption muted">대화방을 선택해 주세요.</div>
          )}
        </main>
      )}

      {panel && !narrow && <aside className="fam-panel" aria-label={panel.kind === 'mom' ? '어머니 소식' : '모임 계획'}>{panelNode}</aside>}
      {panel && narrow && (
        <>
          <div className="scrim" aria-hidden="true" onClick={closePanel} />
          <PanelSheet onClose={() => { if (!document.querySelector('.dlg-wrap')) closePanel(); }}>{panelNode}</PanelSheet>
        </>
      )}

      {invite && room && <InviteDialog roomId={room.id} onClose={() => setInvite(false)} />}
      {newRoom && <NewRoomDialog onClose={() => setNewRoom(false)} onCreated={selectRoom} />}
    </div>
  );
}

function PanelSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <div className="fam-sheet" role="dialog" aria-modal="true" aria-labelledby="fam-panel-title" ref={ref}>{children}</div>
  );
}
