import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import type { Room, User } from '../../../../shared/types';
import { Avatar } from '../../components/common/Avatar';
import { ModelSwitcher } from '../../components/common/ModelSwitcher';

interface Props {
  me: User | null;
  family: User[];
  rooms: Room[];
  activeId: string | null;
  unread: Record<string, number>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSwitchPersona: (id: string) => void;
  full?: boolean;
}

export function Sidebar({ me, family, rooms, activeId, unread, onSelect, onNew, onSwitchPersona, full }: Props) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const on = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', on);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', on); document.removeEventListener('keydown', key); };
  }, [menu]);

  const byRecent = (a: Room, b: Room) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
  const groups = rooms.filter(r => r.type === 'family').sort(byRecent);
  const sides = rooms.filter(r => r.type === 'side').sort(byRecent);

  const row = (r: Room) => (
    <li key={r.id}>
      <button className={`fam-room ${r.id === activeId ? 'is-on' : ''}`} onClick={() => onSelect(r.id)} aria-current={r.id === activeId ? 'page' : undefined}>
        <span className="fam-room-title">{r.title}</span>
        {r.pollId && <span className="badge">일정 조율</span>}
        {unread[r.id] > 0 && <span className="fam-unread" aria-label={`읽지 않은 메시지 ${unread[r.id]}개`}>{unread[r.id]}</span>}
      </button>
    </li>
  );

  return (
    <aside className={`fam-side ${full ? 'is-full' : ''}`} aria-label="대화방 목록">
      <div className="fam-side-head">
        <span className="fam-mark">타치</span>
        <div className="fam-persona" ref={box}>
          <button className="fam-persona-btn" onClick={() => setMenu(v => !v)} aria-haspopup="menu" aria-expanded={menu}>
            {me && <Avatar user={me} size={22} />}
            <span>{me ? `${me.shortName} · ${me.relation}` : '연결 중'}</span>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
          </button>
          {menu && (
            <ul className="fam-menu" role="menu">
              {family.map(u => (
                <li key={u.id} role="none">
                  <button role="menuitemradio" aria-checked={u.id === me?.id} className="fam-menu-item" onClick={() => { setMenu(false); onSwitchPersona(u.id); }}>
                    <Avatar user={u} size={22} />
                    <span>{u.shortName} · {u.relation}</span>
                    {u.id === me?.id && <Check size={14} strokeWidth={1.5} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <nav className="fam-side-scroll">
        <h2 className="fam-sec">대화방</h2>
        <ul className="fam-rooms">
          {groups.map(row)}
          <li>
            <button className="fam-room fam-new" onClick={onNew}><Plus size={16} strokeWidth={1.5} aria-hidden /><span className="fam-room-title">새 대화방</span></button>
          </li>
        </ul>
        {sides.length > 0 && (
          <>
            <h2 className="fam-sec">타치와 1:1</h2>
            <ul className="fam-rooms">{sides.map(row)}</ul>
          </>
        )}
      </nav>

      <div className="fam-side-foot">
        <ModelSwitcher compact />
      </div>
    </aside>
  );
}
