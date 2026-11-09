// Agent-loop integration: offline planner flows, reminder delivery on the ticker, privacy, and the live loop with a mocked
// provider (success, fallback to the state machine).   npx tsx server/scripts/agent.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { tick } from '../orchestrator/proactive';
import { resetCircuit } from '../brain/llm';
import { setWallClock } from '../util/misc';

for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'TACHI_DEFAULT_MODEL']) delete process.env[k];
type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | false, timeoutMs = 15000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(50); }
  check(false, `timeout waiting for ${label}`);
  return undefined;
}
async function client(url: string, id: string): Promise<Client> {
  const sock = connect(url, { transports: ['websocket'], forceNew: true }) as Client['sock'];
  const c = { id, sock, msgs: [] as Message[] } as Client;
  sock.on('message:new', m => c.msgs.push(m));
  sock.on('message:update', m => { const i = c.msgs.findIndex(x => x.id === m.id); if (i >= 0) c.msgs[i] = m; });
  await new Promise<void>(r => sock.on('connect', () => r()));
  c.boot = await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: id }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
  return c;
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-agent-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 20, quiet: true });
  const url = `http://localhost:${await listen(0)}`;
  ctx.brain.setActiveModel('demo');
  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');
  const tachiAfter = (c: Client, roomId: string, n: number) => c.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').slice(n);
  const ask = async (c: Client, roomId: string, text: string, label: string, match?: (m: Message) => boolean) => {
    const n = c.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').length;
    c.sock.emit('message:send', { roomId, text });
    return waitFor(label, () => tachiAfter(c, roomId, n).find(m => m.kind === 'text' && (!match || match(m))));
  };

  // ── offline (demo brain): planner-shaped requests use the tools ─────────────
  const r1 = await ask(mom, SENIOR_ROOM_ID, '내일 아침 8시에 혈압약 먹으라고 알려줘', 'reminder reply');
  check(!!r1 && /혈압약 드시기/.test(r1.text) && /알려 드릴게요/.test(r1.text), `senior reminder created (${r1?.text})`);
  check(!!r1?.meta?.toolsUsed?.includes('알림 등록'), 'reply carries toolsUsed');
  check(ctx.db.reminders.all().some(r => r.text === '혈압약 드시기' && r.createdBy === 'mom'), 'reminder stored');

  const r2 = await ask(mom, SENIOR_ROOM_ID, '내일 일정 뭐야?', 'calendar reply');
  check(!!r2 && /연세내과/.test(r2.text), `senior calendar answer (${r2?.text})`);

  const r3 = await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마 일정 좀 알려줘', 'family calendar reply', m => !!m.meta?.toolsUsed);
  check(!!r3 && !/정숙|망원시장/.test(r3.text), `family calendar answer hides the private event (${r3?.text})`);
  check(!!r3 && /바쁨|연세내과/.test(r3.text), 'family calendar answer lists public events / busy time');

  const momBefore = mom.msgs.length;
  const r4 = await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마한테 내일 오후 3시에 병원 가시라고 알려줘', 'family reminder reply', m => !!m.meta?.toolsUsed);
  check(!!r4 && /병원 가기/.test(r4.text), `family-set reminder (${r4?.text})`);
  const announce = await waitFor('mom announcement', () => mom.msgs.slice(momBefore).find(m => m.senderId === 'tachi' && /지은 님 부탁/.test(m.text)));
  check(!!announce, 'mom is told who set the reminder');

  // demo-script texts are untouched by the agent
  const r5 = await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마 오늘 아침에 무슨 얘기 하셨어?', 'private refusal');
  check(!!r5 && !r5.meta?.toolsUsed, 'demo private-question step is not routed to the agent');

  // delivery on the ticker (demo clock jumps to tomorrow 08:01)
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 1, 0, 0);
  setWallClock(() => t.getTime());
  const nDeliv = mom.msgs.length;
  await tick();
  const delivered = await waitFor('reminder delivery', () => mom.msgs.slice(nDeliv).find(m => m.senderId === 'tachi' && /알려 드리기로 한 시간/.test(m.text) && /혈압약/.test(m.text)));
  check(!!delivered, 'due reminder delivered in mom\'s chat');
  await tick();
  await sleep(200);
  check(mom.msgs.slice(nDeliv).filter(m => /알려 드리기로 한 시간/.test(m.text) && /혈압약/.test(m.text)).length === 1, 'delivered exactly once');
  setWallClock(null);

  // ── live (mocked Anthropic over fetch) ──────────────────────────────────────
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.TACHI_ANTHROPIC_BASE_URL = 'http://mock.anthropic.local';
  resetCircuit();
  ctx.brain.setActiveModel('claude-haiku');
  const realFetch = globalThis.fetch;
  const toolBodies: Record<string, unknown>[] = [];
  let mode: 'ok' | 'down' = 'ok';
  let step = 0;
  const reply = (content: unknown[], stop = 'end_turn') => new Response(JSON.stringify({ stop_reason: stop, content }), { status: 200 });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    if (!String(u).startsWith('http://mock.anthropic.local')) return realFetch(u as string, init);
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (!body.tools) return reply([{ type: 'text', text: '{}' }]); // non-agent brain calls: unusable JSON → their heuristics answer
    toolBodies.push(body);
    if (mode === 'down') return new Response('overloaded', { status: 529 });
    step++;
    if (step === 1) return reply([{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 'tu_1', name: 'graph_search', input: { keywords: ['해운대', '결혼식', '명동성당'] } }], 'tool_use');
    if (step === 2) return reply([{ type: 'text', text: '1988년 여름 해운대 가족 피서 이야기가 있어요.' }]);
    return reply([{ type: 'text', text: '{"verified": true, "answer": "1988년 여름, 온 가족이 해운대로 피서를 가셨던 추억이 있어요. 수박 맛을 아직도 그리워하세요."}' }]);
  }) as typeof fetch;
  try {
    const l1 = await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마 해운대 추억 얘기 좀 해줘', 'live agent answer', m => m.meta?.source === 'llm' || !!m.meta?.toolsUsed);
    check(!!l1 && l1.meta?.source === 'llm' && l1.meta?.model === 'Claude Haiku 5.5', `live agent answered (${l1?.meta?.model}/${l1?.meta?.source})`);
    check(!!l1?.meta?.toolsUsed?.includes('추억 그래프'), 'live answer lists the graph tool');
    check(!!l1?.meta?.memoryIdsUsed?.includes('mem-haeundae-1988') && !!l1?.meta?.categoriesUsed?.includes('memory'), 'provenance attached for privacy retraction');
    check(toolBodies.length === 3, `three model turns: tool, draft, verify (${toolBodies.length})`);
    const second = JSON.stringify(toolBodies[1]?.messages ?? '');
    check(second.includes('tool_result') && second.includes('해운대') && !second.includes('명동성당 결혼식'), 'tool_result sent back; private memory never reaches the model');
    check(second.includes('"signature":"s"'), 'assistant thinking block echoed verbatim');

    // provider down → existing state-machine answer (no tools line)
    mode = 'down';
    const before = toolBodies.length;
    const l2 = await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마 옛날 사진 이야기 해줘', 'fallback answer');
    check(toolBodies.length > before, 'agent was attempted');
    check(!!l2 && !l2.meta?.toolsUsed, `fell back to the existing family answer (${l2?.text.slice(0, 40)})`);

    // demo health question never goes to the agent, even live
    mode = 'ok'; resetCircuit();
    const n3 = toolBodies.length;
    await ask(jieun, FAMILY_ROOM_ID, '타치, 엄마 요즘 혈압은 괜찮으셔?', 'health answer');
    check(toolBodies.length === n3, 'health question keeps the privacy-checked state-machine path');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY; delete process.env.TACHI_ANTHROPIC_BASE_URL;
  }

  mom.sock.close(); jieun.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nAGENT FAILED (${failures})` : '\nAGENT OK');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
