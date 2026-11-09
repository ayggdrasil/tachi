import { useEffect, useState } from 'react';
import { MessageCircle, Images, Settings, CircleHelp } from 'lucide-react';
import { SENIOR_ROOM_ID } from '../../../../shared/constants';
import type { Room } from '../../../../shared/types';
import { initTachi, isEmbedded, resolvePersona, tachi, useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';
import { Toasts } from '../../components/common/Toasts';
import { roomDisplayName } from '../../components/common/roomName';
import { SeniorChat } from './SeniorChat';
import { MemoryAlbum } from './MemoryAlbum';
import { PrivacySettings } from './PrivacySettings';
import { HelpSheet } from './HelpSheet';
import { RoomSwitcherButton, RoomSwitcherSheet } from './RoomSwitcher';
import { useRoomUnread } from './roomUnread';
import './senior.css';

type Tab = 'chat' | 'album' | 'settings';
const TABS: { id: Tab; key: string; Icon: typeof MessageCircle }[] = [
  { id: 'chat', key: 'tab.chat', Icon: MessageCircle },
  { id: 'album', key: 'tab.album', Icon: Images },
  { id: 'settings', key: 'tab.settings', Icon: Settings },
];

export default function SeniorApp() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('chat');
  const [help, setHelp] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [roomId, setRoomId] = useState<string>(SENIOR_ROOM_ID);
  const [opened, setOpened] = useState<Room | null>(null);   // a just-created dm, until the room:upsert arrives
  const status = useTachi(s => s.status);
  const error = useTachi(s => s.error);
  const rooms = useTachi(s => s.rooms);
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const persona = resolvePersona('mom') ?? 'mom';
  const embedded = isEmbedded();

  useEffect(() => { initTachi(persona); }, [persona]);

  const ready = status === 'ready';
  const known = rooms.find(r => r.id === roomId) ?? (opened?.id === roomId ? opened : undefined);
  // A room that vanished (demo reset, language switch) falls back to Tachi.
  const currentId = !ready || known || roomId === SENIOR_ROOM_ID ? roomId : SENIOR_ROOM_ID;
  const unread = useRoomUnread(currentId, tab === 'chat' && !switcher);
  const otherUnread = Object.entries(unread).reduce((n, [id, c]) => (id === currentId ? n : n + c), 0);
  const roomName = roomDisplayName(known, meId, users, t) || t('rooms.tachiName');

  const select = (r: Room) => { setOpened(r); setRoomId(r.id); setSwitcher(false); setTab('chat'); };
  const openDm = async (userId: string) => {
    try { select(await tachi.openDm(userId)); } catch { /* the switcher shows the error when started from there */ }
  };
  const statusText = status === 'ready' ? t('status.ready') : status === 'error' ? t('status.error') : t('status.connecting');

  return (
    <div className={`senior sa-shell ${embedded ? 'sa-embedded' : ''}`}>
      <div className="sa-app">
        <header className="sa-header">
          {tab === 'chat' && ready ? (
            <RoomSwitcherButton name={roomName} status={statusText} otherUnread={otherUnread} onClick={() => setSwitcher(true)} />
          ) : (
            <div className="sa-brand">
              <span className="sa-word">{t('common.tachi')}</span>
              <span className="sa-status"><i aria-hidden />{statusText}</span>
            </div>
          )}
          <button type="button" className="sa-icon-btn" aria-label={t('help.title')} aria-haspopup="dialog" onClick={() => setHelp(true)}><CircleHelp size={24} /></button>
        </header>

        <main className="sa-main">
          {status === 'error' ? (
            <div className="sa-center" role="alert">
              <p className="sa-center-t">{t('senior.connFail')}</p>
              <p className="muted">{error ?? t('senior.tryLater')}</p>
              <button type="button" className="btn btn-primary" onClick={() => initTachi(persona, true)}>{t('common.retry')}</button>
            </div>
          ) : !ready ? (
            <div className="sa-center" role="status"><p className="sa-center-t">{t('senior.waking')}</p></div>
          ) : tab === 'chat' ? (
            <SeniorChat roomId={currentId} onOpenDm={openDm} />
          ) : tab === 'album' ? (
            <MemoryAlbum onAskTachi={() => { setRoomId(SENIOR_ROOM_ID); setTab('chat'); }} />
          ) : (
            <PrivacySettings />
          )}
        </main>

        <nav className="sa-tabs" aria-label={t('tab.menu')}>
          {TABS.map(({ id, key, Icon }) => (
            <button key={id} type="button" className="sa-tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon size={26} strokeWidth={tab === id ? 2.4 : 1.8} /><span>{t(key)}</span>
            </button>
          ))}
        </nav>
      </div>
      {switcher && <RoomSwitcherSheet currentId={currentId} unread={unread} onSelect={select} onClose={() => setSwitcher(false)} />}
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      <Toasts />
    </div>
  );
}
