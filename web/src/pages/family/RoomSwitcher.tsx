import { useRef } from 'react';
import { MessageCirclePlus, Plus, X } from 'lucide-react';
import type { ID, Room, User } from '../../../../shared/types';
import { useT } from '../../lib/i18n';
import { useModal } from '../../components/common/useModal';
import { RoomRow, useRoomGroups } from './rooms';
import './RoomSwitcher.css';

interface Props {
  rooms: Room[];
  meId: ID | null;
  users: Record<ID, User>;
  activeId: string | null;
  unread: Record<string, number>;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewDm: () => void;
  onClose: () => void;
}

/** Bottom sheet listing family rooms, direct messages and Tachi side chats (mobile / embedded header). */
export function RoomSwitcher({ rooms, meId, users, activeId, unread, onSelect, onNew, onNewDm, onClose }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  const { families, dms, sides } = useRoomGroups(rooms);
  const pick = (id: string) => { onSelect(id); onClose(); };
  const row = (r: Room) => <RoomRow key={r.id} room={r} meId={meId} users={users} active={r.id === activeId} unread={unread[r.id] ?? 0} onSelect={pick} />;
  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div className="rs" role="dialog" aria-modal="true" aria-labelledby="rs-title" ref={ref}>
        <header className="rs-head">
          <h2 className="rs-title" id="rs-title">{t('fam.switchTitle')}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label={t('fam.close')}><X size={18} strokeWidth={1.5} /></button>
        </header>
        <div className="rs-scroll">
          <h3 className="fam-sec">{t('fam.secRooms')}</h3>
          <ul className="fam-rooms">
            {families.map(row)}
            <li><button className="fam-room fam-new" onClick={() => { onClose(); onNew(); }}><Plus size={16} strokeWidth={1.5} aria-hidden /><span className="fam-room-title">{t('fam.newRoom')}</span></button></li>
          </ul>
          <h3 className="fam-sec">{t('fam.secDms')}</h3>
          <ul className="fam-rooms">
            {dms.map(row)}
            <li><button className="fam-room fam-new" onClick={() => { onClose(); onNewDm(); }}><MessageCirclePlus size={16} strokeWidth={1.5} aria-hidden /><span className="fam-room-title">{t('fam.newDm')}</span></button></li>
          </ul>
          {sides.length > 0 && (
            <>
              <h3 className="fam-sec">{t('fam.secSides')}</h3>
              <ul className="fam-rooms">{sides.map(row)}</ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
