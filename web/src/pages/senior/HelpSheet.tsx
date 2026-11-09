import { useRef } from 'react';
import { Camera, Lock, Mic, Search, Users, Volume2, X } from 'lucide-react';
import { useModal } from '../../components/common/useModal';
import { useT } from '../../lib/i18n';

const ROWS = [
  { Icon: Camera, key: 'help.photo' },
  { Icon: Mic, key: 'help.mic' },
  { Icon: Search, key: 'help.search' },
  { Icon: Lock, key: 'help.private' },
  { Icon: Volume2, key: 'help.speaker' },
  { Icon: Users, key: 'help.rooms' },
];

export function HelpSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden />
      <div className="sa-sheet" role="dialog" aria-modal="true" aria-labelledby="sa-help-title" ref={ref}>
        <div className="sa-sheet-bar">
          <button type="button" className="sa-icon-btn" aria-label={t('common.close')} onClick={onClose}><X size={24} /></button>
        </div>
        <div className="sa-sheet-body">
          <h2 className="sa-sheet-t" id="sa-help-title">{t('help.title')}</h2>
          <ul className="sa-help">
            {ROWS.map(({ Icon, key }) => <li key={key}><Icon size={20} aria-hidden />{t(key)}</li>)}
          </ul>
          <button type="button" className="btn btn-primary sa-wide" data-autofocus onClick={onClose}>{t('help.ok')}</button>
        </div>
      </div>
    </>
  );
}
