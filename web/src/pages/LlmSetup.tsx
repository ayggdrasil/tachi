import { useEffect, useState } from 'react';
import { Check, ExternalLink, KeyRound } from 'lucide-react';
import type { ApiKeyResult, LlmStatus } from '../../../shared/types';
import { useT } from '../lib/i18n';

type Provider = 'anthropic' | 'openai';
type T = ReturnType<typeof useT>;

const PROVIDER_NAME: Record<Provider, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };
const KEY_URL: Record<Provider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

/** Localised reason a key was not accepted (shared with the Director console). */
export function keyErrorText(t: T, r: ApiKeyResult, provider: Provider): string {
  const code = r.error ?? 'other';
  return t(`key.err.${code}`, { provider: PROVIDER_NAME[provider], detail: r.detail || code });
}

/** Guess the provider from a pasted key (Anthropic keys start with sk-ant-). */
export const guessProvider = (key: string): Provider | undefined =>
  /^sk-ant-/.test(key) ? 'anthropic' : /^sk-/.test(key) ? 'openai' : undefined;

/**
 * Landing-page card: someone who cloned the repo pastes their own Anthropic or OpenAI key, the server tests it
 * and (by default) saves it to the local .env. Only rendered for a browser on the server's own machine.
 */
export function LlmSetup() {
  const t = useT();
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  const load = () => fetch('/api/llm').then(r => (r.ok ? r.json() : null)).then((s: LlmStatus | null) => setStatus(s)).catch(() => setStatus(null));
  useEffect(() => { void load(); }, []);
  useEffect(() => { // start on the provider whose key is already set, if any
    if (status?.providers?.openai && !status.providers.anthropic) setProvider('openai');
  }, [status?.providers?.openai, status?.providers?.anthropic]);

  if (!status?.canConfigure) return null;

  const send = async (value: string, prov: Provider) => {
    setPending(true);
    setNote(value ? { text: t('key.checking', { provider: PROVIDER_NAME[prov] }) } : null);
    let r: ApiKeyResult;
    try {
      const res = await fetch('/api/llm/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: prov, key: value, remember }) });
      r = await res.json() as ApiKeyResult;
    } catch { r = { ok: false, error: 'unreachable' }; }
    setPending(false);
    if (!r.ok) { setNote({ text: keyErrorText(t, r, prov), bad: true }); return; }
    setKey('');
    setEditing(false);
    setNote({ text: !value ? t('key.disconnected') : t(r.saved ? 'key.okSaved' : 'key.ok', { model: r.model ?? '', ms: r.latencyMs ?? 0 }) });
    void load();
  };

  const liveProvider: Provider | undefined = status.live ? (status.active.startsWith('claude') ? 'anthropic' : 'openai') : undefined;
  const showForm = !status.live || editing;

  return (
    <section className="card ld-llm" aria-labelledby="ld-llm-h">
      <div className="ld-llm-head">
        <h2 id="ld-llm-h" className="ld-llm-title"><KeyRound size={16} strokeWidth={1.5} aria-hidden /> {t('key.title')}</h2>
        {status.live && <span className="ld-llm-live caption"><Check size={13} strokeWidth={2} aria-hidden /> {status.label}</span>}
      </div>

      {status.live && liveProvider ? (
        <p className="caption muted">
          {status.latencyMs != null && status.healthy ? t('key.liveMs', { model: status.label, ms: status.latencyMs }) : t('key.live', { model: status.label })}
          {' · '}{status.saved?.[liveProvider] ? t('key.savedHere') : t('key.memoryOnly')}
        </p>
      ) : (
        <p className="caption muted">{t('key.offline')}</p>
      )}

      {showForm ? (
        <form className="ld-llm-form" onSubmit={e => { e.preventDefault(); if (key.trim() && !pending) void send(key.trim(), provider); }}>
          <div className="ld-llm-prov" role="group" aria-label={t('key.provider')}>
            {(['anthropic', 'openai'] as const).map(p => (
              <button key={p} type="button" className="chip" aria-pressed={provider === p} onClick={() => setProvider(p)}>{t(`key.${p}`)}</button>
            ))}
          </div>
          <label className="ld-llm-field">
            <span className="caption">{t('key.input')}</span>
            <input className="input" type="password" autoComplete="off" spellCheck={false} value={key} placeholder={t(`key.ph.${provider}`)}
              onChange={e => { const v = e.target.value; setKey(v); const g = guessProvider(v.trim()); if (g) setProvider(g); }} />
          </label>
          <a className="caption ld-llm-get" href={KEY_URL[provider]} target="_blank" rel="noreferrer">
            {t('key.get')} ({PROVIDER_NAME[provider]}) <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
          </a>
          <label className="ld-llm-remember">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>
              <span className="caption">{t('key.remember')}</span>
              <span className="caption faint ld-llm-sub">{t('key.rememberHint', { provider: PROVIDER_NAME[provider] })}</span>
            </span>
          </label>
          <div className="ld-llm-actions">
            <button className="btn btn-primary" type="submit" disabled={pending || !key.trim()}>{t('key.connect')}</button>
            {editing && <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => { setEditing(false); setNote(null); setKey(''); }}>{t('key.cancel')}</button>}
          </div>
        </form>
      ) : (
        <div className="ld-llm-actions">
          <button className="btn" type="button" onClick={() => { setEditing(true); setNote(null); if (liveProvider) setProvider(liveProvider); }}>{t('key.change')}</button>
          {liveProvider && <button className="btn btn-ghost" type="button" disabled={pending} onClick={() => void send('', liveProvider)}>{t('key.disconnect')}</button>}
        </div>
      )}

      {note && <p className={`caption ld-llm-note ${note.bad ? 'is-bad' : ''}`} role="status">{note.text}</p>}
    </section>
  );
}
