import type { LLMRequest } from './types';

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
  const res = await fetch(`${base.replace(/\/$/, '')}/v1/messages`, {
    method: 'POST', signal,
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelId, max_tokens: req.maxTokens, system: req.system, messages: msgs }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = (data.content ?? []).map(c => c.text ?? '').join('');
  if (!text.trim()) throw new Error('anthropic: empty response');
  return text;
}
