import { useTachi } from '../../lib/store';
import './common.css';

export function Toasts() {
  const toasts = useTachi(s => s.toasts);
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
