// Agent loop in English (the default product language): offline planner for English reminder / route / place requests,
// English replies and labels, reminder delivery, privacy of the reminder list, DEMO_SCRIPT_EN untouched, and the live loop's
// English prompts (mocked provider).   npx tsx server/scripts/toolloop.en.test.ts
// Regression: QA round "integration" (docs/qa/round-integration.md) — ISSUE-004/005: the offline triggers only matched
// Korean and every tool-loop reply / prompt / label was Korean.
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { DEMO_SCRIPT_EN, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { tick } from '../orchestrator/proactive';
import { planOffline, reminderTextEn } from '../brain/planner';
import { SENIOR_AGENT_RE, FAMILY_AGENT_RE } from '../orchestrator/agentic';
import { resetCircuit } from '../brain/llm';
import { setWallClock } from '../util/misc';

for (const k of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'TACHI_DEFAULT_MODEL']) delete process.env[k];
type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
const HANGUL = /[가-힣]/;
let failures = 0;
let passes = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (ok) passes++; else failures++; };
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
  await new Promise<void>(r => sock.on('connect', () => r()));
  c.boot = await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: id }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
  return c;
}

function pureTests(): void {
  console.log('planner (English request shapes)');
  const now = new Date(2026, 10, 9, 10, 0);
  const p1 = planOffline('Remind me to take my blood pressure pills tomorrow at 8am', 'senior', now);
  check(p1?.[0]?.name === 'reminder_create' && (p1[0].input as { text: string }).text === 'take your blood pressure pills', `remind → reminder_create (${JSON.stringify(p1?.[0]?.input)})`);
  check(new Date(String((p1?.[0]?.input as { at: string }).at)).getHours() === 8, 'at 8am tomorrow');
  check(planOffline('Tachi, remind Mom to go to the hospital tomorrow at 3pm', 'family', now)?.[0]?.name === 'reminder_create', 'family reminder');
  check(reminderTextEn('Please remind me in 30 minutes to call Minjun') === 'call Minjun', `relative time stripped (${reminderTextEn('Please remind me in 30 minutes to call Minjun')})`);
  check(planOffline('Remind me every day at 9pm to take my joint medicine', 'senior', now)?.[0]?.input.repeat === 'daily', 'every day → daily');
  check(planOffline('What reminders do I have?', 'senior', now)?.[0]?.name === 'reminder_list', 'reminder list');
  check(planOffline('How do I get to Bulguksa in Gyeongju?', 'senior', now)?.[0]?.name === 'transit_route', 'route');
  check(planOffline("Tachi, what's worth visiting near Bulguksa?", 'family', now)?.[0]?.name === 'map_search', 'places near');
  check(planOffline('Remind me later', 'senior', now) === null, 'a reminder without a time is not planned');
  for (const s of DEMO_SCRIPT_EN.filter(x => x.text)) {
    check(planOffline(s.text!, s.room === 'family' ? 'family' : 'senior', now) === null, `DEMO_SCRIPT_EN "${s.id}" is not planned`);
    check(!(s.room === 'family' ? FAMILY_AGENT_RE : SENIOR_AGENT_RE).test(s.text!) || /photo|memor/i.test(s.text!), `DEMO_SCRIPT_EN "${s.id}" does not trigger the live loop`);
  }
}

async function main() {
  pureTests();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-agent-en-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 20, quiet: true, locale: 'en' });
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

  console.log('offline (demo brain) flows in English');
  const r1 = await ask(mom, SENIOR_ROOM_ID, 'Remind me to take my blood pressure pills tomorrow at 8am', 'reminder reply');
  check(!!r1 && /I'll remind you on .*8:00 AM: take your blood pressure pills\./.test(r1.text) && !HANGUL.test(r1.text), `senior reminder created (${r1?.text})`);
  check(!!r1?.meta?.toolsUsed?.includes('set a reminder'), `English tool label (${r1?.meta?.toolsUsed})`);
  check(ctx.db.reminders.all().some(r => r.text === 'take your blood pressure pills' && r.category === 'health'), 'stored as a health reminder');

  const r2 = await ask(mom, SENIOR_ROOM_ID, 'How do I get to Bulguksa in Gyeongju?', 'route reply');
  check(!!r2 && /to Bulguksa Temple takes about/.test(r2.text) && !HANGUL.test(r2.text) && !!r2.meta?.toolsUsed?.includes('directions'), `senior route answer (${r2?.text})`);

  const r3 = await ask(jieun, FAMILY_ROOM_ID, "Tachi, what's worth visiting near Bulguksa?", 'family places reply', m => !!m.meta?.toolsUsed);
  check(!!r3 && /^Near Bulguksa Temple you'll find/.test(r3.text) && !HANGUL.test(r3.text), `family places answer (${r3?.text})`);

  const momBefore = mom.msgs.length;
  const r4 = await ask(jieun, FAMILY_ROOM_ID, 'Tachi, remind Mom to go to the hospital tomorrow at 3pm', 'family reminder reply', m => !!m.meta?.toolsUsed);
  check(!!r4 && /I'll remind Mom on .*3:00 PM: go to the hospital\./.test(r4.text), `family-set reminder (${r4?.text})`);
  const announce = await waitFor('mom announcement', () => mom.msgs.slice(momBefore).find(m => m.senderId === 'tachi' && /Jieun asked me to remind you/.test(m.text)));
  check(!!announce && !HANGUL.test(announce.text), `mom is told who set the reminder (${announce?.text})`);

  // privacy: health is private → the family list hides Mom's own pill reminder but shows the one Jieun set
  mom.sock.emit('privacy:set', { category: 'health', visibility: 'private' });
  await waitFor('health private', () => (ctx.db.kv.get<Record<string, string>>('privacy') ?? {}).health === 'private');
  const r5 = await ask(jieun, FAMILY_ROOM_ID, 'Tachi, what reminders does Mom have?', 'family list', m => !!m.meta?.toolsUsed);
  check(!!r5 && !/blood pressure/i.test(r5.text), `family list hides Mom's private health reminder (${r5?.text})`);

  // demo-script texts are untouched by the agent
  const r6 = await ask(jieun, FAMILY_ROOM_ID, 'Tachi, what did Mom talk about this morning?', 'private refusal');
  check(!!r6 && !r6.meta?.toolsUsed, 'DEMO_SCRIPT_EN private-question step is not routed to the agent');

  // delivery on the ticker (demo clock jumps to tomorrow 08:01)
  const t = new Date(); t.setDate(t.getDate() + 1); t.setHours(8, 1, 0, 0);
  setWallClock(() => t.getTime());
  const nDeliv = mom.msgs.length;
  await tick();
  const delivered = await waitFor('reminder delivery', () => mom.msgs.slice(nDeliv).find(m => m.senderId === 'tachi' && /time for your reminder/.test(m.text) && /blood pressure/.test(m.text)));
  check(!!delivered && !HANGUL.test(delivered.text + (delivered.quickReplies ?? []).join(' ')), `due reminder delivered in English (${delivered?.text} | ${delivered?.quickReplies})`);
  setWallClock(null);

  console.log('live loop (mocked Anthropic) uses English prompts');
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.TACHI_ANTHROPIC_BASE_URL = 'http://mock.anthropic.local';
  resetCircuit();
  ctx.brain.setActiveModel('claude-haiku');
  const realFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  let step = 0;
  const reply = (content: unknown[], stop = 'end_turn') => new Response(JSON.stringify({ stop_reason: stop, content }), { status: 200 });
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    if (!String(u).startsWith('http://mock.anthropic.local')) return realFetch(u as string, init);
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (!body.tools) return reply([{ type: 'text', text: '{}' }]);
    bodies.push(body);
    step++;
    if (step === 1) return reply([{ type: 'tool_use', id: 'tu_1', name: 'transit_route', input: { to: 'Haeundae Beach' } }], 'tool_use');
    if (step === 2) return reply([{ type: 'text', text: 'It takes a while by KTX.' }]);
    return reply([{ type: 'text', text: '{"verified": true, "answer": "Haeundae is about three hours away by KTX and taxi."}' }]);
  }) as typeof fetch;
  try {
    const l1 = await ask(mom, SENIOR_ROOM_ID, 'How do I get to Haeundae?', 'live agent answer', m => m.meta?.source === 'llm');
    check(!!l1 && l1.meta?.source === 'llm' && !!l1.meta?.toolsUsed?.includes('directions'), `live agent answered with English labels (${l1?.meta?.toolsUsed})`);
    const sys = JSON.stringify(bodies[0]?.system ?? '');
    check(/You are Tachi/.test(sys) && /Always answer in English/.test(sys) && !HANGUL.test(sys), 'system prompt is English');
    const verify = JSON.stringify(bodies[2]?.messages ?? '');
    check(/\[Verification\]/.test(verify) && !/검증 단계/.test(verify), 'verification prompt is English');
    const toolResult = JSON.stringify(bodies[1]?.messages ?? '');
    check(/Haeundae Beach/.test(toolResult) && /about \d+ hr/.test(toolResult), 'tool results are English for the model');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY; delete process.env.TACHI_ANTHROPIC_BASE_URL;
  }

  mom.sock.close(); jieun.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nAGENT EN FAILED (${failures}, ${passes} passed)` : `\nAGENT EN OK (${passes} checks)`);
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
