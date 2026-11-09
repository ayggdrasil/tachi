import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { CardAction, Message } from '../../../../shared/types';
import { tachi, useTachi } from '../../lib/store';
import { useT } from '../../lib/i18n';

type Phase = 'pending' | 'sent' | 'failed' | 'refused';

/** One clear result line once a mutually exclusive choice has been made. */
const RESULT_IDS = new Set(['share_memory', 'skip_share', 'accept_trip', 'decline_trip', 'share_trip', 'make_gathering']);

/** Card actions: idle → pending (spinner) → sent (stays disabled until the server marks it done) → or failed (retry). */
export function ActionBar({ message, onOpenArtifact, inline }: {
  message: Message; onOpenArtifact?: (id: string) => void; inline?: boolean;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Record<string, Phase>>({});
  const [chosen, setChosen] = useState<string | null>(null);
  const memVis = useTachi(s => (message.payload?.type === 'memory_card' ? s.memories.find(m => m.id === (message.payload as { memoryId: string }).memoryId)?.visibility : undefined));
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const art = useTachi(s => (message.payload?.type === 'artifact' ? s.artifacts[message.payload.artifactId] : undefined));
  // Once the date is decided, "start scheduling" is stale and could start a duplicate poll.
  const actions = (message.actions ?? []).filter(a => !(a.id === 'start_scheduling' && art && art.dateStatus !== 'undecided'));
  if (actions.length === 0) return null;
  // Decided pair: the server marks every action done, so show only the outcome (no checkmark on the unchosen alternative).
  if (actions.length > 1 && actions.every(x => x.done)) {
    const id = actions.find(x => x.chosen)?.id   // server-recorded choice (survives reloads)
      ?? (chosen && actions.some(x => x.id === chosen) ? chosen : null)
      ?? (message.payload?.type === 'memory_card' && memVis ? (memVis === 'family' ? 'share_memory' : 'skip_share') : null);
    return (
      <div className={`ml-actions-wrap ${inline ? 'ml-actions-inline' : ''}`}>
        <p className="ml-result" role="status"><Check size={16} aria-hidden />{id && RESULT_IDS.has(id) ? t(`action.result.${id}`) : t('action.decided')}</p>
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
      {doneActs.map(a => <p key={a.id} className="ml-result" role="status"><Check size={16} aria-hidden />{RESULT_IDS.has(a.id) ? t(`action.result.${a.id}`) : t('action.doneLabel', { label: a.label })}</p>)}
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
      {failedAct && <p className="ml-retry" role="alert">{t('action.failed', { label: failedAct.label })}</p>}
    </div>
  );
}
