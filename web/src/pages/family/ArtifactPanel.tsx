import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Sparkles, CalendarClock, X } from 'lucide-react';
import type { Artifact } from '../../../../shared/types';
import { useTachi, tachi } from '../../lib/store';
import { Avatar } from '../../components/common/Avatar';
import './ArtifactPanel.css';

const STATUS_LABEL: Record<Artifact['dateStatus'], string> = { undecided: '미정', polling: '조율 중', confirmed: '확정' };

function useFlash(value: unknown, byOther: boolean) {
  const prev = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (!byOther) return;
    setOn(true);
    const t = window.setTimeout(() => setOn(false), 1500);
    return () => window.clearTimeout(t);
  }, [value, byOther]);
  return on;
}

interface FieldProps {
  value: string;
  onCommit: (v: string) => void;
  byOther: boolean;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label: string;
}

/** Locally-edited text field that debounces commits (400ms) and flashes when someone else changes it. */
function Field({ value, onCommit, byOther, multiline, className = '', placeholder, label }: FieldProps) {
  const [local, setLocal] = useState(value);
  const localRef = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const flash = useFlash(value, byOther);

  useEffect(() => { if (!dirty.current) { setLocal(value); localRef.current = value; } }, [value]);

  const flush = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    if (dirty.current) { dirty.current = false; commit.current(localRef.current); }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (v: string) => {
    setLocal(v); localRef.current = v; dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  };

  const cls = `ap-field ${className} ${flash ? 'is-flash' : ''}`;
  return multiline ? (
    <textarea className={cls} rows={2} value={local} placeholder={placeholder} aria-label={label}
      onChange={e => change(e.target.value)} onBlur={flush} />
  ) : (
    <input className={cls} value={local} placeholder={placeholder} aria-label={label}
      onChange={e => change(e.target.value)} onBlur={flush} />
  );
}

function AgendaEditor({ artifact, byOther }: { artifact: Artifact; byOther: boolean }) {
  const [items, setItems] = useState<string[]>(artifact.agenda);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(items);
  const key = JSON.stringify(artifact.agenda);
  const flash = useFlash(key, byOther);

  useEffect(() => { if (!dirty.current) { setItems(artifact.agenda); latest.current = artifact.agenda; } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = () => {
    window.clearTimeout(timer.current);
    if (dirty.current) { dirty.current = false; tachi.updateArtifact(artifact.id, { agenda: latest.current.filter(s => s.trim()) }); }
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: string[], immediate = false) => {
    setItems(next); latest.current = next; dirty.current = true;
    window.clearTimeout(timer.current);
    if (immediate) flush(); else timer.current = window.setTimeout(flush, 400);
  };

  return (
    <ol className={`ap-agenda ${flash ? 'is-flash' : ''}`}>
      {items.map((it, i) => (
        <li key={i} className="ap-agenda-row">
          <span className="ap-num">{i + 1}</span>
          <input className="ap-field" value={it} aria-label={`일정 ${i + 1}`}
            onChange={e => update(items.map((x, j) => (j === i ? e.target.value : x)))} onBlur={flush} />
          <button className="btn btn-icon ap-rm" aria-label={`일정 ${i + 1} 삭제`} onClick={() => update(items.filter((_, j) => j !== i), true)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </li>
      ))}
      <li>
        <button className="btn btn-ghost ap-add" onClick={() => update([...items, ''])}><Plus size={14} strokeWidth={1.5} /> 일정 추가</button>
      </li>
    </ol>
  );
}

function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

export function ArtifactPanel({ artifactId }: { artifactId: string }) {
  const artifact = useTachi(s => s.artifacts[artifactId]);
  const meId = useTachi(s => s.meId);
  const users = useTachi(s => s.users);
  const room = useTachi(s => (artifact ? s.rooms.find(r => r.id === artifact.roomId) : undefined));
  const messages = useTachi(s => (artifact ? s.messages[artifact.roomId] : undefined));
  const poll = useTachi(s => (artifact?.pollId ? s.polls[artifact.pollId] : undefined));
  const [now, setNow] = useState(() => Date.now());
  const [newTask, setNewTask] = useState('');
  const [assisting, setAssisting] = useState(false);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(t); }, []);
  useEffect(() => { if (assisting) { const t = window.setTimeout(() => setAssisting(false), 3000); return () => window.clearTimeout(t); } }, [assisting]);

  const members = useMemo(() => (room?.memberIds ?? []).filter(id => id !== 'tachi').map(id => users[id]).filter(Boolean), [room, users]);
  const artifactMsg = useMemo(
    () => (messages ?? []).find(m => m.payload?.type === 'artifact' && m.payload.artifactId === artifactId),
    [messages, artifactId],
  );

  const candidate = useMemo(() => {
    if (!artifact?.pollId) return null;
    const list = messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const pl = list[i].payload;
      if (pl?.type === 'schedule_result' && pl.pollId === artifact.pollId) return pl.confirmed === false ? pl.slot : null;
    }
    return null;
  }, [messages, artifact?.pollId]);
  const pollOpen = poll?.status === 'open';

  if (!artifact) return <div className="ap-empty muted caption">모임 정보를 불러오지 못했어요.</div>;

  const byOther = artifact.updatedBy !== meId;
  const updater = users[artifact.updatedBy];
  const patch = (p: Parameters<typeof tachi.updateArtifact>[1]) => tachi.updateArtifact(artifact.id, p);
  const doneCount = artifact.tasks.filter(t => t.done).length;

  const addTask = () => {
    const t = newTask.trim();
    if (!t) return;
    tachi.artifactTask(artifact.id, 'add', { text: t });
    setNewTask('');
  };

  return (
    <div className="ap">
      <Field className="ap-title" value={artifact.title} label="모임 제목" byOther={byOther} onCommit={v => patch({ title: v })} />
      <div className="ap-meta">
        <span className={`badge ap-status ap-status-${artifact.dateStatus}`}>{STATUS_LABEL[artifact.dateStatus]}</span>
        <span className="caption">{artifact.dateStatus !== 'confirmed' && candidate ? `후보: ${candidate.label}` : (artifact.dateLabel ?? '날짜 미정')}</span>
        {artifact.place && <span className="caption muted">· {artifact.place}</span>}
      </div>
      <p className="ap-live caption faint" aria-live="polite">
        {updater ? `${updater.shortName}${updater.id === 'tachi' ? '가' : '님이'} ${ago(artifact.updatedAt, now)} 수정` : `${ago(artifact.updatedAt, now)} 수정`}
      </p>

      <div className="ap-actions">
        <button className="btn" onClick={() => { tachi.assistArtifact(artifact.id); setAssisting(true); }} disabled={assisting}>
          <Sparkles size={14} strokeWidth={1.5} /> {assisting ? '아이디어 찾는 중…' : '타치에게 아이디어 받기'}
        </button>
        {artifact.dateStatus === 'undecided' && (
          <button className="btn btn-primary" disabled={!artifactMsg || pollOpen}
            onClick={() => artifactMsg && tachi.action(artifact.roomId, artifactMsg.id, 'start_scheduling', { artifactId: artifact.id })}>
            <CalendarClock size={14} strokeWidth={1.5} /> 일정 조율 시작
          </button>
        )}
      </div>

      {poll && artifact.dateStatus !== 'confirmed' && (
        <section className="ap-poll" aria-label="일정 조율 현황">
          <h3 className="ap-h">일정 조율 · 응답 {Object.keys(poll.responses).length}/{poll.participantIds.length}</h3>
          <div className="ap-poll-people">
            {poll.participantIds.map(id => {
              const u = users[id];
              const ok = poll.responses[id] !== undefined;
              return (
                <span key={id} className={`ap-poll-p ${ok ? 'is-in' : ''}`} title={u?.name}>
                  <Avatar user={u} size={28} hollow={!ok} />
                  <span className="caption">{u?.shortName ?? id}</span>
                  <span className="ap-poll-st muted">{ok ? <><Check size={12} strokeWidth={2} aria-hidden /><span className="sr-only">응답함</span></> : '대기'}</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      <Section title="배경"><Field multiline value={artifact.background} label="모임 배경" byOther={byOther} onCommit={v => patch({ background: v })} placeholder="왜 모이는지 적어 주세요" /></Section>
      <Section title="목적"><Field multiline value={artifact.purpose} label="모임 목적" byOther={byOther} onCommit={v => patch({ purpose: v })} placeholder="이번 모임의 목적" /></Section>
      <Section title="장소"><Field value={artifact.place} label="장소" byOther={byOther} onCommit={v => patch({ place: v })} placeholder="어디서 만날까요?" /></Section>
      <Section title="일정"><AgendaEditor artifact={artifact} byOther={byOther} /></Section>

      <Section title={`할 일 ${artifact.tasks.length ? `${doneCount}/${artifact.tasks.length}` : ''}`}>
        <ul className="ap-tasks">
          {artifact.tasks.map(t => {
            const as = t.assigneeId ? users[t.assigneeId] : undefined;
            return (
              <li key={t.id} className="ap-task">
                <label className="ap-check-hit">
                  <input type="checkbox" className="ap-check" checked={t.done} aria-label={`${t.text} 완료`}
                    onChange={() => tachi.artifactTask(artifact.id, 'toggle', { taskId: t.id })} />
                </label>
                <span className={`ap-task-text ${t.done ? 'is-done' : ''}`}>{t.text}</span>
                <span className="ap-assign">
                  {as ? <Avatar user={as} size={22} /> : <span className="ap-noassign" aria-hidden />}
                  <select className="ap-select" aria-label={`${t.text} 담당자`} value={t.assigneeId ?? ''}
                    onChange={e => tachi.artifactTask(artifact.id, 'assign', { taskId: t.id, assigneeId: e.target.value })}>
                    <option value="">담당 미정</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.shortName}</option>)}
                  </select>
                </span>
                <button className="btn btn-icon ap-rm" aria-label={`${t.text} 삭제`} onClick={() => tachi.artifactTask(artifact.id, 'remove', { taskId: t.id })}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="ap-addtask">
          <input className="input" value={newTask} placeholder="할 일 추가" aria-label="할 일 추가"
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addTask(); }} />
          <button className="btn btn-icon" aria-label="할 일 추가" onClick={addTask} disabled={!newTask.trim()}><Plus size={16} strokeWidth={1.5} /></button>
        </div>
      </Section>

      <Section title="메모"><Field multiline value={artifact.notes} label="메모" byOther={byOther} onCommit={v => patch({ notes: v })} placeholder="함께 적어 두고 싶은 것" /></Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ap-sec">
      <h3 className="ap-h">{title}</h3>
      {children}
    </section>
  );
}
