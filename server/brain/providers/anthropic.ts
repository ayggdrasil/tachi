import type { AgentMessage, LLMRequest, LLMToolCall, LLMToolRequest, LLMToolResponse, LLMToolSpec } from './types';

/** Typed stop-reason error: logged, and the heuristic fallback answers. */
export class LLMStopError extends Error {
  constructor(public reason: 'refusal' | 'max_tokens', message: string) { super(message); this.name = 'LLMStopError'; }
}
let fallbacksUnsupported = false;
export const _resetAnthropicFlags = (): void => { fallbacksUnsupported = false; };

type AnthropicBlock = { type?: string; text?: string; id?: string; name?: string; input?: unknown };
export interface AnthropicResponse { stop_reason?: string; stop_details?: { category?: string }; content?: AnthropicBlock[] }

const baseUrl = () => (process.env.TACHI_ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');

/** POST /v1/messages with the shared request policy (effort low, server-side refusal fallback for Sonnet on the default base). */
async function postMessages(modelId: string, body: Record<string, unknown>, signal: AbortSignal): Promise<AnthropicResponse> {
  const base = baseUrl();
  const isDefaultBase = base === 'https://api.anthropic.com';
  const wantFallback = isDefaultBase && !fallbacksUnsupported && /sonnet/i.test(modelId);
  const send = async (withFallback: boolean) => {
    const headers: Record<string, string> = { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    const b: Record<string, unknown> = { model: modelId, ...body, output_config: { effort: 'low' } };
    if (withFallback) { headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; b.fallbacks = 'default'; }
    return fetch(`${base}/v1/messages`, { method: 'POST', signal, headers, body: JSON.stringify(b) });
  };
  let res = await send(wantFallback);
  if (!res.ok && wantFallback && res.status === 400) {
    const txt = await res.text();
    if (/fallbacks|beta/i.test(txt)) { fallbacksUnsupported = true; res = await send(false); }
    else throw new Error(`anthropic 400: ${txt.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as AnthropicResponse;
}

function refusalError(data: AnthropicResponse): LLMStopError {
  return new LLMStopError('refusal', `anthropic: refusal${data.stop_details?.category ? ` (${data.stop_details.category})` : ''}`);
}

export async function anthropicComplete(modelId: string, req: LLMRequest, signal: AbortSignal): Promise<string> {
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
  const data = await postMessages(modelId, { max_tokens: Math.max(req.maxTokens, 2048), system: req.system, messages: msgs }, signal);
  const text = (data.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  if (data.stop_reason === 'refusal') throw refusalError(data);
  if (!text.trim()) {
    if (data.stop_reason === 'max_tokens') throw new LLMStopError('max_tokens', 'anthropic: max_tokens reached with no text (thinking consumed the budget)');
    throw new Error('anthropic: empty response');
  }
  return text;
}

// ── tool use ────────────────────────────────────────────────────────────────
export const toAnthropicTools = (tools: LLMToolSpec[]) => tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

/**
 * Provider-neutral conversation → Messages API `messages`.
 * Assistant turns produced by Anthropic are echoed verbatim (thinking / fallback blocks included); tool results become
 * `tool_result` blocks in ONE user message; consecutive user content is merged (tool results first).
 */
export function toAnthropicMessages(messages: AgentMessage[]): { role: 'user' | 'assistant'; content: unknown[] }[] {
  const out: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const pushUser = (blocks: unknown[]) => {
    const last = out[out.length - 1];
    if (last && last.role === 'user') last.content.push(...blocks);
    else out.push({ role: 'user', content: blocks });
  };
  for (const m of messages) {
    if (m.role === 'user') pushUser([{ type: 'text', text: m.text }]);
    else if (m.role === 'tool') {
      pushUser(m.results.map(r => ({ type: 'tool_result', tool_use_id: r.callId, content: r.content, ...(r.isError ? { is_error: true } : {}) })));
    } else {
      const content = m.raw?.provider === 'anthropic' && Array.isArray(m.raw.content) ? [...(m.raw.content as unknown[])] : [
        ...(m.text ? [{ type: 'text', text: m.text }] : []),
        ...m.toolCalls.map(c => ({ type: 'tool_use', id: c.id, name: c.name, input: c.input ?? {} })),
      ];
      out.push({ role: 'assistant', content });
    }
  }
  if (!out.length || out[0].role !== 'user') out.unshift({ role: 'user', content: [{ type: 'text', text: '(시작)' }] });
  return out;
}

/** Messages API response → provider-neutral tool turn. Throws typed errors on refusal / empty max_tokens. */
export function fromAnthropicResponse(data: AnthropicResponse): LLMToolResponse {
  if (data.stop_reason === 'refusal') throw refusalError(data);
  const blocks = data.content ?? [];
  const text = blocks.filter(c => c.type === 'text').map(c => c.text ?? '').join('').trim();
  const toolCalls: LLMToolCall[] = blocks.filter(c => c.type === 'tool_use' && typeof c.id === 'string' && typeof c.name === 'string')
    .map(c => ({ id: c.id!, name: c.name!, input: c.input ?? {} }));
  if (!toolCalls.length && !text) {
    if (data.stop_reason === 'max_tokens') throw new LLMStopError('max_tokens', 'anthropic: max_tokens reached with no text');
    throw new Error('anthropic: empty response');
  }
  const stop = toolCalls.length ? 'tool_use' : data.stop_reason === 'max_tokens' ? 'max_tokens' : 'end';
  return { text, toolCalls, stop, raw: { provider: 'anthropic', content: blocks } };
}

export async function anthropicToolTurn(modelId: string, req: LLMToolRequest, signal: AbortSignal): Promise<LLMToolResponse> {
  const data = await postMessages(modelId, {
    max_tokens: Math.max(req.maxTokens, 2048), system: req.system, messages: toAnthropicMessages(req.messages),
    tools: toAnthropicTools(req.tools), tool_choice: { type: 'auto' },
  }, signal);
  return fromAnthropicResponse(data);
}
