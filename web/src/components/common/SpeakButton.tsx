import { useEffect, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import './common.css';

export function SpeakButton({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => () => { if (supported && on) window.speechSynthesis.cancel(); }, [on, supported]);
  if (!supported) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (on) { synth.cancel(); setOn(false); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR'; u.rate = 0.9;
    u.onend = () => setOn(false); u.onerror = () => setOn(false);
    setOn(true);
    synth.speak(u);
  };
  return (
    <button type="button" className="speak-btn" aria-pressed={on} aria-label="소리내어 읽기" onClick={toggle}>
      {on ? <Square size={16} /> : <Volume2 size={18} />}
    </button>
  );
}
