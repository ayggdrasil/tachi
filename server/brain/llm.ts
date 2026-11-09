import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { ModelOption } from '../../shared/types';
import type { ChatTurn } from './contract';
import { LLMStopError, anthropicComplete } from './providers/anthropic';
import { openaiComplete } from './providers/openai';
import type { LLMImage, LLMRequest } from './providers/types';

export const llmTimeoutMs = (): number => {
  const n = Number(process.env.TACHI_LLM_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 7_000;
};
export const LLM_TIMEOUT_MS = 7_000;

// ── per-provider circuit breaker ───────────────────────────────────────────
const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 60_000;
const breakers = new Map<string, { failures: number; openUntil: number }>();
export function circuitOpen(provider: string): boolean {
  const b = breakers.get(provider);
  return !!b && b.openUntil > Date.now();
}
function recordFailure(provider: string, e: unknown): void {
  const b = breakers.get(provider) ?? { failures: 0, openUntil: 0 };
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD && b.openUntil <= Date.now()) {
    b.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    console.warn(`[brain] ${provider} failed ${b.failures}x in a row (${e instanceof Error ? e.message : String(e)}); using demo heuristic for ${BREAKER_COOLDOWN_MS / 1000}s`);
  }
  breakers.set(provider, b);
}
/** Open a provider's breaker immediately (failed preflight), so the first live step does not wait on a dead provider. */
export function openCircuit(provider: string, reason?: string): void {
  breakers.set(provider, { failures: BREAKER_THRESHOLD, openUntil: Date.now() + BREAKER_COOLDOWN_MS });
  console.warn(`[brain] ${provider} circuit opened${reason ? ` (${reason})` : ''}; using demo heuristic for ${BREAKER_COOLDOWN_MS / 1000}s`);
}
export const resetCircuit = (provider?: string): void => { if (provider) breakers.delete(provider); else breakers.clear(); };

const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

export interface CompleteInput { system: string; turns: ChatTurn[]; images?: LLMImage[]; json?: boolean; maxTokens: number; timeoutMs?: number }

export async function complete(option: ModelOption, input: CompleteInput): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), input.timeoutMs ?? llmTimeoutMs());
  try {
    const { timeoutMs: _t, ...req } = input as CompleteInput & LLMRequest;
    let out: string;
    if (option.provider === 'anthropic') out = await anthropicComplete(option.modelId, req, ctrl.signal);
    else if (option.provider === 'openai') out = await openaiComplete(option.modelId, req, ctrl.signal);
    else throw new Error('no provider');
    breakers.delete(option.provider);
    return out;
  } catch (e) {
    if (e instanceof LLMStopError) console.warn(`[brain] ${option.provider} ${e.reason}: ${e.message}`);
    recordFailure(option.provider, e);
    throw e;
  } finally { clearTimeout(timer); }
}

export function loadImage(path?: string): LLMImage | undefined {
  if (!path) return undefined;
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > MAX_IMAGE_BYTES || st.size === 0) return undefined;
    const ext = extname(path).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : undefined;
    if (!mime) return undefined;
    return { mime, base64: readFileSync(path).toString('base64') };
  } catch { return undefined; }
}

/** Strip code fences, find the first balanced {...} and parse it. */
export function extractJson(raw: string): unknown {
  let t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  if (start < 0) throw new Error('no JSON object in response');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  throw new Error('unbalanced JSON in response');
}

export async function completeJson<T = Record<string, unknown>>(option: ModelOption, input: Omit<CompleteInput, 'json'>): Promise<T> {
  const raw = await complete(option, { ...input, json: true });
  const v = extractJson(raw);
  if (!v || typeof v !== 'object') throw new Error('JSON is not an object');
  return v as T;
}

// ── validation helpers ────────────────────────────────────────────────────
export const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
export const strArr = (v: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, maxLen)).slice(0, maxItems) : [];
