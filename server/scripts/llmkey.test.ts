// Bring-your-own LLM key: landing REST + Director socket, tested against a fake OpenAI-compatible provider.
//   npx tsx server/scripts/llmkey.test.ts
import '../util/env';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import type { ApiKeyResult, Bootstrap, ClientToServerEvents, LlmStatus, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';

type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };

const GOOD = 'sk-good-0123456789abcdefghij';
const BAD = 'sk-bad-0123456789abcdefghijk';
const NO_TERRA = 'sk-noterra-0123456789abcdefg'; // this account only has the second model
const SECOND = 'sk-second-0123456789abcdefgh';

async function main() {
  // fake provider: /chat/completions answers by key and model
  const seen: string[] = [];
  const fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const auth = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      const model = (JSON.parse(body || '{}') as { model?: string }).model ?? '';
      seen.push(`${auth.slice(0, 10)}:${model}`);
      const send = (status: number, j: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (auth === BAD) return send(401, { error: { message: `Incorrect API key provided: ${auth}` } });
      if (auth === NO_TERRA && model === 'gpt-6.1-terra') return send(404, { error: { message: 'The model `gpt-6.1-terra` does not exist', code: 'model_not_found' } });
      if ([GOOD, NO_TERRA, SECOND].includes(auth)) return send(200, { choices: [{ message: { content: 'OK' } }] });
      return send(401, { error: { message: 'no key' } });
    });
  });
  await new Promise<void>(r => fake.listen(0, '127.0.0.1', () => r()));
  const fakePort = (fake.address() as { port: number }).port;

  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.TACHI_DEFAULT_MODEL;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${fakePort}/v1`;
  process.env.TACHI_DIRECTOR_KEY = 'k3y';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-llmkey-'));
  const envFile = path.join(tmp, '.env');
  process.env.TACHI_ENV_FILE = envFile;
  fs.writeFileSync(envFile, '# my settings\nTACHI_LLM_TIMEOUT_MS=5000\n');

  const { listen, close, ctx } = await createApp({ port: 0, dataDir: path.join(tmp, 'data'), paceMs: 10, quiet: true });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  const status = (headers: Record<string, string> = {}) => fetch(`${url}/api/llm`, { headers }).then(r => r.json() as Promise<LlmStatus>);
  const post = async (body: unknown, headers: Record<string, string> = {}) => {
    const r = await fetch(`${url}/api/llm/key`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, j: await r.json() as ApiKeyResult };
  };

  // starts offline; a local browser may configure
  const s0 = await status();
  check(s0.active === 'demo' && !s0.live && s0.canConfigure, 'starts on the demo brain; local browser can configure');
  check(!!s0.providers && !s0.providers.openai && !!s0.saved && !s0.saved.openai, 'local status shows no key set or saved');

  // anything that is not a direct local browser is refused
  const viaTunnel = await status({ 'x-forwarded-for': '203.0.113.9' });
  check(!viaTunnel.canConfigure && viaTunnel.providers === undefined, 'forwarded request (tunnel) cannot configure and sees no key details');
  check((await post({ provider: 'openai', key: GOOD }, { 'x-forwarded-for': '203.0.113.9' })).status === 403, 'POST through a tunnel → 403');
  // fetch() silently drops a custom Host header, so send this one with http.request
  const rebindStatus = await new Promise<number>((resolve, reject) => {
    const body = JSON.stringify({ provider: 'openai', key: GOOD });
    const rq = http.request({ host: '127.0.0.1', port, path: '/api/llm/key', method: 'POST', headers: { host: `evil.example:${port}`, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, rs => { rs.resume(); resolve(rs.statusCode ?? 0); });
    rq.on('error', reject); rq.end(body);
  });
  check(rebindStatus === 403, `POST with a foreign Host (DNS rebinding) → 403 (got ${rebindStatus})`);
  check((await post({ provider: 'openai', key: GOOD }, { origin: 'https://evil.example' })).status === 403, 'POST from a foreign Origin → 403');
  const lan = await fetch(`${url}/api/lan`, { headers: { 'x-forwarded-for': '203.0.113.9' } }).then(r => r.json()) as { directorUrl?: string };
  check(!lan.directorUrl, '/api/lan through a tunnel does not hand out the Director key');
  check(!process.env.OPENAI_API_KEY && ctx.brain.getModelState().active === 'demo', 'refused requests changed nothing');

  // input validation
  check((await post({ provider: 'gemini', key: GOOD })).j.error === 'provider', 'unknown provider → provider');
  check((await post({ provider: 'openai', key: 'sk-short' })).j.error === 'format', 'too-short key → format');

  // wrong key: rejected, nothing kept
  const bad = await post({ provider: 'openai', key: BAD, remember: true });
  check(!bad.j.ok && bad.j.error === 'rejected', `wrong key → rejected (got ${bad.j.error})`);
  check(!(bad.j.detail ?? '').includes(BAD), 'provider error detail never echoes the key');
  check(!process.env.OPENAI_API_KEY && ctx.brain.getModelState().active === 'demo', 'wrong key is not kept; still on demo');
  check(!fs.readFileSync(envFile, 'utf8').includes('OPENAI_API_KEY'), 'wrong key is not written to .env');

  // account without the first model: falls through to the second, memory only
  const nt = await post({ provider: 'openai', key: NO_TERRA, remember: false });
  check(nt.j.ok && nt.j.model === 'ChatGPT Luna' && nt.j.saved === false, `missing first model → falls back to Luna (got ${nt.j.model})`);
  check(ctx.brain.getModelState().active === 'gpt-luna' && !fs.readFileSync(envFile, 'utf8').includes('OPENAI_API_KEY'), 'Luna active; not saved without remember');

  // good key with remember: active, saved owner-only, other .env lines kept
  const good = await post({ provider: 'openai', key: GOOD, remember: true });
  check(good.j.ok && good.j.model === 'ChatGPT Terra' && good.j.saved === true && typeof good.j.latencyMs === 'number', 'good key → Terra, saved');
  const envText = fs.readFileSync(envFile, 'utf8');
  check(envText.includes(`OPENAI_API_KEY=${GOOD}`) && envText.includes('TACHI_LLM_TIMEOUT_MS=5000') && envText.includes('# my settings'), '.env has the key and keeps existing lines');
  if (process.platform !== 'win32') check((fs.statSync(envFile).mode & 0o077) === 0, '.env is owner-only (0600)');
  const s1 = await status();
  check(s1.live && s1.active === 'gpt-terra' && !!s1.saved?.openai && s1.healthy === true, 'status: live on Terra, healthy, saved');

  // replacing with a wrong key keeps the working one
  const bad2 = await post({ provider: 'openai', key: BAD, remember: true });
  check(!bad2.j.ok && process.env.OPENAI_API_KEY === GOOD && ctx.brain.getModelState().active === 'gpt-terra', 'wrong replacement key leaves the working key and model in place');
  check(fs.readFileSync(envFile, 'utf8').includes(`OPENAI_API_KEY=${GOOD}`), '.env still holds the working key');

  // a second good key replaces the saved line (no duplicates)
  await post({ provider: 'openai', key: SECOND, remember: true });
  const lines = fs.readFileSync(envFile, 'utf8').split('\n').filter(l => l.startsWith('OPENAI_API_KEY='));
  check(lines.length === 1 && lines[0] === `OPENAI_API_KEY=${SECOND}`, 'saving again replaces the line');

  // Director socket: anonymous refused; director removes the key (memory + .env)
  const open = async () => { const s = connect(url, { transports: ['websocket'], forceNew: true }) as Sock; await new Promise<void>(r => s.on('connect', () => r())); return s; };
  const anon = await open();
  const anonR = await new Promise<ApiKeyResult>(r => anon.emit('model:apikey', { provider: 'openai', key: '' }, r));
  check(!anonR.ok && anonR.error === 'forbidden' && process.env.OPENAI_API_KEY === SECOND, 'anonymous socket cannot touch the key');
  const dir = await open();
  const hb = await new Promise<Bootstrap | { error: string }>(r => dir.emit('hello', { userId: 'director', key: 'k3y' }, r));
  check(!('error' in hb), 'director hello');
  const clr = await new Promise<ApiKeyResult>(r => dir.emit('model:apikey', { provider: 'openai', key: '' }, r));
  check(clr.ok && !process.env.OPENAI_API_KEY && ctx.brain.getModelState().active === 'demo', 'director Remove → back on demo');
  check(!fs.readFileSync(envFile, 'utf8').includes('OPENAI_API_KEY') && fs.readFileSync(envFile, 'utf8').includes('TACHI_LLM_TIMEOUT_MS=5000'), 'Remove deletes only the key line from .env');
  const dk = await new Promise<ApiKeyResult>(r => dir.emit('model:apikey', { provider: 'openai', key: GOOD }, r));
  check(dk.ok && dk.saved === false && !fs.readFileSync(envFile, 'utf8').includes('OPENAI_API_KEY'), 'director connect without save stays in memory');
  anon.disconnect(); dir.disconnect();

  check(seen.length > 0 && seen.every(s => !s.startsWith('sk-good-01') || s.endsWith('gpt-6.1-terra') || s.endsWith('gpt-6-luna')), 'only Tachi model ids were sent to the provider');

  await close();
  fake.close();
  delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_BASE_URL; delete process.env.TACHI_ENV_FILE;
  console.log(failures ? `\n${failures} FAILED` : '\nall llm key checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
