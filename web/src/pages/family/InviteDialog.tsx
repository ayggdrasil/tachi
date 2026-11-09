import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTachi, tachi } from '../../lib/store';
import { Avatar } from '../../components/common/Avatar';
import { Dialog } from './Dialog';
import './family.css';

export function InviteDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const contacts = useTachi(s => s.contacts);
  const users = useTachi(s => s.users);
  const room = useTachi(s => s.rooms.find(r => r.id === roomId));
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(t) || c.relation.includes(t) || c.phone.replace(/-/g, '').includes(t.replace(/-/g, '')));
  }, [contacts, q]);

  return (
    <Dialog title="가족·친지 초대" onClose={onClose}>
      <div className="fam-search">
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <input data-autofocus className="fam-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder="이름, 관계, 번호로 찾기" aria-label="연락처 검색" />
      </div>
      <ul className="fam-contacts">
        {list.map(c => {
          const inRoom = (c.userId && room?.memberIds.includes(c.userId)) || sent.has(c.id);
          const user = c.userId ? users[c.userId] : undefined;
          return (
            <li key={c.id} className="fam-contact">
              {user ? <Avatar user={user} size={36} /> : <span className="fam-initial" aria-hidden>{c.name.slice(0, 1)}</span>}
              <span className="fam-contact-main">
                <span className="fam-contact-name">{c.name} <span className="muted">· {c.relation}</span></span>
                <span className="mono faint">{c.phone}</span>
              </span>
              {inRoom ? (
                <button className="btn" disabled>참여 중</button>
              ) : (
                <button className="btn" onClick={() => { tachi.invite(roomId, c.id); setSent(new Set(sent).add(c.id)); }}>초대</button>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="caption faint fam-contacts-empty">찾는 분이 없어요.</li>}
      </ul>
      <p className="caption faint fam-foot">데모용 가상 전화번호부예요</p>
    </Dialog>
  );
}
