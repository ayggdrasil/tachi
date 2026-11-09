import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Loader2, Pause, Play, QrCode, RotateCcw } from 'lucide-react';
import { DEMO_SCRIPT, DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ROOM_ID, type DemoStep } from '../../../../shared/constants';
import type { ProactiveKind } from '../../../../shared/types';
import { getState, initTachi, tachi, useTachi } from '../../lib/store';
import { getSocket } from '../../lib/socket';
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

const STEP_TIMEOUT = 45000;
const DWELL = 2500;
const DWELL_LONG = 4000;
const LONG_KINDS = new Set(['memory_card', 'share_card', 'itinerary', 'schedule_result']);

type StepStat = 'running' | 'done' | 'timeout';

function fmtClock(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtElapsed(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
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
  const [stat, setStat] = useState<Record<string, StepStat>>({});
  const [running, setRunning] = useState<{ i: number; baseline: Set<string> } | null>(null);
  const [dwell, setDwell] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showSide, setShowSide] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [qr, setQr] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockTick, setClockTick] = useState(0);

  const total = DEMO_SCRIPT.length;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const runningRef = useRef(running);
  runningRef.current = running;
  const startedRef = useRef(startedAt);
  startedRef.current = startedAt;
  const messages = useTachi(s => s.messages);
  const polls = useTachi(s => s.polls);

  const runStep = useCallback((i: number) => {
    const step = DEMO_SCRIPT[i];
    if (!step || runningRef.current) return;
    const roomId = step.waitFor ? (step.waitFor.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID) : null;
    const baseline = new Set((roomId ? getState().messages[roomId] ?? [] : []).map(m => m.id));
    if (startedRef.current === null) { const t = Date.now(); startedRef.current = t; setStartedAt(t); setEndedAt(null); }
    if (step.clock) tachi.demo.clock(step.clock);
    if (step.director === 'proactive') tachi.demo.proactive(step.kind);
    else if (step.director === 'report') tachi.demo.report();
    else if (step.director === 'closePoll') tachi.demo.closePoll();
    else if (step.as) tachi.demo.say(step.as, step.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID, step.text, step.photo);
    setDwell(false);
    setCursor(c => Math.max(c, i + 1));
    if (step.waitFor) {
      const r = { i, baseline };
      runningRef.current = r;
      setRunning(r);
      setStat(d => ({ ...d, [step.id]: 'running' }));
    } else {
      setStat(d => ({ ...d, [step.id]: 'done' }));
    }
  }, []);

  // completion watcher
  useEffect(() => {
    if (!running) return;
    const step = DEMO_SCRIPT[running.i];
    const w = step?.waitFor;
    if (!step || !w) return;
    const list = messages[w.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID] ?? [];
    if (list.some(m => !running.baseline.has(m.id) && m.kind === w.kind && (!w.from || m.senderId === w.from))) {
      setStat(d => ({ ...d, [step.id]: 'done' }));
      runningRef.current = null;
      setRunning(null);
      if (running.i === total - 1) setEndedAt(Date.now());
      setDwell(true);
    }
  }, [running, messages, total]);

  // timeout
  useEffect(() => {
    if (!running) return;
    const step = DEMO_SCRIPT[running.i];
    const t = window.setTimeout(() => {
      setStat(d => ({ ...d, [step.id]: 'timeout' }));
      runningRef.current = null;
      setRunning(null);
      setAuto(false);
    }, STEP_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [running]);

  // dwell after completion
  const lastDoneKind = DEMO_SCRIPT[cursor - 1]?.waitFor?.kind ?? null;
  useEffect(() => {
    if (!dwell) return;
    const t = window.setTimeout(() => setDwell(false), lastDoneKind && LONG_KINDS.has(lastDoneKind) ? DWELL_LONG : DWELL);
    return () => window.clearTimeout(t);
  }, [dwell, lastDoneKind]);

  // elapsed ticker
  useEffect(() => {
    if (startedAt === null || endedAt !== null) return;
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt, endedAt]);
  // virtual clock ticker
  useEffect(() => { const t = window.setInterval(() => setClockTick(n => n + 1), 30000); return () => window.clearInterval(t); }, []);

  const runNext = useCallback(() => { if (cursorRef.current < total) runStep(cursorRef.current); }, [runStep, total]);
  const back = useCallback(() => {
    if (runningRef.current) return;
    const c = Math.max(0, cursorRef.current - 1);
    setCursor(c);
    setStat(d => { const n = { ...d }; const s = DEMO_SCRIPT[c]; if (s) delete n[s.id]; return n; });
  }, []);
  const resetCursor = useCallback(() => {
    runningRef.current = null;
    startedRef.current = null;
    setRunning(null); setCursor(0); setStat({}); setAuto(false); setDwell(false);
    setStartedAt(null); setEndedAt(null);
  }, []);

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

  // auto-run: advance only after completion + dwell
  useEffect(() => {
    if (!auto) return;
    if (cursor >= total && !running) { setAuto(false); return; }
    if (running || dwell || cursor >= total) return;
    const t = window.setTimeout(() => runStep(cursor), cursor === 0 ? 800 : 200);
    return () => window.clearTimeout(t);
  }, [auto, cursor, total, running, dwell, runStep]);

  // reset: wait for the director store to be ready again, then re-key frames
  useEffect(() => {
    const on = () => { resetCursor(); setReloading(true); };
    const sock = getSocket();
    sock.on('reset', on);
    return () => { sock.off('reset', on); };
  }, [resetCursor]);
  useEffect(() => {
    if (!reloading) return;
    if (status === 'ready') {
      const t = window.setTimeout(() => { setFrameKey(k => k + 1); setReloading(false); }, 150);
      return () => window.clearTimeout(t);
    }
    const f = window.setTimeout(() => { setFrameKey(k => k + 1); setReloading(false); }, 12000);
    return () => window.clearTimeout(f);
  }, [reloading, status]);

  const doReset = () => {
    setConfirmReset(false);
    resetCursor();
    setReloading(true);
    tachi.demo.reset();
  };

  // minjun's side-chat room from the latest open (else most recent) poll
  const sideRoomId = useMemo(() => {
    const list = Object.values(polls).filter(p => p.sideRoomIds?.minjun);
    if (!list.length) return null;
    const open = list.filter(p => p.status === 'open');
    const pool = open.length ? open : list;
    pool.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return pool[0].sideRoomIds.minjun;
  }, [polls]);

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
  const busy = !!running;
  const doneCount = Object.values(stat).filter(v => v === 'done').length;
  const virtualClock = useMemo(() => fmtClock(demo?.clockOffsetMinutes ?? 0), [demo?.clockOffsetMinutes, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = startedAt === null ? null : fmtElapsed((endedAt ?? nowMs) - startedAt);

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
              <span className="caption faint">{doneCount}/{total}</span>
              {elapsed && <span className="caption faint dc-elapsed" title="데모 경과 시간">{elapsed}</span>}
              <span className="dc-spacer" />
              <button className="chip dc-auto" aria-pressed={auto} onClick={() => setAuto(a => !a)} disabled={cursor >= total && !auto}>
                {auto ? <Pause size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} 자동 진행
              </button>
              <button className="btn btn-icon dc-mini" onClick={resetCursor} aria-label="시나리오 처음으로 (R)" title="처음으로 (R)"><RotateCcw size={14} strokeWidth={1.5} /></button>
            </div>
            <p className="dc-clock caption muted"><Clock size={12} strokeWidth={1.5} aria-hidden /> 데모 시각 {virtualClock}
              <button className="chip dc-live" onClick={() => tachi.demo.clock(null)} disabled={!demo?.clockOffsetMinutes}>실시간으로</button>
            </p>
            <ol className="dc-steps">
              {DEMO_SCRIPT.map((s, i) => {
                const st = stat[s.id];
                const isDone = st === 'done';
                const isNext = i === cursor;
                return (
                  <li key={s.id}>
                    <button className={`dc-step ${isNext ? 'is-next' : ''} ${isDone ? 'is-done' : ''} ${st === 'running' ? 'is-running' : ''}`}
                      disabled={busy}
                      onClick={e => { runStep(i); e.currentTarget.blur(); }} aria-current={isNext ? 'step' : undefined}>
                      <span className="dc-step-n">
                        {st === 'running' ? <Loader2 size={13} strokeWidth={2} className="dc-spin" aria-label="진행 중" /> : isDone ? <Check size={13} strokeWidth={2} aria-label="완료" /> : i + 1}
                      </span>
                      <span className="dc-step-main">
                        <span className="dc-step-label">{s.label}</span>
                        {(isNext || st === 'running' || st === 'timeout') && (
                          <span className="dc-step-hint">{st === 'running' ? '응답 기다리는 중…' : st === 'timeout' ? '시간 초과 · 다시 눌러 재시도' : s.hint}</span>
                        )}
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
          {third === 'side' && (
            <Phone scale={scale} label="민준 · 사이드 챗" name="박민준" k={frameKey}
              src={sideRoomId ? `/family?as=minjun&embed=1&room=${encodeURIComponent(sideRoomId)}` : '/family?as=minjun&embed=1'}
              caption={sideRoomId ? undefined : '일정 조율이 시작되면 사이드 챗이 열려요'} />
          )}
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

function Phone({ scale, label, name, src, k, caption }: { scale: number; label: string; name: string; src: string; k: number; caption?: string }) {
  return (
    <figure className="dc-phone-wrap" style={{ width: PHONE_W * scale }}>
      <figcaption className="dc-label">{label}</figcaption>
      <div className="dc-phone-box" style={{ width: PHONE_W * scale, height: PHONE_H * scale }}>
        <div className="dc-phone" style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}>
          <div className="dc-phone-status"><span>{name}</span></div>
          <iframe key={`${src}-${k}`} className="dc-iframe" src={src} title={label} />
        </div>
      </div>
      {caption && <figcaption className="dc-cap caption muted">{caption}</figcaption>}
    </figure>
  );
}
