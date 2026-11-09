// English-default product test: the English demo script through demo:say, DMs, and the locale switch.
//   npx tsx server/scripts/en.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { DEMO_SCRIPT_EN, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, Room, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[]; rooms: Room[] };

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const HANGUL = /[가-힣]/;

async function waitFor<T>(label: string, fn: () => T | undefined | false, timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 25000)): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(80); }
  check(false, `timeout waiting for ${label}`);
  return undefined;
}

async function client(url: string, id: string): Promise<Client> {
  const sock = connect(url, { transports: ['websocket'], forceNew: true }) as Client['sock'];
  const c = { id, sock, msgs: [] as Message[], rooms: [] as Room[] } as Client;
  sock.on('message:new', m => c.msgs.push(m));
  sock.on('message:update', m => { const i = c.msgs.findIndex(x => x.id === m.id); if (i >= 0) c.msgs[i] = m; });
  sock.on('room:upsert', r => { const i = c.rooms.findIndex(x => x.id === r.id); if (i >= 0) c.rooms[i] = r; else c.rooms.push(r); });
  await new Promise<void>(r => sock.on('connect', () => r()));
  c.boot = await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: id }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
  c.msgs.push(...Object.values(c.boot.messages).flat());
  return c;
}

const find = (c: Client, roomId: string, kind: string, after: number, sender = 'tachi') =>
  c.msgs.find(m => m.roomId === roomId && m.kind === kind && m.senderId === sender && Date.parse(m.createdAt) >= after);

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-en-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 60, quiet: true, locale: 'en' });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  console.log(`en: ${url}  model=${ctx.brain.getModelState().active}`);

  const dir = await client(url, 'director');
  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');

  // ── English seed ──
  check(dir.boot.locale === 'en' && dir.boot.demo.locale === 'en', 'bootstrap + demo state report locale en');
  check(mom.boot.me.name === 'Soonja Kim' && mom.boot.me.shortName === 'Mom', 'senior persona is English');
  check(mom.boot.rooms.find(r => r.id === SENIOR_ROOM_ID)?.title === 'Tachi' && mom.boot.rooms.find(r => r.id === FAMILY_ROOM_ID)?.title === 'Our Family', 'room titles are English');
  check(mom.boot.memories.length === 3 && mom.boot.memories.some(m => m.title === 'Autumn 1976, wedding at Myeongdong Cathedral'), 'three English seeded memories (private wedding included)');
  check(jieun.boot.memories.length === 2, 'family bootstrap hides the private wedding memory');
  check(!HANGUL.test(JSON.stringify({ users: mom.boot.users, contacts: mom.boot.contacts, mem: mom.boot.memories, msgs: mom.boot.messages, health: mom.boot.health, demo: mom.boot.demo })), 'no Hangul anywhere in the English seed');
  check(mom.boot.demo.proactiveSchedule[0].label === 'Morning check-in', 'English proactive schedule labels');
  check(mom.boot.contacts.some(c => c.relation === 'granddaughter'), 'English contacts');

  // ── English demo script ──
  const step = (id: string) => DEMO_SCRIPT_EN.find(s => s.id === id)!;
  const sayAs = (s: ReturnType<typeof step>) => dir.sock.emit('demo:say', { userId: s.as!, roomId: s.room === 'family' ? FAMILY_ROOM_ID : SENIOR_ROOM_ID, text: s.text, photoUrl: s.photo });
  const tachiCount = (roomId: string) => dir.msgs.filter(m => m.roomId === roomId && m.senderId === 'tachi').length;
  const next = async (send: () => void, roomId: string, label: string) => { const n = tachiCount(roomId); send(); await waitFor(label, () => tachiCount(roomId) > n); };

  let t0 = Date.now();
  dir.sock.emit('demo:proactive', { kind: 'morning' });
  const pro = await waitFor('proactive greeting', () => dir.msgs.find(m => m.meta?.proactive && Date.parse(m.createdAt) >= t0));
  check(!!pro && !HANGUL.test(pro.text), `proactive greeting is English: ${pro?.text.slice(0, 60)}`);

  t0 = Date.now();
  await next(() => sayAs(step('photo')), SENIOR_ROOM_ID, 'first interview question');
  for (const id of ['a-when', 'a-who', 'a-story']) {
    if (find(dir, SENIOR_ROOM_ID, 'memory_card', t0)) break;
    await next(() => sayAs(step(id)), SENIOR_ROOM_ID, `interview turn ${id}`);
    await sleep(200);
  }
  const card = await waitFor('memory_card', () => find(dir, SENIOR_ROOM_ID, 'memory_card', t0));
  check(!!card, 'memory_card posted after the English interview');
  if (card?.payload?.type === 'memory_card') {
    check(card.payload.graphDelta.nodes.length > 0, 'memory_card carries graph nodes');
    check(card.payload.memory.visibility === 'private', 'new memory is private at the consent moment');
    check(!HANGUL.test(card.text + JSON.stringify(card.actions)), `memory card copy has no Hangul: ${card.text.slice(0, 70)}`);
  }
  check(!!card?.actions?.some(a => a.id === 'share_memory' && a.label === 'Share with family'), 'card actions are English');

  t0 = Date.now();
  sayAs(step('share'));
  check(!!(await waitFor('share_card', () => find(jieun, FAMILY_ROOM_ID, 'share_card', t0))), 'share_card reached the family room');

  t0 = Date.now();
  dir.sock.emit('demo:invite', { roomId: FAMILY_ROOM_ID, contactId: 'c-harin' });
  const inv = await waitFor('invite system message', () => dir.msgs.find(m => m.kind === 'system' && m.roomId === FAMILY_ROOM_ID && Date.parse(m.createdAt) >= t0));
  check(inv?.text === 'Harin Park was invited.', `invite note in English: ${inv?.text}`);

  t0 = Date.now();
  sayAs(step('recall'));
  check(!!(await waitFor('recall_card', () => find(dir, SENIOR_ROOM_ID, 'recall_card', t0))), 'recall_card for "Bulguksa"');
  const offer = await waitFor('trip_suggestion', () => find(dir, SENIOR_ROOM_ID, 'trip_suggestion', t0));
  check(!!offer && offer.actions?.[0]?.label === 'Sounds good, let\'s go', 'trip offer with English buttons');

  t0 = Date.now();
  sayAs(step('trip'));
  check(!!(await waitFor('itinerary', () => find(dir, SENIOR_ROOM_ID, 'itinerary', t0))), 'itinerary after "Sounds good"');

  t0 = Date.now();
  sayAs(step('together'));
  check(!!(await waitFor('gathering artifact', () => find(dir, FAMILY_ROOM_ID, 'artifact', t0))), '"Go with family" creates the gathering plan');

  t0 = Date.now();
  sayAs(step('health'));
  check(!!(await waitFor('health_card', () => find(dir, FAMILY_ROOM_ID, 'health_card', t0))), 'family health question → health_card');

  t0 = Date.now();
  sayAs(step('private'));
  const priv = await waitFor('private-chat answer', () => find(dir, FAMILY_ROOM_ID, 'text', t0));
  check(!!priv && !HANGUL.test(priv.text), `private daily-chat question is declined in English: ${priv?.text.slice(0, 70)}`);

  t0 = Date.now();
  sayAs(step('schedule'));
  const result = await waitFor('schedule_result', () => find(dir, FAMILY_ROOM_ID, 'schedule_result', t0), 30000);
  if (!result) dir.sock.emit('demo:closePoll');
  const res2 = result ?? await waitFor('schedule_result after closePoll', () => find(dir, FAMILY_ROOM_ID, 'schedule_result', t0));
  check(!!res2 && !HANGUL.test(res2.text), `schedule result in English: ${res2?.text}`);
  const req = dir.msgs.find(m => m.kind === 'schedule_request');
  if (req?.payload?.type === 'schedule_request') check(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+ \d\d:00$/.test(req.payload.slots[0].label), `slot labels are English: ${req.payload.slots[0].label}`);

  t0 = Date.now();
  dir.sock.emit('demo:report');
  const rep = await waitFor('report', () => dir.msgs.find(m => m.kind === 'report' && Date.parse(m.createdAt) >= t0));
  check(!!rep && !HANGUL.test(JSON.stringify(rep.payload) + rep.text), 'report card has no Hangul');

  // every fixed Tachi/system line produced in this run is English
  const bad = dir.msgs.filter(m => (m.senderId === 'tachi' || m.senderId === 'system') && HANGUL.test(m.text));
  check(bad.length === 0, `no Hangul in Tachi/system copy (${bad.length} offenders${bad[0] ? `: ${bad[0].text.slice(0, 60)}` : ''})`);

  // ── DMs ──
  const momDms: Room[] = [];
  mom.sock.on('room:upsert', r => { if (r.type === 'dm') momDms.push(r); });
  const dm = await new Promise<Room | { error: string }>(r => jieun.sock.emit('room:dm', { userId: 'minjun' }, r));
  check(!('error' in dm) && dm.type === 'dm' && dm.memberIds.length === 2 && dm.memberIds.includes('jieun') && dm.memberIds.includes('minjun') && !dm.memberIds.includes('tachi'), 'room:dm creates a 1:1 room (no Tachi)');
  const dm2 = await new Promise<Room | { error: string }>(r => jieun.sock.emit('room:dm', { userId: 'minjun' }, r));
  check(!('error' in dm) && !('error' in dm2) && dm2.id === dm.id, 'room:dm reuses the existing DM');
  const dmRev = await new Promise<Room | { error: string }>(r => dir.sock.emit('room:dm', { userId: 'jieun' }, r));
  check('error' in dmRev, 'the Director has no DMs');
  const dmMom = await new Promise<Room | { error: string }>(r => jieun.sock.emit('room:dm', { userId: 'mom' }, r));
  await sleep(300);
  check(!('error' in dmMom) && momDms.some(r => r.id === (dmMom as Room).id), 'the other person receives room:upsert');
  check(jieun.rooms.some(r => r.id === (dm as Room).id), 'the creator receives room:upsert');
  if (!('error' in dm)) {
    t0 = Date.now();
    jieun.sock.emit('message:send', { roomId: dm.id, text: 'Hi Minjun, are you coming this weekend?' });
    const reply = await waitFor('bot reply in DM', () => jieun.msgs.find(m => m.roomId === dm.id && m.senderId === 'minjun' && Date.parse(m.createdAt) >= t0), 12000);
    check(!!reply && reply.meta?.generatedBy === 'bot', `unclaimed persona replies in the DM: ${reply?.text.slice(0, 60)}`);
    check(!jieun.msgs.some(m => m.roomId === dm.id && m.senderId === 'tachi'), 'Tachi never speaks in a DM');
    const fresh = await client(url, 'jieun');
    check(fresh.boot.rooms.some(r => r.id === dm.id) && (fresh.boot.messages[dm.id]?.length ?? 0) >= 2, 'DM and its messages are in a fresh bootstrap');
    fresh.sock.close();
    const outsider = await client(url, 'suyeon');
    check(!outsider.boot.rooms.some(r => r.id === dm.id) && !outsider.boot.messages[dm.id], 'a non-member never gets the DM');
    outsider.sock.close();
  }

  // ── locale:set ──
  let reset = false;
  jieun.sock.once('reset', () => { reset = true; });
  jieun.sock.emit('locale:set', { locale: 'ko' });
  await sleep(700);
  check(!reset && ctx.db.users.get('mom')!.name === 'Soonja Kim', 'locale:set from a family member is ignored');
  const gotReset = new Promise<boolean>(r => { mom.sock.once('reset', () => r(true)); setTimeout(() => r(false), 8000); });
  mom.sock.emit('locale:set', { locale: 'ko' });
  check(await gotReset, 'locale:set from the senior reseeds and emits reset');
  const ko = await client(url, 'mom');
  check(ko.boot.locale === 'ko' && ko.boot.demo.locale === 'ko', 'bootstrap now reports ko');
  check(ko.boot.me.name === '김순자' && ko.boot.rooms.some(r => r.title === '우리 가족'), 'seed is Korean after the switch');
  check(ko.boot.memories.some(m => m.title === '1976년 가을, 명동성당 결혼식'), 'Korean memories re-seeded');
  check(ko.boot.demo.proactiveSchedule[0].label === '아침 안부', 'Korean proactive schedule');
  t0 = Date.now();
  const dir2 = await client(url, 'director');
  dir2.sock.emit('demo:proactive', { kind: 'morning' });
  const kpro = await waitFor('Korean proactive greeting', () => dir2.msgs.find(m => m.meta?.proactive && Date.parse(m.createdAt) >= t0));
  check(!!kpro && HANGUL.test(kpro.text), `proactive greeting is Korean after the switch: ${kpro?.text.slice(0, 40)}`);
  // and back
  const back = new Promise<boolean>(r => { dir2.sock.once('reset', () => r(true)); setTimeout(() => r(false), 8000); });
  dir2.sock.emit('locale:set', { locale: 'en' });
  check(await back, 'the Director can switch back to English');
  check(ctx.db.users.get('mom')!.name === 'Soonja Kim', 'English re-seeded');

  for (const c of [dir, mom, jieun, ko, dir2]) c.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nEN TEST FAILED (${failures})` : '\nEN TEST OK');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
