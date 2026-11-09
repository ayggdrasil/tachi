import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useTachi, tachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { Avatar } from '../../components/common/Avatar';
import { Dialog } from './Dialog';
import { relLabel } from './rooms';
import './family.css';

export function InviteDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const t = useT();
  const contacts = useTachi(s => s.contacts);
  const users = useTachi(s => s.users);
  const room = useTachi(s => s.rooms.find(r => r.id === roomId));
  const [q, setQ] = useState('');
  const [sent, setSent] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    const q2 = q.trim().toLowerCase();
    if (!q2) return contacts;
    return contacts.filter(c => c.name.toLowerCase().includes(q2) || c.relation.toLowerCase().includes(q2) || c.phone.replace(/-/g, '').includes(q2.replace(/-/g, '')));
  }, [contacts, q]);

  return (
    <Dialog title={t('fam.inviteTitle')} onClose={onClose}>
      <div className="fam-search">
        <Search size={16} strokeWidth={1.5} aria-hidden />
        <input data-autofocus className="fam-search-input" value={q} onChange={e => setQ(e.target.value)} placeholder={t('fam.inviteSearch')} aria-label={t('fam.inviteSearchLabel')} />
      </div>
      <ul className="fam-contacts">
        {list.map(c => {
          const inRoom = (c.userId && room?.memberIds.includes(c.userId)) || sent.has(c.id);
          const user = c.userId ? users[c.userId] : undefined;
          return (
            <li key={c.id} className="fam-contact">
              {user ? <Avatar user={user} size={36} /> : <span className="fam-initial" aria-hidden>{c.name.slice(0, 1)}</span>}
              <span className="fam-contact-main">
                <span className="fam-contact-name">{c.name} <span className="muted">· {relLabel(c.relation, t)}</span></span>
                <span className="mono faint">{c.phone}</span>
              </span>
              {inRoom ? (
                <button className="btn" disabled>{t('fam.inRoom')}</button>
              ) : (
                <button className="btn" onClick={() => { tachi.invite(roomId, c.id); setSent(new Set(sent).add(c.id)); }}>{t('fam.invite')}</button>
              )}
            </li>
          );
        })}
        {list.length === 0 && <li className="caption faint fam-contacts-empty">{t('fam.noMatch')}</li>}
      </ul>
      <p className="caption faint fam-foot">{t('fam.phonebookNote')}</p>
    </Dialog>
  );
}
