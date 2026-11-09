// Wire-format mapping for tool use: Anthropic Messages (tool_use / tool_result) and OpenAI Chat Completions (tool_calls / role:tool).
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { LLMStopError, _resetAnthropicFlags, anthropicToolTurn, fromAnthropicResponse, toAnthropicMessages, toAnthropicTools } from './anthropic';
import { fromOpenAIResponse, openaiToolTurn, toOpenAIMessages, toOpenAITools } from './openai';
import type { AgentMessage, LLMToolSpec } from './types';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; _resetAnthropicFlags(); delete process.env.TACHI_ANTHROPIC_BASE_URL; });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const spec: LLMToolSpec = { name: 'transit_route', description: '길찾기 / route estimate', inputSchema: { type: 'object', properties: { to: { type: 'string' } } } };
const convo: AgentMessage[] = [
  { role: 'user', text: '불국사 가는 길 알려줘' },
  { role: 'assistant', text: '확인해 볼게요.', toolCalls: [{ id: 'tu_1', name: 'transit_route', input: { to: '불국사' } }, { id: 'tu_2', name: 'reminder_list', input: {} }] },
  { role: 'tool', results: [{ callId: 'tu_1', name: 'transit_route', content: '{"minutes":150}' }, { callId: 'tu_2', name: 'reminder_list', content: '{"error":"x"}', isError: true }] },
  { role: 'user', text: '[검증 단계]' },
];

test('anthropic tools + messages mapping', () => {
  assert.deepEqual(toAnthropicTools([spec]), [{ name: 'transit_route', description: spec.description, input_schema: spec.inputSchema }]);
  const m = toAnthropicMessages(convo);
  assert.equal(m.length, 3, 'tool results and the following user text are merged into one user turn');
  assert.deepEqual(m[1], { role: 'assistant', content: [
    { type: 'text', text: '확인해 볼게요.' },
    { type: 'tool_use', id: 'tu_1', name: 'transit_route', input: { to: '불국사' } },
    { type: 'tool_use', id: 'tu_2', name: 'reminder_list', input: {} },
  ] });
  assert.deepEqual(m[2].content, [
    { type: 'tool_result', tool_use_id: 'tu_1', content: '{"minutes":150}' },
    { type: 'tool_result', tool_use_id: 'tu_2', content: '{"error":"x"}', is_error: true },
    { type: 'text', text: '[검증 단계]' },
  ]);
  // raw anthropic content (thinking + fallback blocks) is echoed verbatim
  const raw = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 'tu_9', name: 'x', input: {} }];
  const echoed = toAnthropicMessages([{ role: 'user', text: 'q' }, { role: 'assistant', toolCalls: [{ id: 'tu_9', name: 'x', input: {} }], raw: { provider: 'anthropic', content: raw } }]);
  assert.deepEqual(echoed[1].content, raw);
});

test('anthropic response mapping: tool_use, text, refusal, empty max_tokens', () => {
  const r = fromAnthropicResponse({ stop_reason: 'tool_use', content: [{ type: 'thinking', text: undefined }, { type: 'text', text: '확인할게요' }, { type: 'tool_use', id: 't1', name: 'graph_search', input: { keywords: ['불국사'] } }] });
  assert.equal(r.stop, 'tool_use');
  assert.deepEqual(r.toolCalls, [{ id: 't1', name: 'graph_search', input: { keywords: ['불국사'] } }]);
  assert.equal(r.raw?.provider, 'anthropic');
  assert.equal(fromAnthropicResponse({ stop_reason: 'end_turn', content: [{ type: 'text', text: '네' }] }).stop, 'end');
  assert.throws(() => fromAnthropicResponse({ stop_reason: 'refusal', content: [] }), (e: unknown) => e instanceof LLMStopError && e.reason === 'refusal');
  assert.throws(() => fromAnthropicResponse({ stop_reason: 'max_tokens', content: [{ type: 'thinking' }] }), (e: unknown) => e instanceof LLMStopError && e.reason === 'max_tokens');
});

test('anthropic tool turn request: tools, tool_choice auto, effort low, no sampling params', async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return json({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }); }) as typeof fetch;
  const out = await anthropicToolTurn('claude-haiku-5-5', { system: 's', messages: convo, tools: [spec], maxTokens: 500 }, new AbortController().signal);
  assert.equal(out.text, 'ok');
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.deepEqual(body.output_config, { effort: 'low' });
  assert.equal((body.tools as unknown[]).length, 1);
  assert.ok((body.max_tokens as number) >= 2048);
  for (const k of ['temperature', 'top_p', 'top_k']) assert.ok(!(k in body));
});

test('openai tools + messages mapping', () => {
  assert.deepEqual(toOpenAITools([spec]), [{ type: 'function', function: { name: 'transit_route', description: spec.description, parameters: spec.inputSchema } }]);
  const m = toOpenAIMessages('sys', convo);
  assert.deepEqual(m[0], { role: 'system', content: 'sys' });
  assert.deepEqual(m[2], { role: 'assistant', content: '확인해 볼게요.', tool_calls: [
    { id: 'tu_1', type: 'function', function: { name: 'transit_route', arguments: '{"to":"불국사"}' } },
    { id: 'tu_2', type: 'function', function: { name: 'reminder_list', arguments: '{}' } },
  ] });
  assert.deepEqual(m[3], { role: 'tool', tool_call_id: 'tu_1', content: '{"minutes":150}' });
  assert.deepEqual(m[4], { role: 'tool', tool_call_id: 'tu_2', content: 'ERROR: {"error":"x"}' });
  assert.deepEqual(m[5], { role: 'user', content: '[검증 단계]' });
});

test('openai response mapping: tool_calls (incl. bad JSON), text, refusal', () => {
  const r = fromOpenAIResponse({ choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [
    { id: 'c1', type: 'function', function: { name: 'transit_route', arguments: '{"to":"불국사"}' } },
    { id: 'c2', type: 'function', function: { name: 'map_search', arguments: '{oops' } },
  ] } }] });
  assert.equal(r.stop, 'tool_use');
  assert.deepEqual(r.toolCalls[0], { id: 'c1', name: 'transit_route', input: { to: '불국사' } });
  assert.match(r.toolCalls[1].parseError ?? '', /invalid JSON/);
  assert.deepEqual((r.raw?.content as { tool_calls: unknown[] }).tool_calls.length, 2);
  assert.equal(fromOpenAIResponse({ choices: [{ finish_reason: 'stop', message: { content: '네' } }] }).text, '네');
  assert.throws(() => fromOpenAIResponse({ choices: [{ message: { content: null, refusal: 'no' } }] }), (e: unknown) => e instanceof LLMStopError && e.reason === 'refusal');
  // raw openai assistant message is echoed as-is on the next request
  const echo = toOpenAIMessages('s', [{ role: 'user', text: 'q' }, { role: 'assistant', toolCalls: r.toolCalls, raw: r.raw }]);
  assert.equal(echo[2], r.raw?.content);
});

test('openai tool turn request: tools, tool_choice auto, reasoning_effort low', async () => {
  let body: Record<string, unknown> = {};
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return json({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }); }) as typeof fetch;
  await openaiToolTurn('gpt-6.1-terra', { system: 's', messages: convo, tools: [spec], maxTokens: 500 }, new AbortController().signal);
  assert.equal(body.tool_choice, 'auto');
  assert.equal(body.reasoning_effort, 'low');
  assert.equal((body.tools as { type: string }[])[0].type, 'function');
  assert.ok(!('temperature' in body) && !('response_format' in body));
});
