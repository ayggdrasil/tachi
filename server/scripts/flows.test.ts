// Focused regression checks for senior/scheduling flows (round-1 fixes).  npx tsx server/scripts/flows.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { DEMO_SCRIPT, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | false, timeoutMs = 20000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(60); }
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
const find = (c: Client, roomId: string, kind: string, after: number) =>
  c.msgs.find(m => m.roomId === roomId && m.kind === kind && m.senderId === 'tachi' && Date.parse(m.createdAt) >= after);
const findAll = (c: Client, roomId: string, kind: string, after: number) =>
  c.msgs.filter(m => m.roomId === roomId && m.kind === kind && m.senderId === 'tachi' && Date.parse(m.createdAt) >= after);

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-flows-'));
  const { listen, close } = await createApp({ port: 0, dataDir, paceMs: 40, quiet: true });
  const url = `http://localhost:${await listen(0)}`;
  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');
  const say = (c: Client, roomId: string, text?: string, photoUrl?: string) => c.sock.emit('message:send', { roomId, text, photoUrl });
  const tachiCount = (c: Client, roomId: string) => c.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').length;
  const lastTachi = (c: Client, roomId: string) => c.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').at(-1);
  const turn = async (text: string, label: string) => {
    const n = tachiCount(mom, SENIOR_ROOM_ID);
    say(mom, SENIOR_ROOM_ID, text);
    await waitFor(label, () => tachiCount(mom, SENIOR_ROOM_ID) > n);
    await sleep(150);
    return lastTachi(mom, SENIOR_ROOM_ID)!;
  };

  // interview → memory card (private)
  const photo = DEMO_SCRIPT.find(s => s.id === 'photo')!.photo;
  const texts = DEMO_SCRIPT.filter(s => ['a-when', 'a-who', 'a-story'].includes(s.id)).map(s => s.text!);
  let t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, undefined, photo);
  await waitFor('first question', () => tachiCount(mom, SENIOR_ROOM_ID) > 0 && lastTachi(mom, SENIOR_ROOM_ID));
  for (let i = 0; i < 6 && !find(mom, SENIOR_ROOM_ID, 'memory_card', t0); i++) { await turn(texts[i] ?? '그냥 참 좋았지', `turn ${i}`); }
  const card = await waitFor('memory_card', () => find(mom, SENIOR_ROOM_ID, 'memory_card', t0));
  const memId = card?.payload?.type === 'memory_card' ? card.payload.memoryId : '';
  const jieunSees = (id: string) => { const m = jieun.boot.memories.find(x => x.id === id); return !!m && m.visibility === 'family'; };
  check(card?.payload?.type === 'memory_card' && card.payload.memory.visibility === 'private', 'new memory is private at the consent moment');

  // '어제 무릎이 아팠어' must NOT share
  const reply = await turn('어제 무릎이 아팠어', 'knee reply');
  check(!find(jieun, FAMILY_ROOM_ID, 'share_card', t0), 'unrelated sentence during share_confirm does not share');
  void reply;

  // decline → private, absent from a fresh family bootstrap
  await turn('나만 간직할게요', 'decline');
  const jieun2 = await client(url, 'jieun');
  check(!jieunSees(memId) && !jieun2.boot.memories.some(m => m.id === memId && m.visibility === 'family'), 'declined memory is private / absent from family bootstrap');
  check(!find(jieun, FAMILY_ROOM_ID, 'share_card', t0), 'no share_card after declining');
  jieun2.sock.close();

  // share via button, immediately recall → exactly one trip_suggestion
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, '가족한테 보내줘');
  await waitFor('share_card', () => find(jieun, FAMILY_ROOM_ID, 'share_card', t0));
  say(mom, SENIOR_ROOM_ID, '불국사');
  await waitFor('recall_card', () => find(mom, SENIOR_ROOM_ID, 'recall_card', t0));
  await sleep(6000);
  check(findAll(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0).length === 1, `exactly one trip_suggestion (${findAll(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0).length})`);

  // accept via text → itinerary → '가족과 함께 가기' makes a gathering
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, '좋아');
  await waitFor('itinerary', () => find(mom, SENIOR_ROOM_ID, 'itinerary', t0));
  await sleep(200);
  say(mom, SENIOR_ROOM_ID, '가족과 함께 가기');
  check(!!(await waitFor('artifact from itinerary text', () => find(jieun, FAMILY_ROOM_ID, 'artifact', t0))), "'가족과 함께 가기' text creates the gathering");

  // blood pressure
  const low = await turn('혈압 80에 50이야', 'bp low');
  check(/앉|물|병원/.test(low.text) && !/안정적/.test(low.text), `BP 80/50 -> cautious advice: ${low.text.slice(0, 40)}`);
  t0 = Date.now();
  const high = await turn('혈압 200에 120이야', 'bp high');
  check(/119/.test(high.text), 'BP 200/120 -> urgent advice');
  check(!!(await waitFor('family alert', () => findAll(jieun, FAMILY_ROOM_ID, 'text', t0).find(m => /혈압 200/.test(m.text)))), 'family room told about severe BP');

  // scheduling without a common slot
  t0 = Date.now();
  say(jieun, FAMILY_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'schedule')!.text);
  const reqMom = await waitFor('request mom', () => find(mom, SENIOR_ROOM_ID, 'schedule_request', t0));
  const reqJ = await waitFor('request jieun', () => jieun.msgs.find(m => m.kind === 'schedule_request' && Date.parse(m.createdAt) >= t0));
  if (reqMom) mom.sock.emit('action', { roomId: reqMom.roomId, messageId: reqMom.id, actionId: 'pick_slots', data: { slotIds: [] } });
  if (reqJ) jieun.sock.emit('action', { roomId: reqJ.roomId, messageId: reqJ.id, actionId: 'pick_slots', data: { slotIds: ['slot-1'] } });
  let res = await waitFor('schedule_result', () => find(jieun, FAMILY_ROOM_ID, 'schedule_result', t0), 20000);
  if (!res) { jieun.sock.emit('demo:closePoll'); res = await waitFor('schedule_result (forced)', () => find(jieun, FAMILY_ROOM_ID, 'schedule_result', t0)); }
  const pl = res?.payload?.type === 'schedule_result' ? res.payload : undefined;
  check(pl?.confirmed === false && pl?.unanimous === false, 'no common slot -> confirmed:false, unanimous:false');
  check(!!res?.actions?.some(a => a.id === 'confirm_slot') && !!res?.actions?.some(a => a.id === 'repoll'), 'result has confirm_slot + repoll actions');

  mom.sock.close(); jieun.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nFLOWS FAILED (${failures})` : '\nFLOWS OK');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
