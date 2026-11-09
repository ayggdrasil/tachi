import { useState } from 'react';
import { Check, ChevronRight, Circle, Loader2 } from 'lucide-react';
import type { ArtifactRefPayload, ScheduleProgressPayload, ScheduleRequestPayload, ScheduleResultPayload } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { Avatar } from '../common/Avatar';
import type { CardProps } from './types';
import './cards.css';

export function ArtifactCard({ message, onOpenArtifact }: CardProps) {
  const p = message.payload as ArtifactRefPayload;
  const a = useTachi(s => s.artifacts[p.artifactId]);
  if (!a) return <article className="cd"><p className="faint">{message.text || '기획서를 불러오는 중…'}</p></article>;
  const done = a.tasks.filter(t => t.done).length;
  const status = a.dateStatus === 'confirmed' ? `확정 ${a.dateLabel ?? ''}` : a.dateStatus === 'polling' ? '조율 중' : '미정';
  const Head = onOpenArtifact ? 'button' : 'div';
  return (
    <article className="cd cd-artifact" aria-label={a.title}>
      <Head className="cd-art-head" type={onOpenArtifact ? 'button' : undefined} onClick={onOpenArtifact ? () => onOpenArtifact(a.id) : undefined}>
        <span className="cd-title">{a.title}</span>
        {onOpenArtifact && <ChevronRight size={18} />}
      </Head>
      <div className="cd-row">
        <span className={`badge ${a.dateStatus === 'confirmed' ? 'cd-badge-ink' : ''}`}>날짜 {status}</span>
        <span className="badge">할 일 {done}/{a.tasks.length}</span>
        {a.place && <span className="badge">{a.place}</span>}
      </div>
      <ul className="cd-tasks">
        {a.tasks.slice(0, 3).map(t => (
          <li key={t.id} className={t.done ? 'is-done' : ''}>{t.done ? <Check size={14} /> : <Circle size={14} />}{t.text}</li>
        ))}
        {a.tasks.length > 3 && <li className="faint">외 {a.tasks.length - 3}개</li>}
      </ul>
    </article>
  );
}

export function ScheduleRequestCard({ message, variant }: CardProps) {
  const p = message.payload as ScheduleRequestPayload;
  const [sel, setSel] = useState<string[]>(p.selectedSlotIds ?? []);
  // idle → pending (spinner) → sent (disabled until the server marks it answered) | failed (retry allowed)
  const [phase, setPhase] = useState<'idle' | 'pending' | 'sent' | 'failed'>('idle');
  const [more, setMore] = useState(false);
  const senior = variant === 'senior';
  const answered = !!p.answered || phase === 'sent';
  const busy = phase === 'pending';
  const chosen = p.answered ? (p.selectedSlotIds ?? []) : sel;
  // Seniors see at most 4 choices at first; the rest sit behind one link (selected ones always stay visible).
  const limited = senior && !answered && !more && p.slots.length > 4;
  const shown = limited ? p.slots.filter((s, i) => i < 4 || chosen.includes(s.id)) : p.slots;
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const send = (slotIds: string[]) => {
    setPhase('pending');
    tachi.action(message.roomId, message.id, 'pick_slots', { slotIds }).then(
      r => setPhase(r.ok ? 'sent' : 'failed'), () => setPhase('failed'));
  };
  const submit = () => send(sel);
  const none = () => { setSel([]); send([]); };
  return (
    <article className="cd" aria-label="가능한 시간 선택">
      <h3 className="cd-title">{p.artifactTitle}</h3>
      <p className="cd-meta">가능한 시간을 모두 골라 주세요</p>
      <div className={`cd-slots ${senior ? 'cd-slots-s' : ''}`}>
        {shown.map(s => (
          <button key={s.id} type="button" className="chip cd-slot" aria-pressed={chosen.includes(s.id)} disabled={answered || busy}
            onClick={() => toggle(s.id)}>
            {chosen.includes(s.id) && <Check size={14} />}{s.label}
          </button>
        ))}
      </div>
      {limited && <button type="button" className="cd-link cd-more" aria-expanded={more} onClick={() => setMore(true)}>다른 시간 더 보기 (+{p.slots.length - shown.length})</button>}
      {answered ? (
        <p className="cd-cap"><Check size={13} /> {chosen.length === 0 ? '이번엔 모두 어려워요' : `보냈어요 · ${chosen.length}개 선택`}</p>
      ) : (
        <>
          <div className="cd-btns">
            <button type="button" className="btn btn-primary" data-primary-action="pick_slots" disabled={sel.length === 0 || busy} aria-busy={busy || undefined} onClick={submit}>
              {busy && <Loader2 size={16} className="cd-spin" aria-hidden />}보내기</button>
            <button type="button" className="btn" disabled={busy} onClick={none}>모두 어려워요</button>
          </div>
          {phase === 'failed' && <p className="cd-err" role="alert">다시 시도해 주세요</p>}
        </>
      )}
    </article>
  );
}

export function ScheduleProgressCard({ message, variant, onOpenRoom }: CardProps) {
  const p = message.payload as ScheduleProgressPayload;
  const poll = useTachi(s => s.polls[p.pollId]);
  const users = useTachi(s => s.users);
  const meId = useTachi(s => s.meId);
  const responded = poll ? poll.participantIds.filter(id => (poll.responses[id] ?? []).length > 0 || p.responded.includes(id)) : p.responded;
  const all = poll ? poll.participantIds : [...p.responded, ...p.waiting];
  const waiting = all.filter(id => !responded.includes(id));
  const latestResult = useTachi(s => {
    const list = s.messages[message.roomId] ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i];
      if (x.kind === 'schedule_result' && x.payload?.type === 'schedule_result' && x.payload.pollId === p.pollId) return x.payload;
    }
    return undefined;
  });
  const closed = poll?.status === 'closed';
  const confirmed = !!latestResult?.confirmed;
  const heading = confirmed ? '확정' : closed ? '응답 마감' : `응답 ${responded.length}/${all.length}`;
  return (
    <article className="cd" aria-label="응답 현황">
      <div className="cd-row cd-between"><h3 className="cd-title">{heading}</h3>
        {closed && !confirmed && <span className="badge">응답 {responded.length}/{all.length}</span>}</div>
      <div className="cd-avs">
        {responded.map(id => <Avatar key={id} user={users[id]} size={36} />)}
        {waiting.map(id => <Avatar key={id} user={users[id]} size={36} hollow />)}
      </div>
      {waiting.length > 0 && !closed && <p className="cd-cap">기다리는 중: {waiting.map(id => users[id]?.shortName ?? id).join(', ')}</p>}
      {variant !== 'senior' && onOpenRoom && meId && poll && poll.status !== 'closed' && waiting.includes(meId) && poll.sideRoomIds?.[meId] && (
        <button type="button" className="btn btn-primary" onClick={() => onOpenRoom(poll.sideRoomIds[meId])}>내 일정 답하기</button>
      )}
    </article>
  );
}

export function ScheduleResultCard({ message }: CardProps) {
  const p = message.payload as ScheduleResultPayload;
  const users = useTachi(s => s.users);
  const poll = useTachi(s => s.polls[p.pollId]);
  // Disjoint groups: available wins over everything, then unanswered, then unavailable.
  const available = [...new Set(p.available)];
  const availSet = new Set(available);
  const unanswered = [...new Set(p.unanswered ?? [])].filter(id => !availSet.has(id));
  const unansSet = new Set(unanswered);
  const unavailable = [...new Set(p.unavailable)].filter(id => !availSet.has(id) && !unansSet.has(id));
  const total = poll?.participantIds.length || available.length + unavailable.length + unanswered.length;
  const unanimous = p.unanimous ?? (unavailable.length === 0 && unanswered.length === 0);
  const confirmed = p.confirmed ?? unanimous;
  const title = confirmed ? (unanimous ? '확정 · 모두 가능한 시간' : '확정된 시간')
    : unanimous ? '모두 가능한 시간' : `가장 많이 가능한 후보 · ${available.length}/${total}명`;
  return (
    <article className="cd" aria-label="일정 결과">
      <p className="cd-cap cd-cap-top">{title}</p>
      <p className="cd-bigdate">{p.slot.label}</p>
      <div className="cd-row"><span className="cd-label">가능</span><span className="cd-avs">{available.map(id => <Avatar key={id} user={users[id]} size={30} />)}</span></div>
      {unavailable.length > 0 && (
        <div className="cd-row"><span className="cd-label">어려움</span><span className="cd-avs">{unavailable.map(id => <Avatar key={id} user={users[id]} size={30} hollow />)}</span></div>
      )}
      {unanswered.length > 0 && (
        <div className="cd-row"><span className="cd-label">미응답</span><span className="cd-avs">{unanswered.map(id => <Avatar key={id} user={users[id]} size={30} hollow />)}</span></div>
      )}
      {confirmed && <p className="cd-cap"><Check size={13} /> 기획서에 반영했어요</p>}
    </article>
  );
}
