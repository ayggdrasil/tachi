// Bring-your-own LLM key: one path for the Director socket and the local setup card on the landing page.
// A key is tried against the provider before it is kept; a rejected key never replaces a working one.
// "remember" writes it to the local .env (gitignored, owner-only), so a judge's machine keeps it across restarts.
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import type { ApiKeyResult, KeyErrorCode, ModelKey } from '../../shared/types';
import { resetCircuit } from '../brain/llm';
import { warn } from '../util/misc';
import { ctx } from './ctx';

export type KeyProvider = 'anthropic' | 'openai';
export const ENV_NAME: Record<KeyProvider, string> = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY' };
const PREFER: Record<KeyProvider, ModelKey[]> = { anthropic: ['claude-sonnet', 'claude-haiku'], openai: ['gpt-terra', 'gpt-luna'] };

export const envFilePath = (): string => path.resolve(process.env.TACHI_ENV_FILE || '.env');

const lineRe = (name: string) => new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);

/** Set, replace or remove one NAME=value line in the local .env; the file is created owner-only (0600). */
export function writeEnvVar(name: string, value: string | undefined, file = envFilePath()): void {
  let lines: string[] = [];
  try { lines = fs.readFileSync(file, 'utf8').split(/\r?\n/); } catch { /* no file yet */ }
  const re = lineRe(name);
  if (value === undefined && !lines.some(l => re.test(l))) return;
  const kept = lines.filter(l => !re.test(l));
  while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
  if (value !== undefined) kept.push(`${name}=${value}`);
  fs.writeFileSync(file, kept.length ? `${kept.join('\n')}\n` : '', { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* not supported (Windows) */ }
}

export function envFileHas(name: string, file = envFilePath()): boolean {
  try { return fs.readFileSync(file, 'utf8').split(/\r?\n/).some(l => lineRe(name).test(l)); } catch { return false; }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const isLoopbackAddr = (a?: string) => !!a && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);

/**
 * True only for a browser on this machine talking to the server directly: loopback peer, no proxy/tunnel
 * forwarding headers (a tunnel connects from loopback too), a localhost Host (blocks DNS rebinding), and,
 * when the browser sends one, a same-host Origin (blocks cross-site form posts).
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  if (!isLoopbackAddr(req.socket.remoteAddress)) return false;
  const h = req.headers;
  if (h['x-forwarded-for'] || h.forwarded || h['x-real-ip'] || h['cf-connecting-ip']) return false;
  const host = String(h.host ?? '').replace(/:\d+$/, '').toLowerCase();
  if (!LOCAL_HOSTS.has(host)) return false;
  if (h.origin) {
    try { if (!LOCAL_HOSTS.has(new URL(String(h.origin)).hostname.toLowerCase())) return false; } catch { return false; }
  }
  return true;
}

function classify(raw: string): KeyErrorCode {
  if (/\b(401|403)\b|invalid.{0,20}(api.)?key|authentication|permission/i.test(raw)) return 'rejected';
  if (/credit balance|insufficient_quota|quota|billing|\b429\b/i.test(raw)) return 'quota';
  if (/\b404\b|model.{0,20}(not.found|does not exist)|model_not_found/i.test(raw)) return 'model';
  if (/abort|timeout|timed out/i.test(raw)) return 'timeout';
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i.test(raw)) return 'unreachable';
  return 'other';
}

/** Short provider error for the UI, with any echo of the key masked. */
const detailOf = (raw: string, key: string) => raw.split(key).join('***').replace(/\s+/g, ' ').slice(0, 160);

let queue: Promise<unknown> = Promise.resolve();
/** Serialised: keys swap process.env, so two connects must never interleave. */
export function connectApiKey(provider: unknown, rawKey: unknown, opts: { remember?: boolean } = {}): Promise<ApiKeyResult> {
  const run = queue.then(() => connect(provider, rawKey, !!opts.remember));
  queue = run.catch(() => undefined);
  return run;
}

function publish(): void {
  const s = ctx.brain.getModelState();
  ctx.db.kv.set('model', s.active);
  ctx.io.emit('model:update', s);
}

async function connect(provider: unknown, rawKey: unknown, remember: boolean): Promise<ApiKeyResult> {
  if (provider !== 'anthropic' && provider !== 'openai') return { ok: false, error: 'provider' };
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (key && (key.length < 20 || key.length > 400 || /\s/.test(key))) return { ok: false, error: 'format' };
  const envName = ENV_NAME[provider];
  const prevKey = process.env[envName];
  const prevActive = ctx.brain.getModelState().active;

  if (!key) { // remove: forget it in memory and in the local .env
    delete process.env[envName];
    try { writeEnvVar(envName, undefined); } catch (e) { warn('could not update .env:', e instanceof Error ? e.message : e); }
    const s = ctx.brain.getModelState();
    if (!s.options.find(o => o.key === s.active)?.available) {
      const other = (['claude-sonnet', 'gpt-terra', 'claude-haiku', 'gpt-luna'] as ModelKey[]).find(k => s.options.some(o => o.key === k && o.available));
      ctx.brain.setActiveModel(other ?? 'demo');
    }
    publish();
    return { ok: true, saved: false };
  }

  process.env[envName] = key;
  resetCircuit(provider);
  let error: KeyErrorCode = 'other';
  let detail = '';
  for (const k of PREFER[provider]) { // the account may not have the first model; try the next one before giving up
    const r = await ctx.brain.preflight(k);
    if (r.ok) {
      ctx.brain.setActiveModel(k);
      publish();
      let saved = false;
      if (remember) {
        try { writeEnvVar(envName, key); saved = true; } catch (e) { warn('could not write .env:', e instanceof Error ? e.message : e); }
      }
      const label = ctx.brain.getModelState().options.find(o => o.key === k)?.label ?? k;
      return { ok: true, model: label, latencyMs: r.latencyMs, saved };
    }
    error = classify(r.error ?? '');
    detail = detailOf(r.error ?? '', key);
    if (error !== 'model') break;
  }

  // rejected: put the previous key and model back, and do not leave the provider's breaker open for it
  if (prevKey === undefined) delete process.env[envName]; else process.env[envName] = prevKey;
  resetCircuit(provider);
  if (ctx.brain.getModelState().options.some(o => o.key === prevActive && o.available)) ctx.brain.setActiveModel(prevActive);
  else ctx.brain.setActiveModel('demo');
  publish();
  if (prevKey !== undefined) void ctx.brain.preflight(prevActive).then(publish).catch(() => undefined); // refresh the ✓ the failed try overwrote
  return { ok: false, error, detail };
}

/** What the landing card needs: the active model and, for a local browser, whether keys are set / saved. */
export function llmStatus(local: boolean) {
  const s = ctx.brain.getModelState();
  const a = s.options.find(o => o.key === s.active);
  return {
    active: s.active, label: a?.label ?? s.active, live: !!a && a.provider !== 'mock',
    healthy: a?.healthy, latencyMs: a?.latencyMs,
    canConfigure: local,
    ...(local ? {
      providers: { anthropic: !!process.env.ANTHROPIC_API_KEY, openai: !!process.env.OPENAI_API_KEY },
      saved: { anthropic: envFileHas(ENV_NAME.anthropic), openai: envFileHas(ENV_NAME.openai) },
    } : {}),
  };
}
