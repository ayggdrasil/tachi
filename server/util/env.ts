// Side-effect module: load .env before anything else reads process.env. Import FIRST.
try { (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(); } catch { /* no .env — fine */ }
export {};
