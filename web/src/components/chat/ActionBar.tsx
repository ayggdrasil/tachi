import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { CardAction, Message } from '../../../../shared/types';
import { tachi } from '../../lib/store';

type Phase = 'pending' | 'sent' | 'failed' | 'refused';

/** Card actions: idle → pending (spinner) → sent (stays disabled until the server marks it done) → or failed (retry). */
export function ActionBar({ message, onOpenArtifact, inline, senior }: {
  message: Message; onOpenArtifact?: (id: string) => void; inline?: boolean; senior?: boolean;
}) {
  const [phase, setPhase] = useState<Record<string, Phase>>({});
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const actions = message.actions ?? [];
  if (actions.length === 0) return null;
  const failed = actions.some(a => !a.done && phase[a.id] === 'failed');
  const run = (a: CardAction) => {
    if (a.id === 'open_artifact') {
      const id = (a.data?.artifactId as string | undefined) ?? (message.payload?.type === 'artifact' ? message.payload.artifactId : undefined);
      if (id) onOpenArtifact?.(id);
      return;
    }
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
      <div className={`ml-actions ${inline ? 'ml-actions-row' : ''}`}>
        {actions.map(a => {
          const done = !!a.done;
          const ph = phase[a.id];
          const busy = ph === 'pending';
          const disabled = done || busy || ph === 'sent';
          return (
            <button key={a.id} type="button" className={`btn ${a.style === 'primary' && !done ? 'btn-primary' : ''}`} disabled={disabled}
              data-primary-action={a.style === 'primary' ? a.id : undefined} aria-busy={busy || undefined} onClick={() => run(a)}>
              {done && <Check size={16} />}{busy && <Loader2 size={16} className="ml-spin" aria-hidden />}{a.label}
            </button>
          );
        })}
      </div>
      {failed && <p className={`ml-retry ${senior ? 'ml-retry-s' : ''}`} role="alert">다시 시도해 주세요</p>}
    </div>
  );
}
