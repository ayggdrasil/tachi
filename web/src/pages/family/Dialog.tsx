import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './Dialog.css';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Dialog({ title, onClose, children, footer, width = 440 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const auto = el?.querySelector<HTMLElement>('[data-autofocus]');
    (auto ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && el) {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(x => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="dlg-wrap">
      <div className="scrim dlg-scrim" onClick={onClose} />
      <div ref={ref} className="dlg" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{ maxWidth: width }}>
        <header className="dlg-head">
          <h2 className="dlg-title">{title}</h2>
          <button className="btn btn-icon" onClick={onClose} aria-label="닫기"><X size={18} strokeWidth={1.5} /></button>
        </header>
        <div className="dlg-body">{children}</div>
        {footer && <footer className="dlg-foot">{footer}</footer>}
      </div>
    </div>
  );
}
