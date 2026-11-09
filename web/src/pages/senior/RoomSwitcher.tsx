import { useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Users, X } from 'lucide-react';
import type { ID, Message, Room, User } from '../../../../shared/types';
import { TACHI_ID } from '../../../../shared/constants';
import { tachi, useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { Avatar } from '../../components/common/Avatar';
import { useModal } from '../../components/common/useModal';
import { roomDisplayName } from '../../components/common/roomName';

/** Big header button: current room name + chevron (+ a count when other rooms have new messages). */
export function RoomSwitcherButton({ name, status, otherUnread, onClick }: { name: string; status: string; otherUnread: number; onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" className="sa-roombtn" aria-haspopup="dialog" onClick={onClick}
      aria-label={t('rooms.switchAria', { name }) + (otherUnread > 0 ? ' · ' + t('rooms.unreadAria', { n: otherUnread }) : '')}>
      <span className="sa-roombtn-main">
        <span className="sa-roombtn-name">{name}</span>
        <ChevronDown size={24} aria-hidden />
        {otherUnread > 0 && <span className="sa-badge" aria-hidden>{otherUnread}</span>}
      </span>
      <span className="sa-status"><i aria-hidden />{status}</span>
    </button>
  );
}

function preview(m: Message | undefined, t: ReturnType<typeof useT>): string {
  if (!m) return '';
  if (m.kind === 'photo') return t('rooms.photoMsg');
  if (m.kind === 'text' || m.kind === 'system') return m.text;
  return m.text || t('rooms.cardMsg');
}

function Glyph({ room, peer }: { room?: Room; peer?: User }) {
  if (peer) return <Avatar user={peer} size={48} decorative />;
  if (room?.type === 'side') return <span className="sa-glyph"><CalendarDays size={24} aria-hidden /></span>;
  return <span className="sa-glyph"><Users size={24} aria-hidden /></span>;
}

interface RowProps {
  title: string; sub: string; unread: number; current: boolean; busy?: boolean;
  glyph: React.ReactNode; onClick: () => void; aria?: string; autoFocus?: boolean;
}
function Row({ title, sub, unread, current, busy, glyph, onClick, aria, autoFocus }: RowProps) {
  const t = useT();
  return (
    <li>
      <button type="button" className="sa-room" aria-current={current ? 'true' : undefined} aria-busy={busy || undefined} disabled={busy}
        aria-label={aria} data-autofocus={autoFocus ? '' : undefined} onClick={onClick}>
        {glyph}
        <span className="sa-room-text">
          <span className="sa-room-name">{title}</span>
          {sub && <span className="sa-room-sub">{sub}</span>}
        </span>
        {unread > 0 && <span className="sa-badge" role="img" aria-label={t('rooms.unreadAria', { n: unread })}>{unread}</span>}
        {current && <Check size={24} aria-hidden className="sa-room-check" />}
      </button>
    </li>
  );
}

export function RoomSwitcherSheet({ currentId, unread, onSelect, onClose }: {
  currentId: ID; unread: Record<ID, number>; onSelect: (room: Room) => void; onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  const rooms = useTachi(s => s.rooms);
  const messages = useTachi(s => s.messages);
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const [busyId, setBusyId] = useState<ID | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mine = rooms.filter(r => !meId || r.memberIds.includes(meId));
  const last = (id: ID) => { const l = messages[id]; return l && l[l.length - 1]; };
  const byRecent = (a: Room, b: Room) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt);
  const tachiRoom = mine.find(r => r.type === 'tachi');
  const familyRooms = mine.filter(r => r.type === 'family').sort(byRecent);
  const sideRooms = mine.filter(r => r.type === 'side').sort(byRecent);
  const dmRooms = mine.filter(r => r.type === 'dm');
  const dmWith = (uid: ID) => dmRooms.find(r => r.memberIds.includes(uid));
  const people = Object.values(users).filter(u => u.role === 'family' && u.id !== meId && u.id !== TACHI_ID);

  const openPerson = async (u: User) => {
    const existing = dmWith(u.id);
    if (existing) { onSelect(existing); return; }
    setErr(null); setBusyId(u.id);
    try { onSelect(await tachi.openDm(u.id)); } catch { setErr(t('rooms.dmFailed', { name: u.shortName })); } finally { setBusyId(null); }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sa-sheet sa-sheet-full" role="dialog" aria-modal="true" aria-labelledby="sa-rooms-title" ref={ref}>
        <div className="sa-sheet-bar">
          <h2 className="sa-sheet-t sa-rooms-t" id="sa-rooms-title">{t('rooms.title')}</h2>
          <button type="button" className="sa-icon-btn" aria-label={t('common.close')} onClick={onClose}><X size={24} /></button>
        </div>
        <div className="sa-sheet-body sa-rooms">
          {err && <p className="sa-err" role="alert">{err}</p>}
          {tachiRoom && (
            <section aria-labelledby="sa-r-tachi">
              <h3 className="sa-rooms-h" id="sa-r-tachi">{t('rooms.secTachi')}</h3>
              <ul className="sa-room-list">
                <Row title={t('rooms.tachiName')} sub={preview(last(tachiRoom.id), t) || t('rooms.tachiSub')} unread={unread[tachiRoom.id] ?? 0}
                  current={currentId === tachiRoom.id} autoFocus={currentId === tachiRoom.id}
                  glyph={<Avatar user={users[TACHI_ID]} size={48} decorative />} onClick={() => onSelect(tachiRoom)} />
              </ul>
            </section>
          )}
          {familyRooms.length > 0 && (
            <section aria-labelledby="sa-r-fam">
              <h3 className="sa-rooms-h" id="sa-r-fam">{t('rooms.secFamily')}</h3>
              <ul className="sa-room-list">
                {familyRooms.map(r => (
                  <Row key={r.id} title={roomDisplayName(r, meId, users, t)} sub={preview(last(r.id), t) || t('rooms.familySub')}
                    unread={unread[r.id] ?? 0} current={currentId === r.id} glyph={<Glyph room={r} />} onClick={() => onSelect(r)} />
                ))}
              </ul>
            </section>
          )}
          {people.length > 0 && (
            <section aria-labelledby="sa-r-dm">
              <h3 className="sa-rooms-h" id="sa-r-dm">{t('rooms.secPeople')}</h3>
              <ul className="sa-room-list">
                {people.map(u => {
                  const dm = dmWith(u.id);
                  return (
                    <Row key={u.id} title={u.shortName} aria={t('rooms.messageName', { name: u.shortName })}
                      sub={(dm && preview(last(dm.id), t)) || t('rooms.startChat', { relation: u.relation })}
                      unread={dm ? unread[dm.id] ?? 0 : 0} current={!!dm && currentId === dm.id} busy={busyId === u.id}
                      glyph={<Avatar user={u} size={48} decorative />} onClick={() => openPerson(u)} />
                  );
                })}
              </ul>
            </section>
          )}
          {sideRooms.length > 0 && (
            <section aria-labelledby="sa-r-side">
              <h3 className="sa-rooms-h" id="sa-r-side">{t('rooms.secSide')}</h3>
              <ul className="sa-room-list">
                {sideRooms.map(r => (
                  <Row key={r.id} title={roomDisplayName(r, meId, users, t)} sub={preview(last(r.id), t) || t('rooms.sideSub')}
                    unread={unread[r.id] ?? 0} current={currentId === r.id} glyph={<Glyph room={r} />} onClick={() => onSelect(r)} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
