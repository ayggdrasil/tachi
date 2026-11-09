// Agent loop with a mocked provider: tool_use → tool_result → draft → verify; errors; max steps; deadline; brain fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, test } from 'node:test';
import { DEFAULT_PRIVACY, USERS } from '../../shared/constants';
import { openDb, type Db } from '../db';
import { createGraphStore } from '../graph/index';
import type { GraphStore } from '../graph/contract';
import { localCalendar, seedCalendar } from '../tools/calendar';
import { toolsFor, type ToolContext } from '../tools';
import { agentSystemPrompt, runAgentLoop, type AgentTurnFn } from './agent';
import { createBrain } from './index';
import { resetCircuit } from './llm';
import { planOffline, reminderText } from './planner';
import { LLMStopError } from './providers/anthropic';
import type { LLMToolResponse } from './providers/types';

process.env.TACHI_GRAPH_ENGINE = 'memory';
const NOW = new Date(2026, 10, 9, 14, 10);
let db: Db; let graph: GraphStore;
before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-agent-'));
  db = openDb(dir); graph = createGraphStore({ dataDir: dir }); await graph.init();
  seedCalendar(db, NOW);
});
const tctx = (audience: 'senior' | 'family' = 'senior'): ToolContext => ({
  audience, callerId: audience === 'senior' ? 'mom' : 'jieun', seniorId: 'mom', now: () => NOW, db, graph, calendar: localCalendar(db),
  privacy: () => DEFAULT_PRIVACY, memoryVisibleToFamily: () => false, users: () => USERS,
});
const text = (t: string): LLMToolResponse => ({ text: t, toolCalls: [], stop: 'end' });
const call = (id: string, name: string, input: unknown): LLMToolResponse => ({ text: '', toolCalls: [{ id, name, input }], stop: 'tool_use' });
/** scripted provider: returns the responses in order and records every request */
function scripted(responses: (LLMToolResponse | Error)[]) {
  const reqs: Parameters<AgentTurnFn>[0][] = [];
  const turn: AgentTurnFn = async req => {
    reqs.push(structuredClone(req));
    const r = responses.shift();
    if (!r) throw new Error('script exhausted');
    if (r instanceof Error) throw r;
    return r;
  };
  return { turn, reqs };
}
const base = (turn: AgentTurnFn, goal = '불국사 가는 길 알려줘') => ({ turn, tools: toolsFor('senior'), toolCtx: tctx(), system: 'sys', goal });

test('tool_use → tool_result → draft → verified final answer', async () => {
  const s = scripted([
    call('t1', 'transit_route', { to: '불국사' }),
    text('KTX로 2시간 반쯤 걸려요.'),
    text('{"verified": true, "answer": "불국사까지 KTX와 택시로 2시간 반쯤 걸려요."}'),
  ]);
  const out = await runAgentLoop(base(s.turn));
  assert.equal(out.ok, true);
  assert.equal(out.answer, '불국사까지 KTX와 택시로 2시간 반쯤 걸려요.');
  assert.deepEqual(out.toolsUsed, ['길찾기']);
  assert.deepEqual(out.steps.map(x => x.kind), ['tool', 'draft', 'verify']);
  assert.equal(out.mutated, false);
  // second request carries the assistant tool call and the tool result; the verify request follows the draft
  const second = s.reqs[1].messages;
  assert.equal(second[1].role, 'assistant');
  assert.equal(second[2].role, 'tool');
  const res = second[2].role === 'tool' ? second[2].results[0] : undefined;
  assert.equal(res?.callId, 't1'); assert.ok(!res?.isError); assert.match(res!.content, /ktx/);
  assert.match(JSON.stringify(s.reqs[2].messages.at(-1)), /검증 단계/);
  assert.equal(s.reqs[0].tools.length, toolsFor('senior').length);
});

test('tool errors are fed back to the model (is_error), which can recover', async () => {
  const s = scripted([
    call('t1', 'transit_route', { to: '화성 기지' }),
    { text: '', toolCalls: [{ id: 't2', name: 'transit_route', input: {}, parseError: 'invalid JSON arguments' }], stop: 'tool_use' },
    call('t3', 'transit_route', { to: '석굴암' }),
    text('석굴암까지 안내해 드렸어요.'),
    text('{"verified": true, "answer": "석굴암까지 KTX로 가실 수 있어요."}'),
  ]);
  const out = await runAgentLoop(base(s.turn));
  assert.equal(out.ok, true);
  const tools = out.steps.filter(x => x.kind === 'tool');
  assert.deepEqual(tools.map(x => x.ok), [false, false, true]);
  const r1 = s.reqs[1].messages.at(-1);
  assert.ok(r1?.role === 'tool' && r1.results[0].isError && /not_found/.test(r1.results[0].content));
  const r2 = s.reqs[2].messages.at(-1);
  assert.ok(r2?.role === 'tool' && r2.results[0].isError && /invalid_input/.test(r2.results[0].content));
});

test('max steps: a model that never stops calling tools gives up', async () => {
  const s = scripted(Array.from({ length: 10 }, (_, i) => call(`t${i}`, 'map_search', { near: '불국사' })));
  const out = await runAgentLoop({ ...base(s.turn), maxSteps: 3 });
  assert.equal(out.ok, false); assert.equal(out.reason, 'max_steps');
  assert.equal(s.reqs.length, 3);
  assert.deepEqual(out.toolsUsed, ['장소 검색']);
});

test('provider error, refusal, invalid verification, verify=false, empty answer', async () => {
  assert.equal((await runAgentLoop(base(scripted([new Error('anthropic 500')]).turn))).reason, 'provider_error');
  assert.equal((await runAgentLoop(base(scripted([new LLMStopError('refusal', 'no')]).turn))).reason, 'refusal');
  assert.equal((await runAgentLoop(base(scripted([call('a', 'transit_route', { to: '불국사' }), text('초안'), text('검증했어요!')]).turn))).reason, 'invalid_output');
  assert.equal((await runAgentLoop(base(scripted([call('a', 'transit_route', { to: '불국사' }), text('초안'), text('{"verified": false, "answer": "모르겠어요"}')]).turn))).reason, 'verify_failed');
  assert.equal((await runAgentLoop(base(scripted([{ text: '', toolCalls: [], stop: 'end' }]).turn))).reason, 'invalid_output');
});

test('no tools used → answer without a verification turn; verify=false skips it too', async () => {
  const s = scripted([text('안녕하세요, 어머님.')]);
  const out = await runAgentLoop(base(s.turn, '안녕'));
  assert.deepEqual([out.ok, out.answer, s.reqs.length], [true, '안녕하세요, 어머님.', 1]);
  const s2 = scripted([call('a', 'transit_route', { to: '불국사' }), text('**2시간 반** 걸려요.')]);
  const out2 = await runAgentLoop({ ...base(s2.turn), verify: false });
  assert.equal(out2.answer, '2시간 반 걸려요.', 'markdown stripped');
});

test('deadline: a slow provider is aborted and reported', async () => {
  const slow: AgentTurnFn = (_req, o) => new Promise((_, rej) => { o.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
  const t0 = Date.now();
  const out = await runAgentLoop({ ...base(slow), deadlineMs: 300 });
  assert.equal(out.reason, 'deadline');
  assert.ok(Date.now() - t0 < 2000);
});

test('planner: deterministic plans for reminders / calendar / routes only', () => {
  assert.equal(reminderText('내일 아침 8시에 혈압약 먹으라고 알려줘'), '혈압약 드시기');
  assert.equal(reminderText('타치, 엄마한테 3시에 병원 가시라고 알려줘'), '병원 가기');
  assert.equal(planOffline('내일 아침 8시에 혈압약 먹으라고 알려줘', 'senior', NOW)?.[0].name, 'reminder_create');
  assert.deepEqual(planOffline('내일 일정 뭐야?', 'senior', NOW), [{ name: 'calendar_list', input: { userIds: ['mom'], range: '내일' } }]);
  assert.equal(planOffline('경주 불국사 가는 길 알려줘', 'senior', NOW)?.[0].name, 'transit_route');
  for (const t of ['타치, 엄마 혈압 알려줘', '불국사', '타치, 모임 시간 좀 잡아줘', '엄마 안부 좀 알려줘', '응, 애들한테 보내줘', '좋아, 다시 가보고 싶네']) assert.equal(planOffline(t, 'family', NOW), null, t);
  assert.match(agentSystemPrompt({ audience: 'family', senior: USERS[0], asker: USERS[1], users: USERS, now: NOW }), /2026-11-09\(월\) 14:10/);
});

// ── Brain.runAgent: live (mocked fetch) / offline / fallback ────────────────
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; delete process.env.TACHI_ANTHROPIC_BASE_URL; resetCircuit(); });
const anthropicReply = (content: unknown[], stop = 'end_turn') => new Response(JSON.stringify({ stop_reason: stop, content }), { status: 200 });
const input = (goal: string, allowOffline: boolean) => ({ goal, audience: 'senior' as const, tools: toolsFor('senior'), toolCtx: tctx(), system: 'sys', allowOffline });

test('brain.runAgent offline (demo brain): planner executes tools and composes the answer', async () => {
  const brain = createBrain(); brain.setActiveModel('demo');
  const r = await brain.runAgent!(input('내일 일정 뭐야?', true));
  assert.equal(r.value.ok, true); assert.equal(r.source, 'heuristic'); assert.equal(r.fallback, false);
  assert.match(r.value.answer!, /마포 연세내과 정기 검진/);
  assert.deepEqual(r.value.toolsUsed, ['캘린더']);
  const none = await brain.runAgent!(input('불국사', false));
  assert.equal(none.value.ok, false); assert.equal(none.value.reason, 'offline');
});

test('brain.runAgent live: mocked Anthropic tool loop succeeds; failures fall back', async () => {
  process.env.ANTHROPIC_API_KEY = 'test'; process.env.TACHI_ANTHROPIC_BASE_URL = 'http://mock.local';
  const brain = createBrain(); brain.setActiveModel('claude-haiku');
  const script = [
    anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'calendar_list', input: { range: '내일' } }], 'tool_use'),
    anthropicReply([{ type: 'text', text: '내일 10시 반에 병원 검진이 있어요.' }]),
    anthropicReply([{ type: 'text', text: '{"verified":true,"answer":"어머님, 내일 오전 10시 반에 연세내과 검진이 있어요."}' }]),
  ];
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => { bodies.push(JSON.parse(String(init.body))); return script.shift() ?? new Response('x', { status: 500 }); }) as typeof fetch;
  const ok = await brain.runAgent!(input('내일 일정 뭐야?', true));
  assert.equal(ok.value.ok, true); assert.equal(ok.source, 'llm'); assert.equal(ok.model, 'Claude Haiku 5.5');
  assert.match(ok.value.answer!, /연세내과/);
  assert.equal(bodies.length, 3);
  const msgs = bodies[1].messages as { role: string; content: { type: string; tool_use_id?: string }[] }[];
  assert.equal(msgs.at(-1)!.content[0].type, 'tool_result'); assert.equal(msgs.at(-1)!.content[0].tool_use_id, 'tu1');

  // provider down + planner-shaped request → offline planner answers
  globalThis.fetch = (async () => new Response('down', { status: 503 })) as typeof fetch;
  const fb = await brain.runAgent!(input('내일 일정 뭐야?', true));
  assert.equal(fb.value.ok, true); assert.equal(fb.source, 'heuristic'); assert.equal(fb.fallback, true);
  // provider down + no planner → not ok (orchestrator runs the state machine)
  resetCircuit();
  const no = await brain.runAgent!(input('불국사 이야기 해줘', false));
  assert.equal(no.value.ok, false); assert.equal(no.value.reason, 'provider_error');
});

test('brain.runAgent live: a failure after a state-changing tool still reports what was done', async () => {
  process.env.ANTHROPIC_API_KEY = 'test'; process.env.TACHI_ANTHROPIC_BASE_URL = 'http://mock.local';
  const brain = createBrain(); brain.setActiveModel('claude-haiku');
  const script = [
    anthropicReply([{ type: 'tool_use', id: 'tu1', name: 'reminder_create', input: { text: '물 마시기', at: '오후 5시' } }], 'tool_use'),
    new Response('boom', { status: 500 }),
  ];
  globalThis.fetch = (async () => script.shift() ?? new Response('x', { status: 500 })) as typeof fetch;
  const r = await brain.runAgent!(input('5시에 물 마시라고 알려줘', false));
  assert.equal(r.value.ok, true); assert.equal(r.value.mutated, true); assert.equal(r.source, 'heuristic');
  assert.match(r.value.answer!, /물 마시기/);
  assert.ok(db.reminders.all().some(x => x.text === '물 마시기'));
});
