import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Sparkles, CalendarClock, X } from 'lucide-react';
import type { Artifact } from '../../../../shared/types';
import { useTachi, tachi } from '../../lib/store';
import { useT, type Vars } from '../../lib/i18n';
import { Avatar } from '../../components/common/Avatar';
import './ArtifactPanel.css';

type T = (key: string, vars?: Vars) => string;

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
  const t = useT();
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
          <input className="ap-field" value={it} aria-label={t('ap.agendaItem', { n: i + 1 })}
            onChange={e => update(items.map((x, j) => (j === i ? e.target.value : x)))} onBlur={flush} />
          <button className="btn btn-icon ap-rm" aria-label={t('ap.agendaRemove', { n: i + 1 })} onClick={() => update(items.filter((_, j) => j !== i), true)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </li>
      ))}
      <li>
        <button className="btn btn-ghost ap-add" onClick={() => update([...items, ''])}><Plus size={14} strokeWidth={1.5} /> {t('ap.addAgenda')}</button>
      </li>
    </ol>
  );
}

function ago(iso: string, now: number, t: T) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('ap.justNow');
  if (s < 3600) return t('ap.minAgo', { n: Math.floor(s / 60) });
  return t('ap.hrAgo', { n: Math.floor(s / 3600) });
}

export function ArtifactPanel({ artifactId }: { artifactId: string }) {
  const t = useT();
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

  if (!artifact) return <div className="ap-empty muted caption">{t('ap.loadFail')}</div>;

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
      <Field className="ap-title" value={artifact.title} label={t('ap.titleLabel')} byOther={byOther} onCommit={v => patch({ title: v })} />
      <div className="ap-meta">
        <span className={`badge ap-status ap-status-${artifact.dateStatus}`}>{t(`ap.status.${artifact.dateStatus}`)}</span>
        <span className="caption">{artifact.dateStatus !== 'confirmed' && candidate ? t('ap.candidate', { label: candidate.label }) : (artifact.dateLabel ?? t('ap.dateTbd'))}</span>
        {artifact.place && <span className="caption muted">· {artifact.place}</span>}
      </div>
      <p className="ap-live caption faint" aria-live="polite">
        {updater ? t(updater.id === 'tachi' ? 'ap.editedByTachi' : 'ap.editedBy', { name: updater.shortName, when: ago(artifact.updatedAt, now, t) }) : t('ap.edited', { when: ago(artifact.updatedAt, now, t) })}
      </p>

      <div className="ap-actions">
        <button className="btn" onClick={() => { tachi.assistArtifact(artifact.id); setAssisting(true); }} disabled={assisting}>
          <Sparkles size={14} strokeWidth={1.5} /> {assisting ? t('ap.ideasBusy') : t('ap.ideas')}
        </button>
        {artifact.dateStatus === 'undecided' && (
          <button className="btn btn-primary" disabled={!artifactMsg || pollOpen}
            onClick={() => artifactMsg && tachi.action(artifact.roomId, artifactMsg.id, 'start_scheduling', { artifactId: artifact.id })}>
            <CalendarClock size={14} strokeWidth={1.5} /> {t('ap.startScheduling')}
          </button>
        )}
      </div>

      {poll && artifact.dateStatus !== 'confirmed' && (
        <section className="ap-poll" aria-label={t('ap.pollStatus')}>
          <h3 className="ap-h">{t('ap.pollHead', { n: Object.keys(poll.responses).length, m: poll.participantIds.length })}</h3>
          <div className="ap-poll-people">
            {poll.participantIds.map(id => {
              const u = users[id];
              const ok = poll.responses[id] !== undefined;
              return (
                <span key={id} className={`ap-poll-p ${ok ? 'is-in' : ''}`} title={u?.name}>
                  <Avatar user={u} size={28} hollow={!ok} />
                  <span className="caption">{u?.shortName ?? id}</span>
                  <span className="ap-poll-st muted">{ok ? <><Check size={12} strokeWidth={2} aria-hidden /><span className="sr-only">{t('ap.responded')}</span></> : t('ap.waiting')}</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      <Section title={t('ap.background')}><Field multiline value={artifact.background} label={t('ap.backgroundLabel')} byOther={byOther} onCommit={v => patch({ background: v })} placeholder={t('ap.backgroundPh')} /></Section>
      <Section title={t('ap.purpose')}><Field multiline value={artifact.purpose} label={t('ap.purposeLabel')} byOther={byOther} onCommit={v => patch({ purpose: v })} placeholder={t('ap.purposePh')} /></Section>
      <Section title={t('ap.place')}><Field value={artifact.place} label={t('ap.place')} byOther={byOther} onCommit={v => patch({ place: v })} placeholder={t('ap.placePh')} /></Section>
      <Section title={t('ap.agenda')}><AgendaEditor artifact={artifact} byOther={byOther} /></Section>

      <Section title={`${t('ap.tasks')} ${artifact.tasks.length ? `${doneCount}/${artifact.tasks.length}` : ''}`}>
        <ul className="ap-tasks">
          {artifact.tasks.map(task => {
            const as = task.assigneeId ? users[task.assigneeId] : undefined;
            return (
              <li key={task.id} className="ap-task">
                <label className="ap-check-hit">
                  <input type="checkbox" className="ap-check" checked={task.done} aria-label={t('ap.taskDone', { text: task.text })}
                    onChange={() => tachi.artifactTask(artifact.id, 'toggle', { taskId: task.id })} />
                </label>
                <span className={`ap-task-text ${task.done ? 'is-done' : ''}`}>{task.text}</span>
                <span className="ap-assign">
                  {as ? <Avatar user={as} size={22} /> : <span className="ap-noassign" aria-hidden />}
                  <select className="ap-select" aria-label={t('ap.assignee', { text: task.text })} value={task.assigneeId ?? ''}
                    onChange={e => tachi.artifactTask(artifact.id, 'assign', { taskId: task.id, assigneeId: e.target.value })}>
                    <option value="">{t('ap.unassigned')}</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.shortName}</option>)}
                  </select>
                </span>
                <button className="btn btn-icon ap-rm" aria-label={t('ap.taskRemove', { text: task.text })} onClick={() => tachi.artifactTask(artifact.id, 'remove', { taskId: task.id })}>
                  <X size={14} strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="ap-addtask">
          <input className="input" value={newTask} placeholder={t('ap.addTask')} aria-label={t('ap.addTask')}
            onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addTask(); }} />
          <button className="btn btn-icon" aria-label={t('ap.addTask')} onClick={addTask} disabled={!newTask.trim()}><Plus size={16} strokeWidth={1.5} /></button>
        </div>
      </Section>

      <Section title={t('ap.notes')}><Field multiline value={artifact.notes} label={t('ap.notes')} byOther={byOther} onCommit={v => patch({ notes: v })} placeholder={t('ap.notesPh')} /></Section>
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
