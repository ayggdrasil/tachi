import { Lock, Users } from 'lucide-react';
import type { PrivacyCategory } from '../../../../shared/types';
import { privacyLabelsFor } from '../../../../shared/constants';
import { tachi, useTachi } from '../../lib/store';
import { useLocale, useT } from '../../lib/i18n';
import { Segmented } from '../../components/common/Segmented';


export function PrivacySettings() {
  const t = useT();
  const locale = useLocale();
  const privacy = useTachi(s => s.privacy);
  const PRIVACY_LABELS = privacyLabelsFor(locale);
  const CATS = Object.keys(PRIVACY_LABELS) as PrivacyCategory[];
  if (!privacy) return <div className="sa-center"><p className="sa-center-t">{t('common.loading')}</p></div>;
  const shared = CATS.filter(c => privacy[c] === 'family');
  return (
    <div className="sa-scroll">
      <h1 className="sa-h sa-h1">{t('priv.title')}</h1>
      <p className="sa-note">{t('priv.note')}</p>
      <div className="sa-priv-list">
        {CATS.map(c => (
          <section key={c} className="sa-priv" aria-labelledby={`p-${c}`}>
            <div>
              <h2 id={`p-${c}`} className="sa-priv-t">{PRIVACY_LABELS[c].label}</h2>
              <p className="sa-priv-d">{PRIVACY_LABELS[c].description}</p>
            </div>
            <Segmented label={t('priv.scopeOf', { label: PRIVACY_LABELS[c].label })} size="senior" value={privacy[c]} onChange={v => tachi.setPrivacy(c, v)}
              options={[{ value: 'family', label: t('vis.family'), icon: <Users size={20} aria-hidden /> }, { value: 'private', label: t('vis.private'), icon: <Lock size={20} aria-hidden /> }]} />
          </section>
        ))}
      </div>
      <section className="sa-priv sa-lang" aria-labelledby="p-lang">
        <div>
          <h2 id="p-lang" className="sa-priv-t">{t('lang.title')}</h2>
          <p className="sa-priv-d">{t('lang.note')}</p>
        </div>
        <Segmented label={t('lang.title')} size="senior" value={locale} onChange={v => { if (v !== locale) tachi.setLocale(v); }}
          options={[{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어' }]} />
      </section>
      <section className="sa-preview">
        <h2 className="sa-priv-t">{t('priv.nowVisible')}</h2>
        {shared.length === 0 ? <p className="sa-priv-d">{t('priv.noneVisible')}</p> : (
          <ul>{shared.map(c => <li key={c}><b>{PRIVACY_LABELS[c].label}</b>: {PRIVACY_LABELS[c].description}</li>)}</ul>
        )}
      </section>
    </div>
  );
}
