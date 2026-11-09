import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock, Loader2, Moon, Pause, Play, QrCode, RotateCcw, Sun } from 'lucide-react';
import { demoScriptFor, DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ROOM_ID, type DemoStep } from '../../../../shared/constants';
import type { ProactiveKind, ModelKey, RecallCardPayload } from '../../../../shared/types';
import { getState, initTachi, tachi, useTachi } from '../../lib/store';
import { useT, useLocale } from '../../lib/i18n';
import type { Locale } from '../../../../shared/types';
import { Segmented } from '../../components/common/Segmented';
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

const PROACTIVE: { kind: ProactiveKind; key: string }[] = [
  { kind: 'morning', key: 'dir.pMorning' }, { kind: 'memory', key: 'dir.pMemory' },
  { kind: 'evening', key: 'dir.pEvening' }, { kind: 'ask_photo', key: 'dir.pPhoto' },
];

const STEP_TIMEOUT = 45000;
const DWELL = 1500;
const DWELL_LONG = 3000;
const LONG_KINDS = new Set(['memory_card', 'share_card', 'itinerary', 'schedule_result']);

type StepStat = 'running' | 'done' | 'timeout' | 'skipped';

// completed steps that must not be sent again (replay only via "Replay from start")
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
  const t = useT();
  const locale = useLocale();
  const script = useMemo(() => demoScriptFor(locale), [locale]);
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

  const total = script.length;
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
    const step = script[i];
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
        setSkip(d => ({ ...d, [step.id]: 'dir.skipNoModel' }));
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
        setSkip(d => ({ ...d, [step.id]: 'dir.skipNoSwap' }));
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
  }, [total, script]);

  // completion watcher
  useEffect(() => {
    if (!running) return;
    const step = script[running.i];
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
  }, [running, messages, total, script]);

  // timeout
  useEffect(() => {
    if (!running) return;
    const step = script[running.i];
    const to = window.setTimeout(() => {
      setStat(d => ({ ...d, [step.id]: 'timeout' }));
      runningRef.current = null;
      setRunning(null);
      setModelTarget(null);
      setAuto(false);
    }, STEP_TIMEOUT);
    return () => window.clearTimeout(to);
  }, [running, script]);

  // dwell after completion
  const lastDoneKind = script[cursor - 1]?.waitFor?.kind ?? null;
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
    setStat(d => { const n = { ...d }; const s = script[c]; if (s && !NON_REPEATABLE.has(s.id)) delete n[s.id]; return n; });
  }, [script]);
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

  // product language switch: the server re-seeds in that language and tells clients to re-bootstrap ('reset');
  // also catch the locale change itself so the cursor / frames never keep the other language's script
  const localeRef = useRef(locale);
  useEffect(() => {
    if (localeRef.current === locale) return;
    localeRef.current = locale;
    resetCursor(); setReloading(true);
  }, [locale, resetCursor]);
  const switchLocale = (l: Locale) => { if (l !== locale && !running) tachi.setLocale(l); };

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
  const engineLabel = engine === 'kuzu' ? t('dir.engineKuzu') : engine === 'memory' ? t('dir.engineMemory') : engine ? engine : t('dir.engineChecking');
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
    <section className={`dc-graph ${graphBelow ? 'is-below' : ''}`} style={graphBelow ? { width: phonesW, height: STRIP_H } : { width: graphW, height: graphBoxH + LABEL_H }} aria-label={t('dir.graph')}>
              <div className="dc-label">{t('dir.graph')} · {engineLabel} · {t('mp.links', { n: edges.length })}{fresh.length > 0 ? ` · ${t('dir.justNew', { n: fresh.length })}` : ''}</div>
              <div className="dc-graph-box" style={{ height: graphBoxH }}>
                <MemoryGraph nodes={nodes} edges={edges} highlightIds={fresh} labelMode={graphBelow ? 'focus' : 'all'} height={graphBelow ? Math.max(100, graphBoxH - 8) : Math.max(160, graphBoxH - 56 - (recall ? 150 : 0))} interactive />
                {recall ? (
                  <div className="dc-recall" aria-label={t('dir.recallBasis')}>
                    <div className="dc-recall-h"><b>{t('dir.recallBasis')}</b><span className="caption muted"> · {recall.memory?.title}</span></div>
                    <div className="dc-chips">
                      <span className="caption faint">{t('dir.keywords')}</span>
                      {recall.matched.map(k => <span key={k} className="dc-chip">{k}</span>)}
                    </div>
                    <div className="dc-chips">
                      <span className="caption faint">{t('dir.path')}</span>
                      {recall.path.nodes.map((n, i) => (
                        <span key={n.id + i} className="dc-chip-wrap">
                          <span className="dc-chip is-node">{n.name}</span>
                          {recall.path.edges[i] && <span className="dc-chip-rel caption faint">{recall.path.edges[i].type ?? '→'}</span>}
                        </span>
                      ))}
                    </div>
                    {recall.cypher && <pre className="dc-cypher mono">{recall.cypher}</pre>}
                  </div>
                ) : <div className="dc-recall caption faint">{t('dir.recallEmpty')}</div>}
              </div>
    </section>
  );

  const statusLabel = status === 'ready' ? t('dir.connected') : status === 'error' ? t('dir.connError') : t('dir.connecting');
  const modelLabel = models?.options.find(o => o.key === models.active)?.label ?? t('dir.checking');
  const family = Object.values(users).filter(u => u.role !== 'ai' && u.id !== DIRECTOR_ID);
  const nextStep = script[cursor];
  const busy = !!running;
  const doneCount = Object.values(stat).filter(v => v === 'done' || v === 'skipped').length;
  const virtualClock = useMemo(() => fmtClock(demo?.clockOffsetMinutes ?? 0), [demo?.clockOffsetMinutes, clockTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const elapsed = startedAt === null ? null : fmtElapsed((endedAt ?? nowMs) - startedAt);

  if (status === 'error' && /키|key/i.test(error ?? '')) {
    return (
      <main className="dc-keyerr" role="alert">
        <div>
          <h1>{t('dir.keyNeeded')}</h1>
          <p className="muted">{t('dir.keyHint')}</p>
          <p className="dc-keyerr-cta"><Link to="/" className="btn">{t('dir.home')}</Link></p>
        </div>
      </main>
    );
  }

  return (
    <div className="dc">
      <aside className="dc-rail" aria-label={t('dir.rail')}>
        <header className="dc-status">
          <div className="dc-status-top">
            <h1 className="dc-title"><Link to="/" className="dc-brand">{t('dir.brand')}</Link></h1>
            <span className="dc-conn"><span className={`dc-dot ${status === 'ready' ? 'is-on' : ''}`} aria-hidden />{statusLabel}</span>
          </div>
          <p className="caption muted">{t('dir.counts', { nodes: nodes.length, edges: edges.length })} · {modelLabel}</p>
        </header>

        <div className="dc-rail-scroll">
          <section className="dc-sec" aria-label={t('dir.language')}>
            <h2 className="dc-h">{t('dir.language')}</h2>
            <Segmented<Locale> label={t('dir.language')} value={locale} onChange={switchLocale}
              options={[{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어' }]} />
            <p className="caption faint dc-lang-note">{t('dir.languageNote')}</p>
          </section>

          <section className="dc-sec" aria-label={t('dir.theme')}>
            <div className="dc-sec-head">
              <h2 className="dc-h">{t('dir.theme')}</h2>
              <span className="dc-spacer" />
              <button className="chip" onClick={toggleTheme} aria-pressed={theme === 'dark'}>
                {theme === 'dark' ? <Moon size={12} strokeWidth={1.5} /> : <Sun size={12} strokeWidth={1.5} />} {theme === 'dark' ? t('dir.dark') : t('dir.light')}
              </button>
            </div>
          </section>

          <section className="dc-sec" aria-label={t('dir.model')}>
            <h2 className="dc-h">{t('dir.model')}</h2>
            <ul className="dc-models">
              {(models?.options ?? []).map(o => (
                <li key={o.key}>
                  <button className={`dc-model ${o.key === models?.active ? 'is-on' : ''}`} disabled={!o.available || busy}
                    onClick={() => { if (o.key !== models?.active) tachi.setModel(o.key); }} aria-pressed={o.key === models?.active}>
                    <span className="dc-model-check">{o.key === models?.active && <Check size={13} strokeWidth={2} />}</span>
                    <span className="dc-model-label">{o.label}</span>
                    <span className="dc-model-st caption">
                      {!o.available ? <span className="faint">{t('dir.noKey')}</span>
                        : o.key === 'demo' ? <span className="faint">{t('dir.builtin')}</span>
                        : o.healthy === undefined ? <span className="faint">{t('dir.unchecked')}</span>
                        : o.healthy ? <span className="dc-ok">✓ {o.latencyMs != null ? `${o.latencyMs}ms` : ''}</span>
                        : <span className="dc-bad">✕ {t('dir.noReply')}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {!models && <li className="caption faint">{t('dir.modelsLoading')}</li>}
            </ul>
            <ApiKeyForm />
          </section>

          <section className="dc-sec" aria-label={t('dir.scenario')}>
            <div className="dc-sec-head">
              <h2 className="dc-h">{t('dir.scenario')}</h2>
              <span className="caption faint">{doneCount}/{total}</span>
              {elapsed && <span className="caption faint dc-elapsed" title={t('dir.elapsed')}>{elapsed}</span>}
            </div>
            <div className="dc-run-row">
              <button className="chip dc-auto" aria-pressed={auto} onClick={() => setAuto(a => !a)} disabled={cursor >= total && !auto}>
                {auto ? <Pause size={12} strokeWidth={1.5} /> : <Play size={12} strokeWidth={1.5} />} {t('dir.auto')}
              </button>
              <button className="chip dc-replay" onClick={() => setConfirmReset(true)} disabled={busy} title={t('dir.replayTitle')}><RotateCcw size={12} strokeWidth={1.5} /> {t('dir.replay')}</button>
            </div>
            {stale && (
              <p className="dc-stale caption" role="status">{t('dir.stale')} ·{' '}
                <button className="dc-link" onClick={() => setConfirmReset(true)}>{t('dir.replay')}</button>
                <button className="dc-link faint" onClick={() => setStaleDismissed(true)} aria-label={t('dir.dismiss')}>{t('fam.close')}</button></p>
            )}
            <p className="dc-cursor caption faint">{t('dir.cursor')}
              <button className="btn btn-icon dc-mini" onClick={back} disabled={busy || cursor === 0} aria-label={t('dir.cursorPrev')}><ChevronLeft size={14} strokeWidth={1.5} /></button>
              <button className="btn btn-icon dc-mini" onClick={runNext} disabled={busy || cursor >= total} aria-label={t('dir.cursorNext')}><ChevronRight size={14} strokeWidth={1.5} /></button>
            </p>
            <p className="dc-clock caption muted"><Clock size={12} strokeWidth={1.5} aria-hidden /> {t('dir.demoTime')} {virtualClock}
              <button className="chip dc-live" onClick={() => tachi.demo.clock(null)} disabled={!demo?.clockOffsetMinutes}>{t('dir.live')}</button>
            </p>
            <ol className="dc-steps">
              {script.map((s, i) => {
                const st = stat[s.id];
                const isDone = st === 'done';
                const isSkipped = st === 'skipped';
                const isNext = i === cursor;
                return (
                  <li key={s.id}>
                    <button className={`dc-step ${isNext ? 'is-next' : ''} ${isDone || isSkipped ? 'is-done' : ''} ${st === 'running' ? 'is-running' : ''}`}
                      disabled={busy}
                      title={isDone && NON_REPEATABLE.has(s.id) ? t('dir.doneTitle') : undefined}
                      onClick={e => { runStep(i); e.currentTarget.blur(); }} aria-current={isNext ? 'step' : undefined}>
                      <span className="dc-step-n">
                        {st === 'running' ? <Loader2 size={13} strokeWidth={2} className="dc-spin" aria-label={t('dir.running')} /> : isDone ? <Check size={13} strokeWidth={2} aria-label={t('dir.done')} /> : isSkipped ? <span aria-label={t('dir.skippedLabel')}>–</span> : i + 1}
                      </span>
                      <span className="dc-step-main">
                        <span className="dc-step-label">{s.label}{isDone && NON_REPEATABLE.has(s.id) && !isNext && <span className="caption faint"> · {t('dir.doneTag')}</span>}{isSkipped && <span className="caption faint"> · {t('dir.skippedLabel')}</span>}</span>
                        {(isNext || st === 'running' || st === 'timeout' || isSkipped) && (
                          <span className="dc-step-hint">{st === 'running' ? (s.director === 'model' && modelTarget ? `→ ${modelTarget} · ${t('dir.waiting')}` : t('dir.waiting')) : st === 'timeout' ? (outcomeExists(s.id) ? t('dir.timeoutDone') : t('dir.timeoutRetry')) : isSkipped ? t(skip[s.id] ?? 'dir.skipDefault') : s.hint}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="dc-keys faint">{t('dir.keys')}{nextStep ? '' : ` · ${t('dir.end')}`}</p>
          </section>

          <section className="dc-sec" aria-label={t('app.name')}>
            <h2 className="dc-h">{t('app.name')}</h2>
            <div className="dc-grid2">
              {PROACTIVE.map(p => (
                <button key={p.kind} className="btn dc-btn" onClick={() => tachi.demo.proactive(p.kind)}>{t(p.key)}</button>
              ))}
            </div>
            <div className="dc-grid2">
              <button className="btn dc-btn" onClick={() => tachi.demo.report()}>{t('dir.sendReport')}</button>
              <button className="btn dc-btn" onClick={() => tachi.demo.closePoll()}>{t('dir.closePoll')}</button>
            </div>
          </section>

          <section className="dc-sec" aria-label={t('dir.bots')}>
            <div className="dc-sec-head">
              <h2 className="dc-h">{t('dir.bots')}</h2>
              <span className="dc-spacer" />
              <button role="switch" aria-checked={!!demo?.botsEnabled} aria-label={t('dir.botsOn')} className={`dc-switch ${demo?.botsEnabled ? 'is-on' : ''}`}
                onClick={() => tachi.demo.bots(!demo?.botsEnabled)}><span /></button>
            </div>
            <ul className="dc-presence">
              {family.map(u => {
                const human = presence.claimed.includes(u.id) || !u.isBot;
                return (
                  <li key={u.id} className="dc-p">
                    <Avatar user={u} size={22} hollow={!human} />
                    <span className="caption">{u.shortName}</span>
                    <span className="dc-p-st faint">{human ? t('dir.human') : t('dir.bot')}</span>
                  </li>
                );
              })}
            </ul>
          </section>


          <section className="dc-sec" aria-label={t('dir.devices')}>
            <div className="dc-sec-head">
              <h2 className="dc-h">{t('dir.devices')}</h2>
              <span className="dc-spacer" />
              <button className="btn dc-btn" onClick={() => setQr(true)}><QrCode size={14} strokeWidth={1.5} /> {t('dir.showQr')}</button>
            </div>
            <p className="caption faint">{lan?.urls[0] ?? t('dir.addrChecking')} · {t('dir.pickRole')}</p>
          </section>
        </div>

        <footer className="dc-rail-foot">
          <button className="btn dc-btn dc-reset" onClick={() => setConfirmReset(true)}>{t('dir.reset')}</button>
        </footer>
      </aside>

      <main className="dc-stage" ref={stageRef} aria-label={t('dir.stage')}>
        <div className="dc-toggles">
          <button className="chip" aria-pressed={showSide && !showGraph} onClick={() => { setManualStage(true); setShowGraph(false); setShowSide(v => !v || showGraph); }}>{t('dir.sideToggle', { name: users.minjun?.shortName ?? 'Minjun' })}</button>
          <button className="chip" aria-pressed={showGraph} onClick={() => { setManualStage(true); setShowGraph(v => !v); }}>{t('dir.graph')}</button>
        </div>
        <div className={`dc-body ${graphBelow ? 'is-below' : ''}`}>
        <div className="dc-frames" style={{ gap: GAP }}>
          <Phone scale={scale} label={t('dir.phoneMom', { name: users.mom?.shortName ?? '' })} name={users.mom?.name ?? ''} src={`/senior?as=mom&embed=1${themeQ}`} k={frameKey} />
          <Phone scale={scale} label={t('dir.phoneJieun', { name: users.jieun?.shortName ?? '' })} name={users.jieun?.name ?? ''} src={`/family?as=jieun&embed=1${themeQ}`} k={frameKey} />
          {third === 'side' && (
            <Phone scale={scale} label={t('dir.sideToggle', { name: users.minjun?.shortName ?? 'Minjun' })} name={users.minjun?.name ?? ''} k={frameKey}
              src={(sideRoomId ? `/family?as=minjun&embed=1&room=${encodeURIComponent(sideRoomId)}` : '/family?as=minjun&embed=1') + themeQ}
              caption={sideRoomId ? undefined : t('dir.sideWait')} />
          )}
          {!graphBelow && graphSection}
        </div>
        {graphBelow && graphSection}
        </div>
      </main>

      {confirmReset && (
        <Dialog title={t('dir.resetTitle')} onClose={() => setConfirmReset(false)} width={400}
          footer={<><button className="btn" onClick={() => setConfirmReset(false)}>{t('fam.cancel')}</button><button className="btn btn-primary" onClick={doReset}>{t('dir.resetDo')}</button></>}>
          <p className="caption muted">{t('dir.resetBody')}</p>
        </Dialog>
      )}
      {qr && (
        <Dialog title={t('dir.devices')} onClose={() => setQr(false)} width={380}>
          <div className="dc-qr">
            {lan?.qr ? <img src={lan.qr} alt={t('app.qrAlt')} width={220} height={220} /> : <p className="caption faint">{t('dir.qrFail')}</p>}
            {lan?.urls.map(u => <p key={u} className="mono">{u}</p>)}
            <p className="caption muted">{t('dir.qrHint')}</p>
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


/** Operator BYO key: the key goes to the server over the Director socket and lives in process memory only. */
function ApiKeyForm() {
  const t = useT();
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai');
  const [key, setKey] = useState('');
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState('');
  const submit = async (value: string) => {
    setPending(true); setNote('');
    const r = await tachi.setApiKey(provider, value);
    setPending(false);
    if (!r.ok) { setNote(t('dir.key.fail', { error: r.error ?? '?' })); return; }
    setKey('');
    const ms = getState().models;
    const label = ms?.options.find(o => o.key === ms.active)?.label ?? '';
    setNote(value ? t('dir.key.ok', { model: label }) : t('dir.key.cleared'));
  };
  return (
    <form className="dc-key" onSubmit={e => { e.preventDefault(); if (key.trim()) void submit(key.trim()); }}>
      <h3 className="dc-key-h caption">{t('dir.key.title')}</h3>
      <div className="dc-key-prov" role="group" aria-label={t('dir.key.title')}>
        {(['openai', 'anthropic'] as const).map(p => (
          <button key={p} type="button" className="chip" aria-pressed={provider === p} onClick={() => setProvider(p)}>
            {p === 'openai' ? 'OpenAI' : 'Anthropic'}
          </button>
        ))}
      </div>
      <div className="dc-key-row">
        <input className="input" type="password" autoComplete="off" spellCheck={false} value={key}
          onChange={e => setKey(e.target.value)} placeholder={t('dir.key.placeholder')} aria-label={t('dir.key.title')} />
        <button className="btn btn-primary" type="submit" disabled={pending || !key.trim()}>{t('dir.key.connect')}</button>
        <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => void submit('')}>{t('dir.key.clear')}</button>
      </div>
      <p className="caption faint" role="status">{note || t('dir.key.hint')}</p>
    </form>
  );
}
