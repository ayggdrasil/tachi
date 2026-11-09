import { Lock } from 'lucide-react';
import type { Memory } from '../../../../shared/types';
import './MemoryTile.css';

export function MemoryTile({ memory, onClick }: { memory: Memory; onClick?: () => void }) {
  const meta = [memory.era ?? (memory.year ? `${memory.year}년` : ''), memory.place].filter(Boolean).join(' · ');
  const priv = memory.visibility === 'private';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className="mt" type={onClick ? 'button' : undefined} onClick={onClick} aria-label={`${memory.title}${priv ? ', 나만 보기' : ''}`}>
      <span className="mt-photo">
        {memory.photoUrl ? <img src={memory.photoUrl} alt="" loading="lazy" /> : <span className="mt-noimg" aria-hidden>{memory.title.slice(0, 1)}</span>}
        {priv && <span className="mt-lock"><Lock size={12} />나만 보기</span>}
      </span>
      <span className="mt-title">{memory.title}</span>
      {meta && <span className="mt-meta">{meta}</span>}
    </Tag>
  );
}
