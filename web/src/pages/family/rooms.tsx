import { useMemo } from 'react';
import type { ID, Room, User } from '../../../../shared/types';
import { Avatar } from '../../components/common/Avatar';
import { dmPeerId, roomDisplayName } from '../../components/common/roomName';
import { useT } from '../../lib/i18n';

export interface RoomGroups { families: Room[]; dms: Room[]; sides: Room[] }

/** Sections shared by the desktop sidebar and the room switcher sheet (most recent first). */
export function useRoomGroups(rooms: Room[]): RoomGroups {
  return useMemo(() => {
    const byRecent = (a: Room, b: Room) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
    return {
      families: rooms.filter(r => r.type === 'family').sort(byRecent),
      dms: rooms.filter(r => r.type === 'dm').sort(byRecent),
      sides: rooms.filter(r => r.type === 'side').sort(byRecent),
    };
  }, [rooms]);
}

/** Side-room titles are "Scheduling · Mom's birthday" (either language): split into kicker + name. */
export function splitSideTitle(title: string): { prefixed: boolean; name: string } {
  const m = /^(일정 조율|Scheduling)\s*[·:]\s*(.+)$/.exec(title);
  return m ? { prefixed: true, name: m[2] } : { prefixed: false, name: title };
}

export function RoomRow({ room, meId, users, active, unread, onSelect }: {
  room: Room; meId: ID | null; users: Record<ID, User>; active: boolean; unread: number; onSelect: (id: ID) => void;
}) {
  const t = useT();
  const peer = room.type === 'dm' ? users[dmPeerId(room, meId) ?? ''] : undefined;
  const side = room.type === 'side' ? splitSideTitle(room.title) : null;
  const label = side ? side.name : roomDisplayName(room, meId, users, t);
  return (
    <li>
      <button className={`fam-room ${active ? 'is-on' : ''}`} onClick={() => onSelect(room.id)} aria-current={active ? 'page' : undefined}>
        {peer && <Avatar user={peer} size={22} decorative />}
        <span className="fam-room-title">{label}</span>
        {side && <span className="badge">{t('fam.scheduling')}</span>}
        {unread > 0 && <span className="fam-unread"><span aria-hidden>{unread}</span><span className="sr-only">{t('fam.unreadN', { n: unread })}</span></span>}
      </button>
    </li>
  );
}

/** Display label for a relation ("본인"/"self" -> Mom; English relations get a leading capital). */
export function relLabel(rel: string, t: (k: string) => string): string {
  if (rel === '본인' || rel === 'self') return t('fam.mother');
  return rel ? rel.charAt(0).toUpperCase() + rel.slice(1) : rel;
}
