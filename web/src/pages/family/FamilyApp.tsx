import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, HeartHandshake, MoreHorizontal, UserPlus, X } from 'lucide-react';
import { FAMILY_ROOM_ID } from '../../../../shared/constants';
import { initTachi, isEmbedded, rememberPersona, resolvePersona, useTachi } from '../../lib/store';
import { MessageList } from '../../components/chat/MessageList';
import { Composer } from '../../components/chat/Composer';
import { Avatar } from '../../components/common/Avatar';
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
  const [seen, setSeen] = useState<Record<string, number>>({});

  const visibleRooms = useMemo(() => rooms.filter(r => r.type !== 'tachi'), [rooms]);

  // pick a default room once rooms are known
  useEffect(() => {
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

  const switchPersona = useCallback((id: string) => {
    rememberPersona(id);
    const q = new URLSearchParams(sp);
    q.set('as', id);
    setActiveId(null);
    setSeen({});
    nav({ search: `?${q.toString()}` }, { replace: true });
  }, [nav, sp]);

  const selectRoom = (id: string) => { setActiveId(id); setView('chat'); setPanel(null); };
  const togglePanel = (p: Panel) => setPanel(cur => (cur && p && cur.kind === p.kind && (cur.kind === 'mom' || (p.kind === 'artifact' && cur.kind === 'artifact' && cur.id === p.id)) ? null : p));

  // Esc closes panel
  useEffect(() => {
    if (!panel) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) setPanel(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [panel]);

  if (status !== 'ready' || !me) {
    return (
      <div className="fam-boot" role="status">
        <span className="fam-mark">타치</span>
        <p className="caption muted">{status === 'error' ? '연결하지 못했어요. 서버가 켜져 있는지 확인해 주세요.' : '가족방에 연결하는 중…'}</p>
      </div>
    );
  }

  const panelNode = panel && (
    <div className="fam-panel-body">
      <header className="fam-panel-head">
        <h2 className="fam-panel-title">{panel.kind === 'mom' ? '어머니 소식' : '모임 계획'}</h2>
        <button className="btn btn-icon" onClick={() => setPanel(null)} aria-label="패널 닫기"><X size={18} strokeWidth={1.5} /></button>
      </header>
      <div className="fam-panel-scroll">
        {panel.kind === 'mom' ? <MomPanel /> : <ArtifactPanel artifactId={panel.id} />}
      </div>
    </div>
  );

  const showSidebar = !narrow || view === 'list';

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
            <h1 className="fam-head-title">{room?.title ?? '대화방'}</h1>
            <div className="fam-stack" aria-label={`참여자 ${members.length}명`}>
              {members.slice(0, 5).map(u => <span key={u.id} className="fam-stack-i"><Avatar user={u} size={24} /></span>)}
              {members.length > 5 && <span className="fam-stack-more">+{members.length - 5}</span>}
            </div>
            <span className="fam-spacer" />
            {room?.type === 'family' && (
              <button className="btn btn-ghost fam-head-btn" onClick={() => setInvite(true)} aria-label="초대">
                <UserPlus size={16} strokeWidth={1.5} /><span className="fam-head-label">초대</span>
              </button>
            )}
            <button className={`btn btn-ghost fam-head-btn ${panel?.kind === 'mom' ? 'is-on' : ''}`} onClick={() => togglePanel({ kind: 'mom' })}
              aria-pressed={panel?.kind === 'mom'} aria-label="어머니 소식">
              <HeartHandshake size={16} strokeWidth={1.5} /><span className="fam-head-label">어머니 소식</span>
            </button>
            <div className="fam-more">
              <button className="btn btn-icon" onClick={() => setMore(v => !v)} aria-label="더 보기" aria-expanded={more}><MoreHorizontal size={18} strokeWidth={1.5} /></button>
              {more && (
                <div className="fam-menu fam-more-menu" onMouseLeave={() => setMore(false)}>
                  <p className="caption muted fam-menu-h">참여자 {members.length}명</p>
                  {members.map(u => (
                    <div key={u.id} className="fam-menu-item"><Avatar user={u} size={22} /><span>{u.name} · {u.relation === '본인' ? '어머니' : u.relation}</span></div>
                  ))}
                  <button className="fam-menu-item fam-menu-close" onClick={() => setMore(false)}>닫기</button>
                </div>
              )}
            </div>
          </header>

          {room ? (
            <>
              <div className="fam-thread">
                <div className="fam-thread-inner">
                  <MessageList roomId={room.id} variant="family"
                    onOpenArtifact={id => { setPanel({ kind: 'artifact', id }); }} />
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
          <div className="scrim" onClick={() => setPanel(null)} />
          <aside className="fam-sheet" aria-label={panel.kind === 'mom' ? '어머니 소식' : '모임 계획'}>{panelNode}</aside>
        </>
      )}

      {invite && room && <InviteDialog roomId={room.id} onClose={() => setInvite(false)} />}
      {newRoom && <NewRoomDialog onClose={() => setNewRoom(false)} onCreated={selectRoom} />}
    </div>
  );
}
