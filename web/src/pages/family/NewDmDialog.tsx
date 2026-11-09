import { useMemo, useState } from 'react';
import type { Room } from '../../../../shared/types';
import { useTachi, tachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { Avatar } from '../../components/common/Avatar';
import { Dialog } from './Dialog';
import { relLabel } from './rooms';
import './family.css';

/** "Message a family member": pick a person → get-or-create the 1:1 room. */
export function NewDmDialog({ onClose, onOpened }: { onClose: () => void; onOpened: (room: Room) => void }) {
  const t = useT();
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const people = useMemo(() => Object.values(users).filter(u => u.role !== 'ai' && u.id !== meId && u.id !== 'director'), [users, meId]);

  const open = async (id: string) => {
    if (busy) return;
    setBusy(id); setErr('');
    try { const room = await tachi.openDm(id); onOpened(room); onClose(); }
    catch { setErr(t('fam.dmFail')); setBusy(null); }
  };

  return (
    <Dialog title={t('fam.dmTitle')} onClose={onClose}>
      <p className="caption muted fam-mb">{t('fam.dmHelp')}</p>
      <ul className="fam-contacts">
        {people.map((u, i) => (
          <li key={u.id}>
            <button className="fam-contact fam-pick" data-autofocus={i === 0 ? true : undefined} disabled={!!busy} onClick={() => void open(u.id)}>
              <Avatar user={u} size={32} decorative />
              <span className="fam-contact-main"><span className="fam-contact-name">{u.name} <span className="muted">· {relLabel(u.relation, t)}</span></span></span>
            </button>
          </li>
        ))}
      </ul>
      {err && <p className="caption" role="alert">{err}</p>}
    </Dialog>
  );
}
