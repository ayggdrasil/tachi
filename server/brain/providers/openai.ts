import type { LLMRequest } from './types';

export async function openaiComplete(modelId: string, req: LLMRequest, signal: AbortSignal): Promise<string> {
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
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
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('openai: empty response');
  return text;
}
