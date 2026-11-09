import { Lock, Users } from 'lucide-react';
import type { PrivacyCategory } from '../../../../shared/types';
import { PRIVACY_LABELS } from '../../../../shared/constants';
import { tachi, useTachi } from '../../lib/store';
import { Segmented } from '../../components/common/Segmented';

const CATS = Object.keys(PRIVACY_LABELS) as PrivacyCategory[];

export function PrivacySettings() {
  const privacy = useTachi(s => s.privacy);
  if (!privacy) return <div className="sa-center"><p className="sa-center-t">불러오는 중…</p></div>;
  const shared = CATS.filter(c => privacy[c] === 'family');
  return (
    <div className="sa-scroll">
      <h1 className="sa-h sa-h1">가족에게 보여주기</h1>
      <p className="sa-note">가족은 ‘가족 공개’로 둔 정보만 타치에게 물어볼 수 있어요.</p>
      <div className="sa-priv-list">
        {CATS.map(c => (
          <section key={c} className="sa-priv" aria-labelledby={`p-${c}`}>
            <div>
              <h2 id={`p-${c}`} className="sa-priv-t">{PRIVACY_LABELS[c].label}</h2>
              <p className="sa-priv-d">{PRIVACY_LABELS[c].description}</p>
            </div>
            <Segmented label={`${PRIVACY_LABELS[c].label} 공개 범위`} size="senior" value={privacy[c]} onChange={v => tachi.setPrivacy(c, v)}
              options={[{ value: 'family', label: '가족 공개', icon: <Users size={20} aria-hidden /> }, { value: 'private', label: '나만 보기', icon: <Lock size={20} aria-hidden /> }]} />
          </section>
        ))}
      </div>
      <section className="sa-preview">
        <h2 className="sa-priv-t">지금 가족이 볼 수 있는 것</h2>
        {shared.length === 0 ? <p className="sa-priv-d">지금은 가족에게 보이는 정보가 없어요.</p> : (
          <ul>{shared.map(c => <li key={c}><b>{PRIVACY_LABELS[c].label}</b>: {PRIVACY_LABELS[c].description}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
