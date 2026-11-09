// End-to-end smoke test: boots the app in-process and plays the 90-second demo with two socket clients.
//   npx tsx server/scripts/smoke.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { DEMO_SCRIPT, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';

type Client = {
  id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[];
};

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function waitFor<T>(label: string, fn: () => T | undefined | false, timeoutMs = 20000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(80); }
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
  c.msgs.push(...Object.values(c.boot.messages).flat());
  return c;
}

const find = (c: Client, roomId: string, kind: string, after: number, sender = 'tachi') =>
  c.msgs.find(m => m.roomId === roomId && m.kind === kind && m.senderId === sender && Date.parse(m.createdAt) >= after);

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-smoke-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 60, quiet: true });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  console.log(`smoke: ${url}  graph=${ctx.graph.engine}  model=${ctx.brain.getModelState().active}`);

  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');
  check(mom.boot.memories.length === 3, 'mom bootstrap has 3 seeded memories');
  check(jieun.boot.memories.length === 2, 'family bootstrap hides the private wedding memory');
  check(mom.boot.rooms.some(r => r.id === FAMILY_ROOM_ID), 'mom is in the family room');
  check(!jieun.boot.users.find(u => u.id === 'jieun')!.isBot, 'jieun persona claimed');

  const say = (c: Client, roomId: string, text?: string, photoUrl?: string) => c.sock.emit('message:send', { roomId, text, photoUrl });
  const tachiCount = (c: Client, roomId: string) => c.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').length;
  const next = async (c: Client, roomId: string, send: () => void, label: string) => {
    const n = tachiCount(c, roomId);
    send();
    await waitFor(label, () => tachiCount(c, roomId) > n);
  };

  // 0) proactive → mom replies → automatic report
  let t0 = Date.now();
  mom.sock.emit('demo:proactive', { kind: 'morning' });
  const pro = await waitFor('proactive greeting', () => mom.msgs.find(m => m.meta?.proactive && Date.parse(m.createdAt) >= t0));
  check(!!pro, 'proactive greeting posted');
  const photoStep = DEMO_SCRIPT.find(s => s.id === 'photo')!;
  const texts = DEMO_SCRIPT.filter(s => ['a-when', 'a-who', 'a-story'].includes(s.id)).map(s => s.text!);

  // 1) photo → interview → memory card
  t0 = Date.now();
  await next(mom, SENIOR_ROOM_ID, () => say(mom, SENIOR_ROOM_ID, undefined, photoStep.photo), 'first interview question');
  for (let i = 0; i < 6 && !find(mom, SENIOR_ROOM_ID, 'memory_card', t0); i++) {
    await next(mom, SENIOR_ROOM_ID, () => say(mom, SENIOR_ROOM_ID, texts[i] ?? '그냥 참 좋았지'), `interview turn ${i + 1}`);
    await sleep(200);
  }
  const card = await waitFor('memory_card', () => find(mom, SENIOR_ROOM_ID, 'memory_card', t0));
  check(!!card, 'memory_card posted after interview');
  if (card?.payload?.type === 'memory_card') check(card.payload.graphDelta.nodes.length > 0, 'memory_card carries graph nodes');
  check(!!card?.actions?.some(a => a.id === 'share_memory'), 'memory_card has share_memory action');

  // 2) share
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'share')!.text);
  check(!!(await waitFor('share_card in family room', () => find(jieun, FAMILY_ROOM_ID, 'share_card', t0))), 'share_card reached the family room');

  // 3) recall
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, '불국사');
  const recall = await waitFor('recall_card', () => find(mom, SENIOR_ROOM_ID, 'recall_card', t0));
  check(!!recall, 'recall_card for "불국사"');

  // 4) trip
  const offer = await waitFor('trip_suggestion', () => find(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0));
  check(!!offer, 'trip suggested');
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'trip')!.text);
  const iti = await waitFor('itinerary', () => find(mom, SENIOR_ROOM_ID, 'itinerary', t0));
  check(!!iti, 'itinerary card after "좋아"');

  // 5) family health Q&A
  t0 = Date.now();
  say(jieun, FAMILY_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'health')!.text);
  check(!!(await waitFor('health_card', () => find(jieun, FAMILY_ROOM_ID, 'health_card', t0))), 'health answer + health_card in family room');

  // 6) gathering
  t0 = Date.now();
  say(jieun, FAMILY_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'gathering')!.text);
  const art = await waitFor('artifact message', () => find(jieun, FAMILY_ROOM_ID, 'artifact', t0));
  check(!!art, 'gathering artifact posted');

  // 7) scheduling (mom + jieun are human → answer by action; others are bots)
  t0 = Date.now();
  say(jieun, FAMILY_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'schedule')!.text);
  const reqMom = await waitFor('schedule_request (mom)', () => find(mom, SENIOR_ROOM_ID, 'schedule_request', t0));
  const reqJieun = await waitFor('schedule_request (jieun)', () => jieun.msgs.find(m => m.kind === 'schedule_request' && Date.parse(m.createdAt) >= t0));
  check(!!find(jieun, FAMILY_ROOM_ID, 'schedule_progress', t0), 'schedule_progress in family room');
  if (reqMom) mom.sock.emit('action', { roomId: reqMom.roomId, messageId: reqMom.id, actionId: 'pick_slots', data: { slotIds: ['slot-0', 'slot-1', 'slot-2', 'slot-3'] } });
  if (reqJieun) jieun.sock.emit('action', { roomId: reqJieun.roomId, messageId: reqJieun.id, actionId: 'pick_slots', data: { slotIds: ['slot-0', 'slot-2', 'slot-3'] } });
  const result = await waitFor('schedule_result', () => find(jieun, FAMILY_ROOM_ID, 'schedule_result', t0), 25000);
  if (!result) jieun.sock.emit('demo:closePoll');
  const result2 = result ?? await waitFor('schedule_result after closePoll', () => find(jieun, FAMILY_ROOM_ID, 'schedule_result', t0));
  check(!!result2, 'schedule_result posted');
  if (result2?.payload?.type === 'schedule_result') check(result2.payload.slot.id === 'slot-2', `chosen slot is the common one (${result2.payload.slot.label})`);

  // 8) report
  t0 = Date.now();
  jieun.sock.emit('demo:report');
  const rep = await waitFor('report', () => jieun.msgs.find(m => m.kind === 'report' && Date.parse(m.createdAt) >= t0));
  check(!!rep, 'report card in family room');
  if (rep?.payload?.type === 'report') check(rep.payload.sessions.filter(s => s.isPrivate).every(s => s.summary === '비공개 대화예요'), 'private sessions are redacted in the report');

  // 9) privacy: switching health to private nulls it for family
  const hp = new Promise<unknown>(r => jieun.sock.once('health:update', h => r(h)));
  mom.sock.emit('privacy:set', { category: 'health', visibility: 'private' });
  check((await Promise.race([hp, sleep(2000).then(() => 'timeout')])) === null, 'health:update is null for family when health is private');

  // 10) reset is quick
  t0 = Date.now();
  await new Promise<void>(r => { mom.sock.once('reset', () => r()); mom.sock.emit('demo:reset'); });
  check(Date.now() - t0 < 2000, `reset finished in ${Date.now() - t0}ms`);

  mom.sock.close(); jieun.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nSMOKE FAILED (${failures})` : '\nSMOKE OK');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
