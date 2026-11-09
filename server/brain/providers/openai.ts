import { LLMStopError } from './anthropic';
import type { AgentMessage, LLMRequest, LLMToolCall, LLMToolRequest, LLMToolResponse, LLMToolSpec } from './types';

const baseUrl = () => (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

async function postChat(body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export async function openaiComplete(modelId: string, req: LLMRequest, signal: AbortSignal): Promise<string> {
  const messages: { role: string; content: unknown }[] = [{ role: 'system', content: req.system }];
  req.turns.forEach(t => messages.push({ role: t.role, content: t.text }));
  if (!req.turns.length) messages.push({ role: 'user', content: '(시작)' });
  if (req.images?.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        messages[i].content = [
          { type: 'text', text: String(messages[i].content) },
          ...req.images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } })),
        ];
        break;
      }
    }
  }
  const body: Record<string, unknown> = { model: modelId, messages, max_completion_tokens: Math.max(req.maxTokens, 2048), reasoning_effort: 'low' };
  if (req.json) body.response_format = { type: 'json_object' };
  const data = (await postChat(body, signal)) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('openai: empty response');
  return text;
}

// ── tool use ────────────────────────────────────────────────────────────────
export const toOpenAITools = (tools: LLMToolSpec[]) =>
  tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));

/** Provider-neutral conversation → Chat Completions `messages` (assistant `tool_calls`, one `role:"tool"` message per result). */
export function toOpenAIMessages(system: string, messages: AgentMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.text });
    else if (m.role === 'tool') for (const r of m.results) out.push({ role: 'tool', tool_call_id: r.callId, content: r.isError ? `ERROR: ${r.content}` : r.content });
    else if (m.raw?.provider === 'openai' && m.raw.content && typeof m.raw.content === 'object') out.push(m.raw.content as Record<string, unknown>);
    else {
      out.push({
        role: 'assistant', content: m.text ?? null,
        ...(m.toolCalls.length ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) } : {}),
      });
    }
  }
  if (out.length === 1) out.push({ role: 'user', content: '(시작)' });
  return out;
}

interface OpenAIToolCallWire { id?: string; type?: string; function?: { name?: string; arguments?: string } }
export interface OpenAIChoice { finish_reason?: string; message?: { role?: string; content?: string | null; refusal?: string | null; tool_calls?: OpenAIToolCallWire[] } }

/** Chat Completions response → provider-neutral tool turn. Unparseable arguments surface as `parseError` (sent back as a tool error). */
export function fromOpenAIResponse(data: { choices?: OpenAIChoice[] }): LLMToolResponse {
  const choice = data.choices?.[0];
  const msg = choice?.message;
  if (!msg) throw new Error('openai: no choices');
  if (msg.refusal) throw new LLMStopError('refusal', `openai: refusal (${String(msg.refusal).slice(0, 80)})`);
  const toolCalls: LLMToolCall[] = (msg.tool_calls ?? []).filter(c => c.function?.name && c.id).map(c => {
    const args = c.function!.arguments ?? '{}';
    try { return { id: c.id!, name: c.function!.name!, input: args.trim() ? JSON.parse(args) : {} }; }
    catch (e) { return { id: c.id!, name: c.function!.name!, input: {}, parseError: `invalid JSON arguments: ${e instanceof Error ? e.message : String(e)}` }; }
  });
  const text = (msg.content ?? '').trim();
  if (!toolCalls.length && !text) {
    if (choice?.finish_reason === 'length') throw new LLMStopError('max_tokens', 'openai: length reached with no text');
    throw new Error('openai: empty response');
  }
  const stop = toolCalls.length ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end';
  const raw = { role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) };
  return { text, toolCalls, stop, raw: { provider: 'openai', content: raw } };
}

export async function openaiToolTurn(modelId: string, req: LLMToolRequest, signal: AbortSignal): Promise<LLMToolResponse> {
  const data = await postChat({
    model: modelId, messages: toOpenAIMessages(req.system, req.messages), tools: toOpenAITools(req.tools), tool_choice: 'auto',
    // with function tools, Chat Completions accepts only 'none' on these models ("use /v1/responses or set reasoning_effort to 'none'")
    max_completion_tokens: Math.max(req.maxTokens, 2048), reasoning_effort: 'none',
  }, signal);
  return fromOpenAIResponse(data as { choices?: OpenAIChoice[] });
}
