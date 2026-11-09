import { Lock } from 'lucide-react';
import type { Memory } from '../../../../shared/types';
import { useT } from '../../lib/i18n';
import './MemoryTile.css';

export function MemoryTile({ memory, onClick }: { memory: Memory; onClick?: () => void }) {
  const t = useT();
  const meta = [memory.era ?? (memory.year ? t('mem.year', { year: memory.year }) : ''), memory.place].filter(Boolean).join(' · ');
  const priv = memory.visibility === 'private';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="mt" type={onClick ? 'button' : undefined} onClick={onClick} aria-label={`${memory.title}${priv ? ', ' + t('vis.private') : ''}`}>
      <span className="mt-photo">
        {memory.photoUrl ? <img src={memory.photoUrl} alt="" loading="lazy" /> : <span className="mt-noimg" aria-hidden>{memory.title.slice(0, 1)}</span>}
        {priv && <span className="mt-lock"><Lock size={12} />{t('vis.private')}</span>}
      </span>
      <span className="mt-title">{memory.title}</span>
      {meta && <span className="mt-meta">{meta}</span>}
    </Tag>
  );
}
