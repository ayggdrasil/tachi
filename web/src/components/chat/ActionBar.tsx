import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { CardAction, Message } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';

type Phase = 'pending' | 'sent' | 'failed' | 'refused';

/** One clear result line once a mutually exclusive choice has been made. */
const RESULT: Record<string, string> = {
  share_memory: '가족에게 공유했어요', skip_share: '나만 간직해요',
  accept_trip: '좋아요, 가보기로 했어요', decline_trip: '다음에 하기로 했어요',
  share_trip: '가족에게 보냈어요', make_gathering: '가족과 함께 가기로 했어요',
};

/** Card actions: idle → pending (spinner) → sent (stays disabled until the server marks it done) → or failed (retry). */
export function ActionBar({ message, onOpenArtifact, inline }: {
  message: Message; onOpenArtifact?: (id: string) => void; inline?: boolean;
}) {
  const [phase, setPhase] = useState<Record<string, Phase>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const memVis = useTachi(s => (message.payload?.type === 'memory_card' ? s.memories.find(m => m.id === (message.payload as { memoryId: string }).memoryId)?.visibility : undefined));
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const art = useTachi(s => (message.payload?.type === 'artifact' ? s.artifacts[message.payload.artifactId] : undefined));
  // Once the date is decided, "일정 조율 시작" is stale and could start a duplicate poll.
  const actions = (message.actions ?? []).filter(a => !(a.id === 'start_scheduling' && art && art.dateStatus !== 'undecided'));
  if (actions.length === 0) return null;
  // Decided pair: the server marks every action done, so show only the outcome (no checkmark on the unchosen alternative).
  if (actions.length > 1 && actions.every(x => x.done)) {
    const id = actions.find(x => x.chosen)?.id   // server-recorded choice (survives reloads)
      ?? (chosen && actions.some(x => x.id === chosen) ? chosen : null)
      ?? (message.payload?.type === 'memory_card' && memVis ? (memVis === 'family' ? 'share_memory' : 'skip_share') : null);
    return (
      <div className={`ml-actions-wrap ${inline ? 'ml-actions-inline' : ''}`}>
        <p className="ml-result" role="status"><Check size={16} aria-hidden />{id && RESULT[id] ? RESULT[id] : '선택을 마쳤어요'}</p>
      </div>
    );
  }
  const doneActs = actions.filter(a => a.done);
  const pending = actions.filter(a => !a.done);
  const failedAct = actions.find(a => !a.done && phase[a.id] === 'failed');
  const run = (a: CardAction) => {
    if (a.id === 'open_artifact') {
      const id = (a.data?.artifactId as string | undefined) ?? (message.payload?.type === 'artifact' ? message.payload.artifactId : undefined);
      if (id) onOpenArtifact?.(id);
      return;
    }
    setChosen(a.id);
    setPhase(s => ({ ...s, [a.id]: 'pending' }));
    tachi.action(message.roomId, message.id, a.id, a.data).then(
      r => {
        if (!alive.current) return;
        // A refusal is a deliberate "not yet": the decision stays pending, so the button is usable again and never 'sent'.
        const next: Phase = r.ok ? 'sent' : r.error === 'refused' ? 'refused' : 'failed';
        setPhase(s => ({ ...s, [a.id]: next }));
      },
      () => { if (alive.current) setPhase(s => ({ ...s, [a.id]: 'failed' })); },
    );
  };
  return (
    <div className={`ml-actions-wrap ${inline ? 'ml-actions-inline' : ''}`}>
      {doneActs.map(a => <p key={a.id} className="ml-result" role="status"><Check size={16} aria-hidden />{RESULT[a.id] ?? `${a.label} 완료`}</p>)}
      {pending.length > 0 && <div className={`ml-actions ${inline ? 'ml-actions-row' : ''}`}>
        {pending.map(a => {
          const ph = phase[a.id];
          const busy = ph === 'pending';
          const disabled = busy || ph === 'sent';
          return (
            <button key={a.id} type="button" className={`btn ${a.style === 'primary' ? 'btn-primary' : ''}`} disabled={disabled}
              data-primary-action={a.style === 'primary' ? a.id : undefined} aria-busy={busy || undefined} onClick={() => run(a)}>
              {busy && <Loader2 size={16} className="ml-spin" aria-hidden />}{a.label}
            </button>
          );
        })}
      </div>}
      {failedAct && <p className="ml-retry" role="alert">‘{failedAct.label}’을 보내지 못했어요. 다시 눌러 주세요.</p>}
    </div>
  );
}
