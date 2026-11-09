import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Moon, Pause, Play, QrCode, RotateCcw, Sun } from 'lucide-react';
import { DEMO_SCRIPT, DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ROOM_ID, type DemoStep } from '../../../../shared/constants';
import type { ProactiveKind, ModelKey, RecallCardPayload } from '../../../../shared/types';
import { getState, initTachi, tachi, useTachi } from '../../lib/store';
import { getSocket } from '../../lib/socket';
import { Avatar } from '../../components/common/Avatar';
import { MemoryGraph } from '../../components/graph/MemoryGraph';
import { Dialog } from '../family/Dialog';
import { useLan } from './useLan';
import { applyTheme } from '../../styles/theme';
import './DirectorConsole.css';

const PHONE_W = 390;
const PHONE_H = 844;
const LABEL_H = 28;
const GAP = 24;
const PAD = 24;

const PROACTIVE: { kind: ProactiveKind; label: string }[] = [
  { kind: 'morning', label: '아침 안부' }, { kind: 'memory', label: '추억 이야기' },
  { kind: 'evening', label: '저녁 인사' }, { kind: 'ask_photo', label: '사진 요청' },
];

const STEP_TIMEOUT = 45000;
const DWELL = 1500;
const DWELL_LONG = 3000;
const LONG_KINDS = new Set(['memory_card', 'share_card', 'itinerary', 'schedule_result']);

type StepStat = 'running' | 'done' | 'timeout' | 'skipped';

// completed steps that must not be sent again (replay only via 처음부터 재생)
const NON_REPEATABLE = new Set(['photo', 'a-when', 'a-who', 'a-story', 'share', 'invite', 'trip', 'together', 'gathering', 'schedule', 'report']);

/** Has the step's outcome already landed in the store? (used to settle a timed-out step without re-sending) */
function outcomeExists(id: string): boolean {
  const st = getState();
  const has = (room: string, kind: string) => (st.messages[room] ?? []).some(m => m.kind === kind);
  const fam = st.rooms.find(r => r.id === FAMILY_ROOM_ID);
  switch (id) {
    case 'invite': return !!fam?.memberIds.includes('harin');
    case 'share': return has(FAMILY_ROOM_ID, 'share_card');
    case 'a-story': return has(SENIOR_ROOM_ID, 'memory_card');
    case 'trip': return has(SENIOR_ROOM_ID, 'itinerary');
    case 'together': case 'gathering': return Object.keys(st.artifacts).length > 0 || has(FAMILY_ROOM_ID, 'artifact');
    case 'schedule': return has(FAMILY_ROOM_ID, 'schedule_result');
    case 'report': return has(FAMILY_ROOM_ID, 'report');
    default: return false;
  }
}

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
  const [modelTarget, setModelTarget] = useState<string | null>(null);
  const [manualStage, setManualStage] = useState(false);
  const [engine, setEngine] = useState<string | null>(null);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [skip, setSkip] = useState<Record<string, string>>({});

  const [theme, setTheme] = useState<'light' | 'dark'>(() => new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggleTheme = () => { setTheme(t => (t === 'dark' ? 'light' : 'dark')); setFrameKey(k => k + 1); };
  const themeQ = `&theme=${theme}`;
  const error = useTachi(s => s.error);

  const total = DEMO_SCRIPT.length;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const statRef = useRef(stat);
  statRef.current = stat;
  const runningRef = useRef(running);
  runningRef.current = running;
  const manualRef = useRef(false);
  manualRef.current = manualStage;
  const startedRef = useRef(startedAt);
  const stepStartRef = useRef(0);   // when the current step was sent (adaptive dwell)
  startedRef.current = startedAt;
  const messages = useTachi(s => s.messages);
  const polls = useTachi(s => s.polls);
  useTachi(s => s.rooms); useTachi(s => s.artifacts); // re-render when outcomes land (timeout hint)

  const runStep = useCallback((i: number) => {
    const step = DEMO_SCRIPT[i];
    if (!step || runningRef.current) return;
    const prev = statRef.current[step.id];
    if (NON_REPEATABLE.has(step.id) && prev === 'done') {
      // already committed: just move the cursor, never re-send
      setCursor(i + 1);
      return;
    }
    if (prev === 'timeout' && outcomeExists(step.id)) {
      setStat(d => ({ ...d, [step.id]: 'done' }));
      setCursor(c => Math.max(c, i + 1));
      if (i === total - 1) setEndedAt(Date.now());
      setDwell(true);
      return;
    }
    const roomId = step.waitFor ? (step.waitFor.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID) : null;
    const baseline = new Set((roomId ? getState().messages[roomId] ?? [] : []).map(m => m.id));
    stepStartRef.current = Date.now();
    if (startedRef.current === null) { const t = Date.now(); startedRef.current = t; setStartedAt(t); setEndedAt(null); }
    if (step.clock) tachi.demo.clock(step.clock);
    if (step.director === 'model') {
      const ms = getState().models;
      const opts = ms?.options ?? [];
      // a live, healthy (or unknown) provider that differs from the active one — otherwise the beat shows nothing
      const cands = opts.filter(o => o.available && o.key !== 'demo' && o.key !== ms?.active && o.healthy !== false);
      const pick = cands.find(o => o.key === step.modelKey) ?? cands[0];
      if (!pick) {
        setSkip(d => ({ ...d, [step.id]: '바꿀 수 있는 다른 모델이 없어 건너뛰어요' }));
        setStat(d => ({ ...d, [step.id]: 'skipped' }));
        setCursor(c => Math.max(c, i + 1));
        setDwell(true);
        if (i === total - 1) setEndedAt(Date.now());
        return;
      }
      const key: ModelKey = pick.key;
      setModelTarget(pick.label);
      const roomOf = step.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID;
      tachi.setModel(key);
      void (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 4000 && getState().models?.active !== key) await new Promise(r => setTimeout(r, 100));
        if (getState().models?.active === key) {
          if (step.as) tachi.demo.say(step.as, roomOf, step.text, step.photo);
          return;
        }
        // switch never observed: do not ask the question under the old model
        setSkip(d => ({ ...d, [step.id]: '모델 교체가 확인되지 않아 건너뛰어요' }));
        setStat(d => ({ ...d, [step.id]: 'skipped' }));
        runningRef.current = null;
        setRunning(null);
        setModelTarget(null);
        setDwell(true);
        if (i === total - 1) setEndedAt(Date.now());
      })();
    } else if (step.director === 'invite') tachi.demo.invite(FAMILY_ROOM_ID, step.contactId ?? 'c-harin');
    else if (step.director === 'proactive') tachi.demo.proactive(step.kind);
    else if (step.director === 'report') tachi.demo.report();
    else if (step.director === 'closePoll') tachi.demo.closePoll();
    else if (step.as) tachi.demo.say(step.as, step.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID, step.text, step.photo);
    setDwell(false);
    if (step.id === 'a-story' || step.id === 'recall') { if (!manualRef.current) { setShowGraph(true); } }
    else if (step.id === 'schedule') { if (!manualRef.current) { setShowGraph(false); setShowSide(true); } }
    setCursor(c => Math.max(c, i + 1));
    if (step.waitFor) {
      const r = { i, baseline };
      runningRef.current = r;
      setRunning(r);
      setStat(d => ({ ...d, [step.id]: 'running' }));
    } else {
      setStat(d => ({ ...d, [step.id]: 'done' }));
    }
  }, [total]);

  // completion watcher
  useEffect(() => {
    if (!running) return;
    const step = DEMO_SCRIPT[running.i];
    const w = step?.waitFor;
    if (!step || !w) return;
    const list = messages[w.room === 'senior' ? SENIOR_ROOM_ID : FAMILY_ROOM_ID] ?? [];
    // the trip offer may already be live from the share step (one offer per memory): then a fresh recall_card plus that offer is enough
    const offerAlready = w.kind === 'trip_suggestion' && list.some(m => !running.baseline.has(m.id) && m.kind === 'recall_card') && list.some(m => m.kind === 'trip_suggestion');
    if (offerAlready || list.some(m => !running.baseline.has(m.id) && m.kind === w.kind && (!w.from || m.senderId === w.from))) {
      setStat(d => ({ ...d, [step.id]: 'done' }));
      runningRef.current = null;
      setRunning(null);
      setModelTarget(null);
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
      setModelTarget(null);
      setAuto(false);
    }, STEP_TIMEOUT);
    return () => window.clearTimeout(t);
  }, [running]);

  // dwell after completion
  const lastDoneKind = DEMO_SCRIPT[cursor - 1]?.waitFor?.kind ?? null;
  useEffect(() => {
    if (!dwell) return;
    // Adaptive dwell: if the audience already watched Tachi think for a while (slow live model), move on sooner.
    const base = lastDoneKind && LONG_KINDS.has(lastDoneKind) ? DWELL_LONG : DWELL;
    const took = stepStartRef.current ? Date.now() - stepStartRef.current : 0;
    const t = window.setTimeout(() => setDwell(false), Math.max(600, base - Math.max(0, took - 1500)));
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
    setStat(d => { const n = { ...d }; const s = DEMO_SCRIPT[c]; if (s && !NON_REPEATABLE.has(s.id)) delete n[s.id]; return n; });
  }, []);
  const resetCursor = useCallback(() => {
    runningRef.current = null;
    startedRef.current = null;
    setRunning(null); setCursor(0); setStat({}); setAuto(false); setDwell(false);
    setStartedAt(null); setEndedAt(null); setModelTarget(null);
    setSkip({}); setManualStage(false); manualRef.current = false; setShowGraph(false); setShowSide(false); setStaleDismissed(false);
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
      else if (e.key === 'r' || e.key === 'R') { if (!runningRef.current) setConfirmReset(true); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [blocked, runNext, back]);

  // auto-run: advance only after completion + dwell
  useEffect(() => {
    if (!auto) return;
    if (cursor >= total && !running) { setAuto(false); return; }
    if (running || dwell || cursor >= total) return;
    const t = window.setTimeout(() => runStep(cursor), cursor === 0 ? 800 : 200);
    return () => window.clearTimeout(t);
  }, [auto, cursor, total, running, dwell, runStep]);

  // auto-reveal graph when memory / recall cards arrive
  const seniorMsgs = messages[SENIOR_ROOM_ID];
  const seenCards = useRef<Set<string> | null>(null);
  useEffect(() => {
    const cards = (seniorMsgs ?? []).filter(m => m.kind === 'memory_card' || m.kind === 'recall_card').map(m => m.id);
    if (seenCards.current === null) { if (status === 'ready') seenCards.current = new Set(cards); return; }
    const fresh = cards.filter(id => !seenCards.current!.has(id));
    cards.forEach(id => seenCards.current!.add(id));
    if (fresh.length && !manualRef.current) setShowGraph(true);
  }, [seniorMsgs, status]);

  // actual graph engine
  useEffect(() => {
    if (status !== 'ready') return;
    fetch('/api/status').then(r => r.json()).then(j => setEngine(j?.graphEngine ?? null)).catch(() => setEngine(null));
  }, [status, frameKey]);

  const recall = useMemo(() => {
    const list = seniorMsgs ?? [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].payload?.type === 'recall_card') return list[i].payload as RecallCardPayload;
    return null;
  }, [seniorMsgs]);

  // stale server state
  const familyMsgs = messages[FAMILY_ROOM_ID];
  const stale = status === 'ready' && cursor === 0 && !running && !reloading && !staleDismissed
    && ((demo?.clockOffsetMinutes ?? 0) !== 0 || (familyMsgs ?? []).some(m => !m.id.startsWith('seed-')) || (seniorMsgs ?? []).some(m => !m.id.startsWith('seed-')));

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
  const engineLabel = engine === 'kuzu' ? 'Kùzu 그래프 DB' : engine === 'memory' ? '메모리 그래프 (대체 모드)' : engine ? engine : '그래프 엔진 확인 중…';
  const phones = 2 + (third === 'side' ? 1 : 0);
  const availH = box.h - PAD * 2 - 40 - LABEL_H;
  const fitScale = (w: number, extraH = 0) => Math.min(1, (availH - extraH) / PHONE_H, w / (phones * PHONE_W));
  const graphW = Math.round(Math.min(520, Math.max(320, box.w * 0.36)));
  const minScale = box.w >= 1100 ? 0.72 : 0.62;
  const colScale = fitScale(box.w - PAD * 2 - GAP * phones - graphW);
  // three columns only while phones stay readable; otherwise the graph becomes a short strip BELOW the phones
  // (it never covers an active phone)
  const graphBelow = third === 'graph' && colScale < minScale;
  const STRIP_H = 176;
  const scale = Math.max(0.3, third === 'graph' && !graphBelow ? colScale
    : fitScale(box.w - PAD * 2 - GAP * (phones - 1), graphBelow ? STRIP_H + GAP : 0));
  const graphBoxH = graphBelow ? STRIP_H - LABEL_H : PHONE_H * scale;
  const phonesW = phones * PHONE_W * scale + GAP * (phones - 1);

  const graphSection = third === 'graph' && (
    <section className={`dc-graph ${graphBelow ? 'is-below' : ''}`} style={graphBelow ? { width: phonesW, height: STRIP_H } : { width: graphW, height: graphBoxH + LABEL_H }} aria-label="기억 그래프">
              <div className="dc-label">기억 그래프 · {engineLabel} · 연결 {edges.length}개{fresh.length > 0 ? ` · 방금 +${fresh.length}` : ''}</div>
              <div className="dc-graph-box" style={{ height: graphBoxH }}>
                <MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} labelMode={graphBelow ? 'focus' : 'all'} height={graphBelow ? Math.max(100, graphBoxH - 8) : Math.max(160, graphBoxH - 56 - (recall ? 150 : 0))} interactive />
                {recall ? (
                  <div className="dc-recall" aria-label="회상 근거">
                    <div className="dc-recall-h"><b>회상 근거</b><span className="caption muted"> · {recall.memory?.title}</span></div>
                    <div className="dc-chips">
                      <span className="caption faint">키워드</span>
                      {recall.matched.map(k => <span key={k} className="dc-chip">{k}</span>)}
                    </div>
                    <div className="dc-chips">
                      <span className="caption faint">경로</span>
                      {recall.path.nodes.map((n, i) => (
                        <span key={n.id + i} className="dc-chip-wrap">
                          <span className="dc-chip is-node">{n.name}</span>
                          {recall.path.edges[i] && <span className="dc-chip-rel caption faint">{recall.path.edges[i].type ?? '→'}</span>}
                        </span>
                      ))}
                    </div>
                    {recall.cypher && <pre className="dc-cypher mono">{recall.cypher}</pre>}
                  </div>
                ) : <div className="dc-recall caption faint">‘불국사’ 회상 단계에서 매칭된 경로와 Cypher가 여기 나타나요.</div>}
              </div>
    </section>
  );

  const statusLabel = status === 'ready' ? '연결됨' : status === 'error' ? '연결 오류' : '연결 중';
  const modelLabel = models?.options.find(o => o.key === models.active)?.label ?? '확인 중';
  const family = Object.values(users).filter(u => u.role !== 'ai' && u.id !== DIRECTOR_ID);
  const nextStep = DEMO_SCRIPT[cursor];
  const busy = !!running;
  const doneCount = Object.values(stat).filter(v => v === 'done' || v === 'skipped').length;
  const virtualClock = useMemo(() => fmtClock(demo?.clockOffsetMinutes ?? 0), [demo?.clockOffsetMinutes, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = startedAt === null ? null : fmtElapsed((endedAt ?? nowMs) - startedAt);

  if (status === 'error' && /키/.test(error ?? '')) {
    return (
      <main className="dc-keyerr" role="alert">
        <div>
          <h1>디렉터 키가 필요해요.</h1>
          <p className="muted">서버 시작 화면에 표시된 주소로 열어 주세요.</p>
          <p className="dc-keyerr-cta"><Link to="/" className="btn">처음으로</Link></p>
        </div>
      </main>
    );
  }

  return (
    <div className="dc">
      <aside className="dc-rail" aria-label="컨트롤 레일">
        <header className="dc-status">
          <div className="dc-status-top">
            <h1 className="dc-title"><Link to="/" className="dc-brand">타치 · 디렉터</Link></h1>
            <span className="dc-conn"><span className={`dc-dot ${status === 'ready' ? 'is-on' : ''}`} aria-hidden />{statusLabel}</span>
          </div>
          <p className="caption muted">노드 {nodes.length} · 관계 {edges.length} · {modelLabel}</p>
        </header>

        <div className="dc-rail-scroll">
          <section className="dc-sec" aria-label="화면 테마">
            <div className="dc-sec-head">
              <h2 className="dc-h">무대 테마</h2>
              <span className="dc-spacer" />
              <button className="chip" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
                {theme === 'dark' ? <Moon size={12} strokeWidth={1.5} /> : <Sun size={12} strokeWidth={1.5} />} {theme === 'dark' ? '다크' : '라이트'}
              </button>
            </div>
          </section>

          <section className="dc-sec" aria-label="모델">
            <h2 className="dc-h">모델</h2>
            <ul className="dc-models">
              {(models?.options ?? []).map(o => (
                <li key={o.key}>
                  <button className={`dc-model ${o.key === models?.active ? 'is-on' : ''}`} disabled={!o.available || busy}
                    onClick={() => { if (o.key !== models?.active) tachi.setModel(o.key); }} aria-pressed={o.key === models?.active}>
                    <span className="dc-model-check">{o.key === models?.active && <Check size={13} strokeWidth={2} />}</span>
                    <span className="dc-model-label">{o.label}</span>
                    <span className="dc-model-st caption">
                      {!o.available ? <span className="faint">키 없음</span>
                        : o.key === 'demo' ? <span className="faint">내장</span>
                        : o.healthy === undefined ? <span className="faint">미확인</span>
                        : o.healthy ? <span className="dc-ok">✓ {o.latencyMs != null ? `${o.latencyMs}ms` : ''}</span>
                        : <span className="dc-bad">✕ 응답 없음</span>}
                    </span>
                  </button>
                </li>
              ))}
              {!models && <li className="caption faint">모델 불러오는 중…</li>}
            </ul>
          </section>

          <section className="dc-sec" aria-label="시나리오">
            <div className="dc-sec-head">
              <h2 className="dc-h">시나리오</h2>
              <span className="caption faint">{doneCount}/{total}</span>
              {elapsed && <span className="caption faint dc-elapsed" title="데모 경과 시간">{elapsed}</span>}
            </div>
            <div className="dc-run-row">
              <button className="chip dc-auto" aria-pressed={auto} onClick={() => setAuto(a => !a)} disabled={cursor >= total && !auto}>
                {auto ? <Pause size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} 자동 진행
              </button>
              <button className="chip dc-replay" onClick={() => setConfirmReset(true)} disabled={busy} title="서버를 초기화하고 처음부터 재생 (R)"><RotateCcw size={12} strokeWidth={1.5} /> 처음부터 재생</button>
            </div>
            {stale && (
              <p className="dc-stale caption" role="status">이전 시연 상태가 남아 있어요 ·{' '}
                <button className="dc-link" onClick={() => setConfirmReset(true)}>처음부터 재생</button>
                <button className="dc-link faint" onClick={() => setStaleDismissed(true)} aria-label="알림 닫기">닫기</button></p>
            )}
            <p className="dc-cursor caption faint">커서 이동
              <button className="btn btn-icon dc-mini" onClick={back} disabled={busy || cursor === 0} aria-label="커서 이전 (←)"><ChevronLeft size={14} strokeWidth={1.5} /></button>
              <button className="btn btn-icon dc-mini" onClick={runNext} disabled={busy || cursor >= total} aria-label="다음 단계 실행 (→)"><ChevronRight size={14} strokeWidth={1.5} /></button>
            </p>
            <p className="dc-clock caption muted"><Clock size={12} strokeWidth={1.5} aria-hidden /> 데모 시각 {virtualClock}
              <button className="chip dc-live" onClick={() => tachi.demo.clock(null)} disabled={!demo?.clockOffsetMinutes}>실시간으로</button>
            </p>
            <ol className="dc-steps">
              {DEMO_SCRIPT.map((s, i) => {
                const st = stat[s.id];
                const isDone = st === 'done';
                const isSkipped = st === 'skipped';
                const isNext = i === cursor;
                return (
                  <li key={s.id}>
                    <button className={`dc-step ${isNext ? 'is-next' : ''} ${isDone || isSkipped ? 'is-done' : ''} ${st === 'running' ? 'is-running' : ''}`}
                      disabled={busy}
                      title={isDone && NON_REPEATABLE.has(s.id) ? '완료됨 · 다시 보내지 않아요 (처음부터 재생으로 초기화)' : undefined}
                      onClick={e => { runStep(i); e.currentTarget.blur(); }} aria-current={isNext ? 'step' : undefined}>
                      <span className="dc-step-n">
                        {st === 'running' ? <Loader2 size={13} strokeWidth={2} className="dc-spin" aria-label="진행 중" /> : isDone ? <Check size={13} strokeWidth={2} aria-label="완료" /> : isSkipped ? <span aria-label="건너뜀">–</span> : i + 1}
                      </span>
                      <span className="dc-step-main">
                        <span className="dc-step-label">{s.label}{isDone && NON_REPEATABLE.has(s.id) && !isNext && <span className="caption faint"> · 완료됨</span>}{isSkipped && <span className="caption faint"> · 건너뜀</span>}</span>
                        {(isNext || st === 'running' || st === 'timeout' || isSkipped) && (
                          <span className="dc-step-hint">{st === 'running' ? (s.director === 'model' && modelTarget ? `→ ${modelTarget} · 응답 기다리는 중…` : '응답 기다리는 중…') : st === 'timeout' ? (outcomeExists(s.id) ? '이미 반영돼 있어요 · 눌러서 이어가기' : '시간 초과 · 다시 눌러 재시도') : isSkipped ? (skip[s.id] ?? '건너뛰었어요') : s.hint}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="dc-keys faint">→ 또는 Space 다음 · ← 커서 이전 · R 처음부터 재생{nextStep ? '' : ' · 끝!'}</p>
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
              <button className="btn dc-btn" onClick={() => tachi.demo.followups()} title="기한이 지난 할 일을 지금 챙겨요 (데모 시각 기준)">할 일 챙기기</button>
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
          <button className="chip" aria-pressed={showSide && !showGraph} onClick={() => { setManualStage(true); setShowGraph(false); setShowSide(v => !v || showGraph); }}>민준 · 사이드 챗</button>
          <button className="chip" aria-pressed={showGraph} onClick={() => { setManualStage(true); setShowGraph(v => !v); }}>기억 그래프</button>
        </div>
        <div className={`dc-body ${graphBelow ? 'is-below' : ''}`}>
        <div className="dc-frames" style={{ gap: GAP }}>
          <Phone scale={scale} label="어머니 · 시니어 앱" name="김순자" src={`/senior?as=mom&embed=1${themeQ}`} k={frameKey} />
          <Phone scale={scale} label="딸 지은 · 가족방" name="김지은" src={`/family?as=jieun&embed=1${themeQ}`} k={frameKey} />
          {third === 'side' && (
            <Phone scale={scale} label="민준 · 사이드 챗" name="박민준" k={frameKey}
              src={(sideRoomId ? `/family?as=minjun&embed=1&room=${encodeURIComponent(sideRoomId)}` : '/family?as=minjun&embed=1') + themeQ}
              caption={sideRoomId ? undefined : '일정 조율이 시작되면 사이드 챗이 열려요'} />
          )}
          {!graphBelow && graphSection}
        </div>
        {graphBelow && graphSection}
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
