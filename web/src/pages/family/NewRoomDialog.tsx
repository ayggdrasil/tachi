import { useMemo, useState } from 'react';
import { useTachi, tachi } from '../../lib/store';
import { Avatar } from '../../components/common/Avatar';
import { Dialog } from './Dialog';
import './family.css';

export function NewRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (roomId: string) => void }) {
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
      onCreated(room.id);
      onClose();
    } catch {
      setErr('대화방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
      setBusy(false);
    }
  };

  return (
    <Dialog title="새 대화방" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>취소</button><button className="btn btn-primary" onClick={create} disabled={!title.trim() || busy}>만들기</button></>}>
      <label className="caption muted" htmlFor="fam-newroom-title">대화방 이름</label>
      <input id="fam-newroom-title" data-autofocus className="input fam-mb" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="예: 어머니 생신 준비" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void create(); }} />
      <p className="caption muted">함께할 가족</p>
      <ul className="fam-contacts">
        {people.map(u => (
          <li key={u.id}>
            <label className="fam-contact fam-check">
              <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
              <Avatar user={u} size={32} />
              <span className="fam-contact-main"><span className="fam-contact-name">{u.name} <span className="muted">· {u.relation === '본인' ? '어머니' : u.relation}</span></span></span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="caption" role="alert">{err}</p>}
    </Dialog>
  );
}
