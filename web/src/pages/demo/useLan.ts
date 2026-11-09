import { useEffect, useState } from 'react';

export interface LanInfo { urls: string[]; qr?: string; directorUrl?: string }

/** Fetches /api/lan once (LAN URLs + QR data URL). Tolerant to small shape differences. */
export function useLan(): LanInfo | null {
  const [info, setInfo] = useState<LanInfo | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/lan')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Record<string, unknown>) => {
        if (!alive) return;
        const raw = (j.urls ?? j.lanUrls ?? (j.url ? [j.url] : [])) as unknown;
        const urls = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
        const qr = typeof j.qr === 'string' ? j.qr : typeof j.qrDataUrl === 'string' ? j.qrDataUrl : undefined;
        const directorUrl = typeof j.directorUrl === 'string' ? j.directorUrl : undefined;
        setInfo({ urls, qr, directorUrl });
      })
      .catch(() => { if (alive) setInfo({ urls: [] }); });
    return () => { alive = false; };
  }, []);
  return info;
}
