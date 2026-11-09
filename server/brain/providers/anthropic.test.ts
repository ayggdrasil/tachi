import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { LLMStopError, _resetAnthropicFlags, anthropicComplete } from './anthropic';
import { openaiComplete } from './openai';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; _resetAnthropicFlags(); delete process.env.TACHI_ANTHROPIC_BASE_URL; });
const req = { system: 's', turns: [{ role: 'user' as const, text: 'hi' }], maxTokens: 200 };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

test('anthropic request shape: effort low, no temperature, max_tokens >= 2048, fallbacks only for sonnet', async () => {
  const calls: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '안녕하세요' }] });
  }) as typeof fetch;
  assert.equal(await anthropicComplete('claude-sonnet-5-5', req, new AbortController().signal), '안녕하세요');
  await anthropicComplete('claude-haiku-5-5', req, new AbortController().signal);
  const [s, h] = calls;
  for (const c of [s, h]) {
    assert.deepEqual(c.body.output_config, { effort: 'low' });
    assert.ok((c.body.max_tokens as number) >= 2048);
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) assert.ok(!(k in c.body), k);
    assert.equal(c.headers['anthropic-version'], '2023-06-01');
  }
  assert.equal(s.body.fallbacks, 'default');
  assert.equal(s.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.ok(!('fallbacks' in h.body) && !('anthropic-beta' in h.headers));
});

test('anthropic: no fallbacks on custom base; retries once without on 400 and remembers', async () => {
  let n = 0; const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    n++; const b = JSON.parse(String(init.body)); bodies.push(b);
    return 'fallbacks' in b ? json({ error: { message: 'unknown field fallbacks' } }, 400) : json({ content: [{ type: 'text', text: 'ok' }] });
  }) as typeof fetch;
  assert.equal(await anthropicComplete('claude-sonnet-5-5', req, new AbortController().signal), 'ok');
  assert.equal(n, 2);
  await anthropicComplete('claude-sonnet-5-5', req, new AbortController().signal);
  assert.equal(n, 3); // remembered: no second attempt with fallbacks
  _resetAnthropicFlags(); n = 0;
  process.env.TACHI_ANTHROPIC_BASE_URL = 'http://proxy.local';
  await anthropicComplete('claude-sonnet-5-5', req, new AbortController().signal);
  assert.equal(n, 1); assert.ok(!('fallbacks' in bodies[bodies.length - 1]));
});

test('anthropic: thinking-only / max_tokens / refusal throw typed errors', async () => {
  const cases: [unknown, string][] = [
    [{ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] }, 'max_tokens'],
    [{ stop_reason: 'refusal', stop_details: { category: 'x' }, content: [] }, 'refusal'],
  ];
  for (const [body, reason] of cases) {
    globalThis.fetch = (async () => json(body)) as typeof fetch;
    await assert.rejects(anthropicComplete('claude-haiku-5-5', req, new AbortController().signal), (e: unknown) => e instanceof LLMStopError && e.reason === reason);
  }
  globalThis.fetch = (async () => json({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'x' }] })) as typeof fetch;
  await assert.rejects(anthropicComplete('claude-haiku-5-5', req, new AbortController().signal), /empty/);
});

test('openai request shape: reasoning_effort low, max_completion_tokens >= 2048', async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return json({ choices: [{ message: { content: 'hi' } }] }); }) as typeof fetch;
  assert.equal(await openaiComplete('gpt-6.1-terra', req, new AbortController().signal), 'hi');
  assert.equal(body.reasoning_effort, 'low');
  assert.ok((body.max_completion_tokens as number) >= 2048);
  assert.ok(!('temperature' in body));
});
