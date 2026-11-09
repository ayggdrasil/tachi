import { useEffect, useState } from 'react';
import { MessageCircle, Images, Settings, CircleHelp } from 'lucide-react';
import { initTachi, isEmbedded, resolvePersona, useTachi } from '../../lib/store';
import { Toasts } from '../../components/common/Toasts';
import { SeniorChat } from './SeniorChat';
import { MemoryAlbum } from './MemoryAlbum';
import { PrivacySettings } from './PrivacySettings';
import { HelpSheet } from './HelpSheet';
import './senior.css';

type Tab = 'chat' | 'album' | 'settings';
const TABS: { id: Tab; label: string; Icon: typeof MessageCircle }[] = [
  { id: 'chat', label: '대화', Icon: MessageCircle },
  { id: 'album', label: '추억', Icon: Images },
  { id: 'settings', label: '설정', Icon: Settings },
];

export default function SeniorApp() {
  const [tab, setTab] = useState<Tab>('chat');
  const [help, setHelp] = useState(false);
  const status = useTachi(s => s.status);
  const error = useTachi(s => s.error);
  const persona = resolvePersona('mom') ?? 'mom';
  const embedded = isEmbedded();

  useEffect(() => { initTachi(persona); }, [persona]);

  return (
    <div className={`senior sa-shell ${embedded ? 'sa-embedded' : ''}`}>
      <div className="sa-app">
        <header className="sa-header">
          <div className="sa-brand">
            <span className="sa-word">타치</span>
            <span className="sa-status"><i aria-hidden />{status === 'ready' ? '함께 있어요' : status === 'error' ? '연결 안 됨' : '연결 중…'}</span>
          </div>
          <button type="button" className="sa-icon-btn" aria-label="도움말" aria-haspopup="dialog" onClick={() => setHelp(true)}><CircleHelp size={24} /></button>
        </header>

        <main className="sa-main">
          {status === 'error' ? (
            <div className="sa-center" role="alert">
              <p className="sa-center-t">연결이 잘 안 돼요</p>
              <p className="muted">{error ?? '잠시 후 다시 해 볼까요?'}</p>
              <button type="button" className="btn btn-primary" onClick={() => initTachi(persona)}>다시 시도</button>
            </div>
          ) : status !== 'ready' ? (
            <div className="sa-center" role="status"><p className="sa-center-t">타치를 깨우는 중…</p></div>
          ) : tab === 'chat' ? (
            <SeniorChat />
          ) : tab === 'album' ? (
            <MemoryAlbum onAskTachi={() => setTab('chat')} />
          ) : (
            <PrivacySettings />
          )}
        </main>

        <nav className="sa-tabs" aria-label="메뉴">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className="sa-tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <Icon size={26} strokeWidth={tab === id ? 2.4 : 1.8} /><span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {help && <HelpSheet onClose={() => setHelp(false)} />}
      <Toasts />
    </div>
  );
}

