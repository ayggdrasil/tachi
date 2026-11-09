import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import type { ModelOption } from '../../shared/types';
import type { ChatTurn } from './contract';
import { anthropicComplete } from './providers/anthropic';
import { openaiComplete } from './providers/openai';
import type { LLMImage, LLMRequest } from './providers/types';

export const LLM_TIMEOUT_MS = 25_000;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

export interface CompleteInput { system: string; turns: ChatTurn[]; images?: LLMImage[]; json?: boolean; maxTokens: number }

export async function complete(option: ModelOption, input: CompleteInput): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
  try {
    const req: LLMRequest = input;
    if (option.provider === 'anthropic') return await anthropicComplete(option.modelId, req, ctrl.signal);
    if (option.provider === 'openai') return await openaiComplete(option.modelId, req, ctrl.signal);
    throw new Error('no provider');
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
