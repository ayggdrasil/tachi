import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { tachi, useTachi } from '../../lib/store';
import './common.css';

export function ModelSwitcher({ compact }: { compact?: boolean }) {
  const models = useTachi(s => s.models);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!models) return <span className="faint caption">모델 불러오는 중…</span>;
  const active = models.options.find(o => o.key === models.active);

  const list = (
    <div className="ms-list" role="listbox" aria-label="모델 선택">
      {models.options.map(o => (
        <button key={o.key} type="button" role="option" aria-selected={o.key === models.active} className="ms-row"
          disabled={!o.available}
          onClick={() => { if (o.key !== models.active) tachi.setModel(o.key); setOpen(false); }}>
          <span className="ms-check">{o.key === models.active && <Check size={16} />}</span>
          <span className="ms-label">{o.label}</span>
          <span className="ms-sub">{o.available ? '' : '키 없음'}</span>
        </button>
      ))}
    </div>
  );

  if (!compact) return <div className="ms">{list}</div>;
  return (
    <div className="ms" ref={ref}>
      <button type="button" className="ms-pill" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {active?.label ?? '모델'}<ChevronDown size={14} />
      </button>
      {open && <div className="ms-menu">{list}</div>}
    </div>
  );
}
