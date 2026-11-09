import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, MessageCirclePlus, Plus } from 'lucide-react';
import type { ID, Room, User } from '../../../../shared/types';
import { useT } from '../../lib/i18n';
import { Avatar } from '../../components/common/Avatar';
import { ModelSwitcher } from '../../components/common/ModelSwitcher';
import { RoomRow, relLabel, useRoomGroups } from './rooms';

interface Props {
  me: User | null;
  users: Record<ID, User>;
  family: User[];
  rooms: Room[];
  activeId: string | null;
  unread: Record<string, number>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewDm: () => void;
  onSwitchPersona: (id: string) => void;
  full?: boolean;
}

export function Sidebar({ me, users, family, rooms, activeId, unread, onSelect, onNew, onNewDm, onSwitchPersona, full }: Props) {
  const t = useT();
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return;
    box.current?.querySelector<HTMLElement>('#fam-persona-menu [aria-pressed="true"]')?.focus({ preventScroll: true });
    const on = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', on);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', on); document.removeEventListener('keydown', key); };
  }, [menu]);

  const { families, dms, sides } = useRoomGroups(rooms);
  const meId = me?.id ?? null;
  const row = (r: Room) => <RoomRow key={r.id} room={r} meId={meId} users={users} active={r.id === activeId} unread={unread[r.id] ?? 0} onSelect={onSelect} />;

  const Root = full ? 'main' : 'aside';
  return (
    <Root className={`fam-side ${full ? 'is-full' : ''}`} aria-label={t('fam.roomList')}>
      {full && <h1 className="sr-only">{t('fam.roomList')}</h1>}
      <div className="fam-side-head">
        <span className="fam-mark">{t('app.name')}</span>
        <div className="fam-persona" ref={box}>
          <button ref={triggerRef} className="fam-persona-btn" onClick={() => setMenu(v => !v)} aria-expanded={menu} aria-controls="fam-persona-menu">
            {me && <Avatar user={me} size={22} />}
            <span>{me ? `${me.shortName} · ${relLabel(me.relation, t)}` : t('fam.connecting')}</span>
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
          </button>
          {menu && (
            <ul className="fam-menu" id="fam-persona-menu">
              {family.map(u => (
                <li key={u.id}>
                  <button aria-pressed={u.id === me?.id} className="fam-menu-item" onClick={() => { setMenu(false); onSwitchPersona(u.id); }}>
                    <Avatar user={u} size={22} />
                    <span>{u.shortName} · {relLabel(u.relation, t)}</span>
                    {u.id === me?.id && <Check size={14} strokeWidth={1.5} aria-hidden />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <nav className="fam-side-scroll">
        <h2 className="fam-sec">{t('fam.secRooms')}</h2>
        <ul className="fam-rooms">
          {families.map(row)}
          <li>
            <button className="fam-room fam-new" onClick={onNew}><Plus size={16} strokeWidth={1.5} aria-hidden /><span className="fam-room-title">{t('fam.newRoom')}</span></button>
          </li>
        </ul>
        <h2 className="fam-sec">{t('fam.secDms')}</h2>
        <ul className="fam-rooms">
          {dms.map(row)}
          <li>
            <button className="fam-room fam-new" onClick={onNewDm}><MessageCirclePlus size={16} strokeWidth={1.5} aria-hidden /><span className="fam-room-title">{t('fam.newDm')}</span></button>
          </li>
        </ul>
        {sides.length > 0 && (
          <>
            <h2 className="fam-sec">{t('fam.secSides')}</h2>
            <ul className="fam-rooms">{sides.map(row)}</ul>
          </>
        )}
      </nav>

      <div className="fam-side-foot">
        <ModelSwitcher compact />
      </div>
    </Root>
  );
}
