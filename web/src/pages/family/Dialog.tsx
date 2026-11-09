import { useRef, type ReactNode } from 'react';
import { useModal } from '../../components/common/useModal';
import { X } from 'lucide-react';
import { useT } from '../../lib/i18n';
import './Dialog.css';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ title, onClose, children, footer, width = 440 }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, onClose);
  return (
    <div className="dlg-wrap">
      <div className="scrim dlg-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={ref} className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{ maxWidth: width }}>
        <header className="dlg-head">
          <h2 className="dlg-title">{title}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label={t('fam.close')}><X size={18} strokeWidth={1.5} /></button>
        </header>
        <div className="dlg-body">{children}</div>
        {footer && <footer className="dlg-foot">{footer}</footer>}
      </div>
    </div>
  );
}
