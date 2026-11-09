import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Images, Mic, Send, Square } from 'lucide-react';
import { tachi } from '../../lib/store';
import { useLocale, useT } from '../../lib/i18n';
import './Composer.css';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

function normalizePhotos(json: unknown): string[] {
  const arr: unknown[] = Array.isArray(json) ? json : Array.isArray((json as { files?: unknown[] })?.files) ? (json as { files: unknown[] }).files
    : Array.isArray((json as { photos?: unknown[] })?.photos) ? (json as { photos: unknown[] }).photos : [];
  return arr.map(x => {
    const s = typeof x === 'string' ? x : ((x as { url?: string; path?: string; file?: string; name?: string })?.url ?? (x as { path?: string })?.path ?? (x as { file?: string })?.file ?? (x as { name?: string })?.name ?? '');
    if (!s) return '';
    return /^(https?:)?\//.test(s) ? s : `/demo-photos/${s}`;
  }).filter(Boolean);
}

/** Shrinks large phone photos before upload; falls back to the original on any failure. */
async function downscale(f: File): Promise<File> {
  try {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size <= 600 * 1024) return f;
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < f.size ? new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : f;
  } catch { return f; }
}

export function Composer({ roomId, variant, placeholder, allowPhoto = true, compact = false }: {
  roomId: string; variant: 'senior' | 'family'; placeholder?: string; allowPhoto?: boolean;
  /** Senior variant for person-to-person rooms: no big "show Tachi a photo" row, just a camera button next to the input. */
  compact?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const senior = variant === 'senior';
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errTimer = useRef<number | undefined>(undefined);
  const showErr = (m: string) => { setErr(m); window.clearTimeout(errTimer.current); errTimer.current = window.setTimeout(() => setErr(null), 6000); };
  const [samples, setSamples] = useState<string[]>([]);
  const [showSamples, setShowSamples] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastTyping = useRef(0);
  const recRef = useRef<SR>(null);
  const baseText = useRef('');
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sampleRef = useRef<HTMLDivElement>(null);

  const SRctor: SR = typeof window !== 'undefined' ? ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) : null;

  useEffect(() => {
    let alive = true;
    fetch('/api/demo-photos').then(r => (r.ok ? r.json() : [])).then(j => { if (alive) setSamples(normalizePhotos(j)); }).catch(() => { /* optional */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!showSamples) return;
    const onDown = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node)) setShowSamples(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [showSamples]);

  // Opening the popover moves focus to the first thumbnail.
  const popOpen = showSamples && samples.length > 0;
  useEffect(() => { if (popOpen) sampleRef.current?.querySelector<HTMLElement>('.cp-thumb')?.focus(); }, [popOpen]);
  const [popStyle, setPopStyle] = useState<React.CSSProperties | undefined>();
  useLayoutEffect(() => {
    if (!popOpen) return;
    const place = () => { const r = popRef.current?.getBoundingClientRect(); if (r) setPopStyle({ left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.top + 8 }); };
    place(); window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [popOpen]);
  const closeSamples = () => { setShowSamples(false); triggerRef.current?.focus(); };

  useEffect(() => () => { window.clearTimeout(errTimer.current); try { recRef.current?.abort?.(); } catch { /* noop */ } }, []);

  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(140, ta.scrollHeight)}px`;
  }, [text]);

  const submit = useCallback(() => {
    const t = text.trim(); if (!t) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } }
    tachi.send(roomId, t);
    setText('');
  }, [text, roomId, listening]);

  const onChange = (v: string) => {
    setText(v);
    const now = Date.now();
    if (v && now - lastTyping.current > 2500) { lastTyping.current = now; tachi.typing(roomId); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); submit(); }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { showErr(t('composer.photoTooBig')); return; }
    setErr(null); setUploading(true);
    try { await tachi.sendPhoto(roomId, await downscale(f)); } catch { showErr(t('composer.photoFailed')); } finally { setUploading(false); }
  };

  const toggleMic = () => {
    if (!SRctor) return;
    if (listening) { try { recRef.current?.stop(); } catch { /* noop */ } return; }
    const rec = new SRctor();
    rec.lang = locale === 'ko' ? 'ko-KR' : 'en-US'; rec.interimResults = true; rec.continuous = false;
    baseText.current = text ? text.trimEnd() + ' ' : '';
    rec.onresult = (ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => {
      let s = '';
      for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript;
      setText(baseText.current + s);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (ev: { error?: string }) => {
      setListening(false);
      if (ev?.error === 'aborted' || ev?.error === 'no-speech') { if (ev.error === 'no-speech') showErr(t('composer.didntHear')); return; }
      showErr(ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed'
        ? t('composer.micDenied') : t('composer.didntHear'));
    };
    recRef.current = rec;
    try { setErr(null); rec.start(); setListening(true); } catch { setListening(false); showErr(t('composer.didntHear')); }
  };

  const pickSample = (url: string) => { setShowSamples(false); tachi.sendPhotoUrl(roomId, url); };

  const samplePop = showSamples && samples.length > 0 && (
    <div className="cp-pop" id="cp-samples" role="group" aria-label={t('composer.samples')} ref={sampleRef} style={popStyle}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeSamples(); } }}>
      <p className="cp-pop-t">{t('composer.samples')}</p>
      <div className="cp-thumbs">
        {samples.map(u => (
          <button key={u} type="button" className="cp-thumb" onClick={() => pickSample(u)} aria-label={t('composer.sendThis')}><img src={u} alt="" loading="lazy" /></button>
        ))}
      </div>
    </div>
  );

  const errEl = err && <p className={`cp-err ${senior ? 'cp-err-s' : ''}`} role="alert">{err}</p>;
  const fileInput = <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />;

  if (senior) {
    return (
      <div className="cp cp-senior">
        {fileInput}
        {allowPhoto && !compact && (
          <div className="cp-photo-row" ref={popRef}>
            <button type="button" className="btn cp-photo-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera size={24} />{uploading ? t('composer.uploading') : t('composer.showPhoto')}
            </button>
            {samples.length > 0 && (
              <button ref={triggerRef} type="button" className="btn cp-sample-btn" aria-label={t('composer.viewSamples')} aria-expanded={showSamples} aria-controls="cp-samples" onClick={() => setShowSamples(v => !v)}><Images size={20} aria-hidden /><span className="cp-sample-l">{t('composer.samplesShort')}</span></button>
            )}
            {samplePop}
          </div>
        )}
        {errEl}
        <div className="cp-row">
          {allowPhoto && (
            <button type="button" className={`cp-round cp-cam-compact ${compact ? 'cp-cam-show' : ''}`} aria-label={compact ? t('composer.sendPhoto') : t('composer.showPhoto')} disabled={uploading} onClick={() => fileRef.current?.click()}><Camera size={24} aria-hidden /></button>
          )}
          {SRctor && (
            <button type="button" className={`cp-round ${listening ? 'cp-on' : ''}`} aria-pressed={listening} aria-label={t('composer.speak')} onClick={toggleMic}>
              {listening ? <Square size={22} /> : <Mic size={26} />}
            </button>
          )}
          <input className="input cp-input" value={text} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
            placeholder={listening ? t('composer.listening') : (placeholder ?? t('composer.placeholderSenior'))} aria-label={t('composer.input')} enterKeyHint="send" />
          <button type="button" className="cp-round cp-send" disabled={!text.trim()} aria-label={t('composer.send')} onClick={submit}><Send size={24} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="cp cp-family">
      {fileInput}
      {uploading && <p className="cp-up">{t('composer.uploading')}</p>}
      {errEl}
      <div className="cp-row" ref={popRef}>
        {allowPhoto && (
          <button type="button" className="btn btn-icon" aria-label={t('composer.sendPhoto')} disabled={uploading} onClick={() => fileRef.current?.click()}><ImageIcon size={20} /></button>
        )}
        {allowPhoto && samples.length > 0 && (
          <button ref={triggerRef} type="button" className="btn btn-icon" aria-label={t('composer.samples')} aria-expanded={showSamples} aria-controls="cp-samples" onClick={() => setShowSamples(v => !v)}><Images size={20} /></button>
        )}
        {samplePop}
        <textarea ref={taRef} className="cp-ta" rows={1} value={text} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown}
          placeholder={placeholder ?? t('composer.placeholderFamily')} aria-label={t('composer.input')} />
        <button type="button" className="cp-send-sm" disabled={!text.trim()} aria-label={t('composer.send')} onClick={submit}><Send size={18} /></button>
      </div>
    </div>
  );
}
