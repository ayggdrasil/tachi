import { useEffect, useState } from 'react';
import { isEmbedded } from '../../lib/store';

/** Narrow layout: < 900px, or embedded inside a Director phone frame. */
export function useIsNarrow(): boolean {
  const q = '(max-width: 899px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m || isEmbedded();
}
