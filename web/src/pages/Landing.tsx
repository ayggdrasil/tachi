import { useNavigate } from 'react-router-dom';
import { ChevronRight, Clapperboard, Smartphone } from 'lucide-react';
import { USERS } from '../../../shared/constants';
import { rememberPersona } from '../lib/store';
import { Avatar } from '../components/common/Avatar';
import { useLan } from './demo/useLan';
import './Landing.css';

const ROLE_COPY: Record<string, string> = {
  mom: '시니어 앱 · 큰 글씨로 타치와 이야기해요',
  jieun: '가족 앱 · 엄마 소식을 챙기는 큰딸',
  minjun: '가족 앱 · 대전에 사는 아들',
  suyeon: '가족 앱 · 맛집과 숙소를 잘 찾는 며느리',
  harin: '가족 앱 · 할머니 바라기 손녀',
};

export default function Landing() {
  const nav = useNavigate();
  const lan = useLan();
  const people = USERS.filter(u => u.role !== 'ai');

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
          <h1 className="ld-mark">타치</h1>
          <p className="ld-pitch">어르신의 기억을 지키고, 가족을 다시 잇는 AI 동반자</p>
        </header>

        <section aria-labelledby="ld-who">
          <h2 id="ld-who" className="ld-h">누구로 들어갈까요?</h2>
          <ul className="ld-list">
            {people.map(u => (
              <li key={u.id}>
                <button className="ld-row" onClick={() => go(u.id)}>
                  <Avatar user={u} size={40} />
                  <span className="ld-row-main">
                    <span className="ld-name">{u.relation === '본인' ? '어머니' : u.relation} {u.name}</span>
                    <span className="ld-role">{ROLE_COPY[u.id]}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
                </button>
              </li>
            ))}
            <li>
              <button className="ld-row" onClick={() => go('director')} disabled={!lan?.directorUrl} aria-disabled={!lan?.directorUrl}>
                <span className="ld-dir" aria-hidden><Clapperboard size={20} strokeWidth={1.5} /></span>
                <span className="ld-row-main">
                  <span className="ld-name">디렉터</span>
                  <span className="ld-role">{lan?.directorUrl ? '발표 콘솔 · 두 화면을 한눈에 보고 시나리오를 진행해요' : '디렉터 화면은 발표 노트북에서 열어 주세요 (키 필요)'}</span>
                </span>
                <ChevronRight size={18} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          </ul>
        </section>

        <section className="card ld-lan" aria-labelledby="ld-lan-h">
          <div className="ld-lan-text">
            <h2 id="ld-lan-h" className="ld-lan-title"><Smartphone size={16} strokeWidth={1.5} aria-hidden /> 다른 기기에서 접속</h2>
            <p className="caption muted">같은 Wi‑Fi에서 휴대폰으로 스캔하세요</p>
            {lan === null && <p className="caption faint">주소를 확인하고 있어요…</p>}
            {lan && lan.urls.length === 0 && <p className="caption faint">접속 주소를 찾지 못했어요. 서버가 켜져 있는지 확인해 주세요.</p>}
            {lan?.urls.map(u => <p key={u} className="mono ld-url">{u}</p>)}
          </div>
          {lan?.qr && <img className="ld-qr" src={lan.qr} alt="접속용 QR 코드" width={132} height={132} />}
        </section>
      </div>
    </main>
  );
}
