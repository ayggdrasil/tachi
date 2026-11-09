import { useState } from 'react';
import { Check, ChevronRight, Circle } from 'lucide-react';
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
  const [sent, setSent] = useState(false);
  const answered = !!p.answered || sent;
  const chosen = p.answered ? (p.selectedSlotIds ?? []) : sel;
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const submit = () => { setSent(true); tachi.action(message.roomId, message.id, 'pick_slots', { slotIds: sel }); };
  const none = () => { setSel([]); setSent(true); tachi.action(message.roomId, message.id, 'pick_slots', { slotIds: [] }); };
  return (
    <article className="cd" aria-label="가능한 시간 선택">
      <h3 className="cd-title">{p.artifactTitle} — 가능한 시간을 골라 주세요</h3>
      <div className={`cd-slots ${variant === 'senior' ? 'cd-slots-s' : ''}`}>
        {p.slots.map(s => (
          <button key={s.id} type="button" className="chip cd-slot" aria-pressed={chosen.includes(s.id)} disabled={answered}
            onClick={() => toggle(s.id)}>
            {chosen.includes(s.id) && <Check size={14} />}{s.label}
          </button>
        ))}
      </div>
      {answered ? (
        <p className="cd-cap"><Check size={13} /> {chosen.length === 0 ? '이번엔 모두 어려워요' : `보냈어요 · ${chosen.length}개 선택`}</p>
      ) : (
        <div className="cd-btns">
          <button type="button" className="btn btn-primary" disabled={sel.length === 0} onClick={submit}>보내기</button>
          <button type="button" className="btn" onClick={none}>모두 어려워요</button>
        </div>
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
  return (
    <article className="cd" aria-label="응답 현황">
      <div className="cd-row cd-between"><h3 className="cd-title">응답 {responded.length}/{all.length}</h3>
        {poll?.status === 'closed' && <span className="badge">마감</span>}</div>
      <div className="cd-avs">
        {responded.map(id => <Avatar key={id} user={users[id]} size={36} />)}
        {waiting.map(id => <Avatar key={id} user={users[id]} size={36} hollow />)}
      </div>
      {waiting.length > 0 && <p className="cd-cap">기다리는 중: {waiting.map(id => users[id]?.shortName ?? id).join(', ')}</p>}
      {variant !== 'senior' && onOpenRoom && meId && poll && poll.status !== 'closed' && waiting.includes(meId) && poll.sideRoomIds?.[meId] && (
        <button type="button" className="btn btn-primary" onClick={() => onOpenRoom(poll.sideRoomIds[meId])}>내 일정 답하기</button>
      )}
    </article>
  );
}

export function ScheduleResultCard({ message }: CardProps) {
  const p = message.payload as ScheduleResultPayload;
  const users = useTachi(s => s.users);
  const unanswered = p.unanswered ?? [];
  const unanimous = p.unanimous ?? (p.unavailable.length === 0 && unanswered.length === 0);
  const total = p.available.length + p.unavailable.length + unanswered.length;
  const confirmed = p.confirmed ?? unanimous;
  return (
    <article className="cd" aria-label="일정 결과">
      <p className="cd-cap cd-cap-top">{unanimous ? '모두 가능한 시간' : `가장 많이 가능한 후보 · ${p.available.length}/${total}명`}</p>
      <p className="cd-bigdate">{p.slot.label}</p>
      <div className="cd-row"><span className="cd-label">가능</span><span className="cd-avs">{p.available.map(id => <Avatar key={id} user={users[id]} size={30} />)}</span></div>
      {p.unavailable.length > 0 && (
        <div className="cd-row"><span className="cd-label">어려움</span><span className="cd-avs">{p.unavailable.map(id => <Avatar key={id} user={users[id]} size={30} hollow />)}</span></div>
      )}
      {unanswered.length > 0 && (
        <div className="cd-row"><span className="cd-label">미응답</span><span className="cd-avs">{unanswered.map(id => <Avatar key={id} user={users[id]} size={30} hollow />)}</span></div>
      )}
      {confirmed && <p className="cd-cap"><Check size={13} /> 기획서에 반영했어요</p>}
    </article>
  );
}
