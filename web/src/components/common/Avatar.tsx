import type { User } from '../../../../shared/types';
import { TACHI_ID } from '../../../../shared/constants';
import { t } from '../../lib/i18n';
import './common.css';

export function Avatar({ user, size = 32, hollow, decorative }: { user?: User; size?: number; hollow?: boolean; decorative?: boolean }) {
  const isTachi = user?.id === TACHI_ID;
  const initials = user?.initials ?? '?';
  const cls = ['av', isTachi ? 'av-tachi' : 'av-user', hollow ? 'av-hollow' : ''].join(' ');
  return (
    <span className={cls} style={{ width: size, height: size, fontSize: size >= 36 ? Math.max(17, Math.round(size * 0.42)) : Math.max(11, Math.round(size * 0.42)) }}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': user?.shortName ?? t('common.unknown'), title: user?.shortName })}>
      {initials}
    </span>
  );
}
