import type { LLMRequest } from './types';

/** Typed stop-reason error: logged, and the heuristic fallback answers. */
export class LLMStopError extends Error {
  constructor(public reason: 'refusal' | 'max_tokens', message: string) { super(message); this.name = 'LLMStopError'; }
}
let fallbacksUnsupported = false;
export const _resetAnthropicFlags = (): void => { fallbacksUnsupported = false; };

export async function anthropicComplete(modelId: string, req: LLMRequest, signal: AbortSignal): Promise<string> {
  const base = process.env.TACHI_ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const msgs: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const t of req.turns) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === t.role && typeof last.content === 'string') last.content += `\n${t.text}`;
    else msgs.push({ role: t.role, content: t.text });
  }
  if (!msgs.length || msgs[0].role !== 'user') msgs.unshift({ role: 'user', content: '(시작)' });
  if (req.images?.length) {
    // attach to the last user message
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        msgs[i].content = [
          ...req.images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } })),
          { type: 'text', text: String(msgs[i].content) },
        ];
        break;
      }
    }
  }
  const isDefaultBase = base.replace(/\/$/, '') === 'https://api.anthropic.com';
  const maxTokens = Math.max(req.maxTokens, 2048);
  const wantFallback = isDefaultBase && !fallbacksUnsupported && /sonnet/i.test(modelId);
  const send = async (withFallback: boolean) => {
    const headers: Record<string, string> = { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    const body: Record<string, unknown> = { model: modelId, max_tokens: maxTokens, system: req.system, messages: msgs, output_config: { effort: 'low' } };
    if (withFallback) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; body.fallbacks = 'default'; }
    return fetch(`${base.replace(/\/$/, '')}/v1/messages`, { method: 'POST', signal, headers, body: JSON.stringify(body) });
  };
  let res = await send(wantFallback);
  if (!res.ok && wantFallback && res.status === 400) {
    const txt = await res.text();
    if (/fallbacks|beta/i.test(txt)) { fallbacksUnsupported = true; res = await send(false); }
    else throw new Error(`anthropic 400: ${txt.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { stop_reason?: string; stop_details?: { category?: string }; content?: { type?: string; text?: string }[] };
  const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  if (data.stop_reason === 'refusal') throw new LLMStopError('refusal', `anthropic: refusal${data.stop_details?.category ? ` (${data.stop_details.category})` : ''}`);
  if (!text.trim()) {
    if (data.stop_reason === 'max_tokens') throw new LLMStopError('max_tokens', 'anthropic: max_tokens reached with no text (thinking consumed the budget)');
    throw new Error('anthropic: empty response');
  }
  return text;
}
