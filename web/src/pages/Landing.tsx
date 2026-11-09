import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clapperboard, Smartphone } from 'lucide-react';
import { usersFor } from '../../../shared/constants';
import { rememberPersona } from '../lib/store';
import { Avatar } from '../components/common/Avatar';
import { useLan } from './demo/useLan';
import { useT, useLocale } from '../lib/i18n';
import { relLabel } from './family/rooms';
import './Landing.css';

export default function Landing() {
  const nav = useNavigate();
  const t = useT();
  const locale = useLocale();
  const lan = useLan();
  const people = usersFor(locale).filter(u => u.role !== 'ai' && u.id !== 'director');

  const go = (id: string) => {
    if (id === 'director') {
      if (!lan?.directorUrl) return;
      try { const u = new URL(lan.directorUrl, window.location.origin); window.location.assign(u.pathname + u.search); } catch { nav('/demo'); }
      return;
    }
    rememberPersona(id);
    nav(id === 'mom' ? `/senior?as=${id}` : `/family?as=${id}`);
  };

  return (
    <main className="ld">
      <div className="ld-inner">
        <header className="ld-hero">
          <nav className="ld-lang" aria-label={t('ld.language')}>
            {(['en', 'ko'] as const).map(l => (
              <a key={l} href={`${window.location.pathname}?lang=${l}`} lang={l} aria-current={l === locale ? 'true' : undefined} className={`ld-lang-i ${l === locale ? 'is-on' : ''}`}>{l === 'en' ? 'English' : '한국어'}</a>
            ))}
          </nav>
          <h1 className="ld-mark">{t('app.name')}</h1>
          <p className="ld-pitch">{t('ld.pitch')}</p>
        </header>

        <section aria-labelledby="ld-who">
          <h2 id="ld-who" className="ld-h">{t('ld.who')}</h2>
          <ul className="ld-list">
            {people.map(u => (
              <li key={u.id}>
                <button className="ld-row" onClick={() => go(u.id)}>
                  <Avatar user={u} size={40} />
                  <span className="ld-row-main">
                    <span className="ld-name">{t('ld.person', { rel: relLabel(u.relation, t), name: u.name })}</span>
                    <span className="ld-role">{t(`ld.role.${u.id}`)}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
                </button>
              </li>
            ))}
            <li>
              <button className="ld-row" onClick={() => go('director')} disabled={!lan?.directorUrl} aria-disabled={!lan?.directorUrl}>
                <span className="ld-dir" aria-hidden><Clapperboard size={20} strokeWidth={1.5} /></span>
                <span className="ld-row-main">
                  <span className="ld-name">{t('ld.director')}</span>
                  <span className="ld-role">{lan?.directorUrl ? t('ld.directorOn') : t('ld.directorOff')}</span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          </ul>
        </section>

        <section className="card ld-lan" aria-labelledby="ld-lan-h">
          <div className="ld-lan-text">
            <h2 id="ld-lan-h" className="ld-lan-title"><Smartphone size={16} strokeWidth={1.5} aria-hidden /> {t('ld.lanTitle')}</h2>
            <p className="caption muted">{t('ld.lanHint')}</p>
            {lan === null && <p className="caption faint">{t('ld.lanChecking')}</p>}
            {lan && lan.urls.length === 0 && <p className="caption faint">{t('ld.lanNone')}</p>}
            {lan?.urls.map(u => <p key={u} className="mono ld-url">{u}</p>)}
          </div>
          {lan?.qr && <img className="ld-qr" src={lan.qr} alt={t('app.qrAlt')} width={132} height={132} />}
        </section>
      </div>
    </main>
  );
}
