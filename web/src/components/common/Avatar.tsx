import type { User } from '../../../../shared/types';
import { TACHI_ID } from '../../../../shared/constants';
import './common.css';

export function Avatar({ user, size = 32, hollow }: { user?: User; size?: number; hollow?: boolean }) {
  const isTachi = user?.id === TACHI_ID;
  const initials = user?.initials ?? '?';
  const cls = ['av', isTachi ? 'av-tachi' : 'av-user', hollow ? 'av-hollow' : ''].join(' ');
  return (
    <span className={cls} style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
      role="img" aria-label={user?.shortName ?? '알 수 없음'} title={user?.shortName}>
      {initials}
    </span>
  );
}
