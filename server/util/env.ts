// Side-effect module: load .env before anything else reads process.env. Import FIRST.
import fs from 'node:fs';

function fallbackLoad(file: string): void {
  console.warn('[tachi:warn] process.loadEnvFile unavailable (Node < 20.12) — using the built-in .env parser');
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) v = v.slice(1, v.lastIndexOf(q));
    else v = v.replace(/\s+#.*$/, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

try {
  const load = (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile;
  if (load) load.call(process);
  else if (fs.existsSync('.env')) fallbackLoad('.env');
} catch { /* no .env — fine */ }
export {};
