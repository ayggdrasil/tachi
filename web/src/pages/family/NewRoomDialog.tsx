import { useMemo, useState } from 'react';
import type { Room } from '../../../../shared/types';
import { useTachi, tachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { relLabel } from './rooms';
import { Avatar } from '../../components/common/Avatar';
import { Dialog } from './Dialog';
import './family.css';

export function NewRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (room: Room) => void }) {
  const t = useT();
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const people = useMemo(() => Object.values(users).filter(u => u.role !== 'ai' && u.id !== meId && u.id !== 'director'), [users, meId]);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      const room = await tachi.createRoom(title.trim(), [...picked]);
      onCreated(room);
      onClose();
    } catch {
      setErr(t('fam.newRoomFail'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('fam.newRoom')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('fam.cancel')}</button><button className="btn btn-primary" onClick={create} disabled={!title.trim() || busy}>{t('fam.create')}</button></>}>
      <label className="caption muted" htmlFor="fam-newroom-title">{t('fam.roomName')}</label>
      <input id="fam-newroom-title" data-autofocus className="input fam-mb" value={title} onChange={e => setTitle(e.target.value)}
        placeholder={t('fam.roomNamePh')} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void create(); }} />
      <p className="caption muted">{t('fam.withWho')}</p>
      <ul className="fam-contacts">
        {people.map(u => (
          <li key={u.id}>
            <label className="fam-contact fam-check">
              <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
              <Avatar user={u} size={32} />
              <span className="fam-contact-main"><span className="fam-contact-name">{u.name} <span className="muted">· {relLabel(u.relation, t)}</span></span></span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="caption" role="alert">{err}</p>}
    </Dialog>
  );
}
