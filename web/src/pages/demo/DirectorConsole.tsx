import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pause, Play, QrCode, RotateCcw } from 'lucide-react';
import { DEMO_SCRIPT, DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ROOM_ID, type DemoStep } from '../../../../shared/constants';
import type { ProactiveKind } from '../../../../shared/types';
import { initTachi, tachi, useTachi } from '../../lib/store';
import { ModelSwitcher } from '../../components/common/ModelSwitcher';
import { Avatar } from '../../components/common/Avatar';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { Dialog } from '../family/Dialog';
import { useLan } from './useLan';
import './DirectorConsole.css';

const PHONE_W = 390;
const PHONE_H = 844;
const LABEL_H = 28;
const GRAPH_W = 560;
const GAP = 24;
const PAD = 24;

const PROACTIVE: { kind: ProactiveKind; label: string }[] = [
  { kind: 'morning', label: '아침 안부' }, { kind: 'memory', label: '추억 이야기' },
  { kind: 'evening', label: '저녁 인사' }, { kind: 'ask_photo', label: '사진 요청' },
];

/** wait (ms) before running the step after this one */
function waitAfter(step: DemoStep | undefined): number {
  if (!step) return 1200;
  if (step.director === 'proactive') return 5500;
  if (step.photo) return 7000;
  if (step.id === 'a-story' || step.id === 'share') return 7000;
  if (step.id === 'recall' || step.id === 'trip') return 6500;
  if (step.id === 'schedule') return 9000;
  if (step.room === 'family') return 6000;
  return 4500;
}

export default function DirectorConsole() {
  useEffect(() => { initTachi(DIRECTOR_ID); }, []);

  const status = useTachi(s => s.status);
  const graph = useTachi(s => s.graph);
  const fresh = useTachi(s => s.freshGraphIds);
  const models = useTachi(s => s.models);
  const demo = useTachi(s => s.demo);
  const users = useTachi(s => s.users);
  const presence = useTachi(s => s.presence);
  const lan = useLan();

  const nodes = useMemo(() => Object.values(graph.nodes), [graph.nodes]);
  const edges = useMemo(() => Object.values(graph.edges), [graph.edges]);

  const [cursor, setCursor] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [auto, setAuto] = useState(false);
  const [showSide, setShowSide] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [confirmReset, setConfirmReset] = useState(false);
  const [qr, setQr] = useState(false);

  const total = DEMO_SCRIPT.length;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const runStep = useCallback((i: number) => {
    const step = DEMO_SCRIPT[i];
    if (!step) return;
    if (step.director === 'proactive') tachi.demo.proactive();
    else if (step.director === 'report') tachi.demo.report();
    else if (step.director === 'closePoll') tachi.demo.closePoll();
    else if (step.as) tachi.demo.say(step.as, step.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID, step.text, step.photo);
    setDone(d => new Set(d).add(step.id));
    setCursor(i + 1);
  }, []);

  const runNext = useCallback(() => { if (cursorRef.current < total) runStep(cursorRef.current); }, [runStep, total]);
  const back = useCallback(() => {
    const c = Math.max(0, cursorRef.current - 1);
    setCursor(c);
    setDone(d => { const n = new Set(d); const s = DEMO_SCRIPT[c]; if (s) n.delete(s.id); return n; });
  }, []);
  const resetCursor = useCallback(() => { setCursor(0); setDone(new Set()); setAuto(false); }, []);

  // keyboard
  const blocked = confirmReset || qr;
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (blocked || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); runNext(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.key === 'r' || e.key === 'R') { resetCursor(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [blocked, runNext, back, resetCursor]);

  // auto-run
  useEffect(() => {
    if (!auto) return;
    if (cursor >= total) { setAuto(false); return; }
    const wait = cursor === 0 ? 800 : waitAfter(DEMO_SCRIPT[cursor - 1]);
    const t = window.setTimeout(() => runStep(cursor), wait);
    return () => window.clearTimeout(t);
  }, [auto, cursor, total, runStep]);

  const doReset = () => {
    setConfirmReset(false);
    tachi.demo.reset();
    resetCursor();
    window.setTimeout(() => setFrameKey(k => k + 1), 700);
  };

  // stage sizing
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 960, h: 760 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const third = showGraph ? 'graph' : showSide ? 'side' : null;
  const phones = 2 + (third === 'side' ? 1 : 0);
  const slots = phones + (third === 'graph' ? 1 : 0);
  const availH = box.h - PAD * 2 - 40 - LABEL_H;
  const availW = box.w - PAD * 2 - GAP * (slots - 1) - (third === 'graph' ? GRAPH_W : 0);
  const scale = Math.max(0.3, Math.min(1, availH / PHONE_H, availW / (phones * PHONE_W)));

  const statusLabel = status === 'ready' ? '연결됨' : status === 'error' ? '연결 오류' : '연결 중';
  const modelLabel = models?.options.find(o => o.key === models.active)?.label ?? '—';
  const family = Object.values(users).filter(u => u.role !== 'ai' && u.id !== DIRECTOR_ID);
  const nextStep = DEMO_SCRIPT[cursor];

  return (
    <div className="dc">
      <aside className="dc-rail" aria-label="컨트롤 레일">
        <header className="dc-status">
          <div className="dc-status-top">
            <Link to="/" className="dc-brand">타치 · 디렉터</Link>
            <span className="dc-conn"><span className={`dc-dot ${status === 'ready' ? 'is-on' : ''}`} aria-hidden />{statusLabel}</span>
          </div>
          <p className="caption muted">노드 {nodes.length} · 관계 {edges.length} · {modelLabel}</p>
        </header>

        <div className="dc-rail-scroll">
          <section className="dc-sec" aria-label="시나리오">
            <div className="dc-sec-head">
              <h2 className="dc-h">시나리오</h2>
              <span className="caption faint">{Math.min(cursor, total)}/{total}</span>
              <span className="dc-spacer" />
              <button className="chip dc-auto" aria-pressed={auto} onClick={() => setAuto(a => !a)} disabled={cursor >= total && !auto}>
                {auto ? <Pause size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} 자동 진행
              </button>
              <button className="btn btn-icon dc-mini" onClick={resetCursor} aria-label="시나리오 처음으로 (R)" title="처음으로 (R)"><RotateCcw size={14} strokeWidth={1.5} /></button>
            </div>
            <ol className="dc-steps">
              {DEMO_SCRIPT.map((s, i) => {
                const isDone = done.has(s.id);
                const isNext = i === cursor;
                return (
                  <li key={s.id}>
                    <button className={`dc-step ${isNext ? 'is-next' : ''} ${isDone ? 'is-done' : ''}`}
                      onClick={e => { runStep(i); e.currentTarget.blur(); }} aria-current={isNext ? 'step' : undefined}>
                      <span className="dc-step-n">{isDone ? <Check size={13} strokeWidth={2} aria-label="완료" /> : i + 1}</span>
                      <span className="dc-step-main">
                        <span className="dc-step-label">{s.label}</span>
                        {isNext && <span className="dc-step-hint">{s.hint}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="dc-keys faint">→ 또는 Space 다음 · ← 이전 · R 처음{nextStep ? '' : ' · 끝!'}</p>
          </section>

          <section className="dc-sec" aria-label="타치">
            <h2 className="dc-h">타치</h2>
            <div className="dc-grid2">
              {PROACTIVE.map(p => (
                <button key={p.kind} className="btn dc-btn" onClick={() => tachi.demo.proactive(p.kind)}>{p.label}</button>
              ))}
            </div>
            <div className="dc-grid2">
              <button className="btn dc-btn" onClick={() => tachi.demo.report()}>리포트 보내기</button>
              <button className="btn dc-btn" onClick={() => tachi.demo.closePoll()}>일정 확정하기</button>
            </div>
          </section>

          <section className="dc-sec" aria-label="가족 봇">
            <div className="dc-sec-head">
              <h2 className="dc-h">가족 봇</h2>
              <span className="dc-spacer" />
              <button role="switch" aria-checked={!!demo?.botsEnabled} aria-label="가족 봇 켜기" className={`dc-switch ${demo?.botsEnabled ? 'is-on' : ''}`}
                onClick={() => tachi.demo.bots(!demo?.botsEnabled)}><span /></button>
            </div>
            <ul className="dc-presence">
              {family.map(u => {
                const human = presence.claimed.includes(u.id) || !u.isBot;
                return (
                  <li key={u.id} className="dc-p">
                    <Avatar user={u} size={22} hollow={!human} />
                    <span className="caption">{u.shortName}</span>
                    <span className="dc-p-st faint">{human ? '사람' : '봇'}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="dc-sec" aria-label="모델">
            <h2 className="dc-h">모델</h2>
            <ModelSwitcher />
          </section>

          <section className="dc-sec" aria-label="기기 연결">
            <div className="dc-sec-head">
              <h2 className="dc-h">기기 연결</h2>
              <span className="dc-spacer" />
              <button className="btn dc-btn" onClick={() => setQr(true)}><QrCode size={14} strokeWidth={1.5} /> QR 보기</button>
            </div>
            <p className="caption faint">{lan?.urls[0] ?? '주소 확인 중…'} · /join에서 역할을 고르세요</p>
          </section>
        </div>

        <footer className="dc-rail-foot">
          <button className="btn dc-btn dc-reset" onClick={() => setConfirmReset(true)}>데모 초기화</button>
        </footer>
      </aside>

      <main className="dc-stage" ref={stageRef} aria-label="무대">
        <div className="dc-toggles">
          <button className="chip" aria-pressed={showSide && !showGraph} onClick={() => { setShowGraph(false); setShowSide(v => !v || showGraph); }}>민준 · 사이드 챗</button>
          <button className="chip" aria-pressed={showGraph} onClick={() => setShowGraph(v => !v)}>기억 그래프</button>
        </div>
        <div className="dc-frames" style={{ gap: GAP }}>
          <Phone scale={scale} label="어머니 · 시니어 앱" name="김순자" src="/senior?as=mom&embed=1" k={frameKey} />
          <Phone scale={scale} label="딸 지은 · 가족방" name="김지은" src="/family?as=jieun&embed=1" k={frameKey} />
          {third === 'side' && <Phone scale={scale} label="아들 민준 · 가족방" name="박민준" src="/family?as=minjun&embed=1" k={frameKey} />}
          {third === 'graph' && (
            <section className="dc-graph" style={{ width: GRAPH_W, height: PHONE_H * scale + LABEL_H }} aria-label="기억 그래프">
              <div className="dc-label">기억 그래프 · Kùzu</div>
              <div className="dc-graph-box" style={{ height: PHONE_H * scale }}>
                <MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} height={Math.max(200, PHONE_H * scale - 56)} interactive />
                <div className="dc-graph-stats caption muted">노드 {nodes.length} · 관계 {edges.length}{fresh.length > 0 ? ` · 방금 +${fresh.length}` : ''}</div>
              </div>
            </section>
          )}
        </div>
      </main>

      {confirmReset && (
        <Dialog title="데모를 처음 상태로 되돌릴까요?" onClose={() => setConfirmReset(false)} width={400}
          footer={<><button className="btn" onClick={() => setConfirmReset(false)}>취소</button><button className="btn btn-primary" onClick={doReset}>초기화</button></>}>
          <p className="caption muted">대화, 추억, 그래프가 시드 상태로 돌아가요. 두 화면도 새로 고쳐집니다.</p>
        </Dialog>
      )}
      {qr && (
        <Dialog title="기기 연결" onClose={() => setQr(false)} width={380}>
          <div className="dc-qr">
            {lan?.qr ? <img src={lan.qr} alt="접속용 QR 코드" width={220} height={220} /> : <p className="caption faint">QR을 불러오지 못했어요.</p>}
            {lan?.urls.map(u => <p key={u} className="mono">{u}</p>)}
            <p className="caption muted">같은 Wi‑Fi에서 스캔한 뒤 /join에서 역할을 고르세요.</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Phone({ scale, label, name, src, k }: { scale: number; label: string; name: string; src: string; k: number }) {
  return (
    <figure className="dc-phone-wrap" style={{ width: PHONE_W * scale }}>
      <figcaption className="dc-label">{label}</figcaption>
      <div className="dc-phone-box" style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div className="dc-phone" style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}>
          <div className="dc-phone-status"><span>{name}</span></div>
          <iframe key={`${src}-${k}`} className="dc-iframe" src={src} title={label} />
        </div>
      </div>
    </figure>
  );
}
