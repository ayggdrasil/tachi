// Round-4 regressions: F4 shared-trip projection, F5 bot provenance, F6 conservative answer provenance, F7 all-availability, F8 artifact-specific scheduling, together/gathering merge.
//   npx tsx server/scripts/round4.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Artifact, Bootstrap, ClientToServerEvents, Memory, Message, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { applyMemoryVisibility, messageFor, post } from '../orchestrator/core';
import { offerTrip, acceptTrip } from '../orchestrator/senior';
import { botSpeak } from '../orchestrator/bots';
import { answerProvenance, buildFamilyContext } from '../orchestrator/family';
import { startScheduling, tryMomAvailability } from '../orchestrator/scheduling';
import { createGathering } from '../orchestrator/artifacts';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | false, ms = 15000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(60); }
  console.log(`  (timeout: ${label})`);
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
const reboot = (c: Client) => new Promise<Bootstrap>((res, rej) => c.sock.emit('hello', { userId: c.id }, x => ('error' in x ? rej(new Error(x.error)) : res(x))));

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-r4-'));
  delete process.env.TACHI_SENIOR_KEY; delete process.env.TACHI_DIRECTOR_KEY;
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 20, quiet: true });
  const url = `http://localhost:${await listen(0)}`;
  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');
  const base = ctx.db.memories.all().find(m => m.visibility === 'family' && m.status === 'saved')!;
  const mk = (id: string, patch: Partial<Memory>): Memory => ({ ...base, id, ...patch });

  // ── F4: decline memory share → accept trip → share_trip → family sees the itinerary
  console.log('F4 shared trip projection');
  const m4 = mk('mem-r4-f4', { title: '비밀 바닷가 추억', visibility: 'private', status: 'saved', place: '경주' });
  ctx.db.memories.put(m4);
  await offerTrip(SENIOR_ROOM_ID, m4);
  const offer = await waitFor('trip offer', () => mom.msgs.find(m => m.kind === 'trip_suggestion' && m.meta?.memoryId === m4.id));
  const tripId = offer?.meta?.tripId as string;
  await acceptTrip(SENIOR_ROOM_ID, tripId);
  const itin = await waitFor('itinerary', () => mom.msgs.find(m => m.kind === 'itinerary' && m.meta?.tripId === tripId));
  mom.sock.emit('action', { roomId: SENIOR_ROOM_ID, messageId: itin!.id, actionId: 'share_trip' }, () => undefined);
  const famItin = await waitFor('family itinerary', () => jieun.msgs.find(m => m.roomId === FAMILY_ROOM_ID && m.kind === 'itinerary' && m.meta?.tripId === tripId));
  check(!!famItin && !!famItin.payload, 'F4: family receives the live itinerary of a separately shared trip');
  const stored = ctx.db.messages.get(famItin!.id)!;
  const pj = messageFor('jieun', stored);
  check(pj.kind === 'itinerary' && !!pj.payload, 'F4: projection keeps the itinerary although the source memory is private');
  const jb = await reboot(jieun);
  check((jb.messages[FAMILY_ROOM_ID] ?? []).find(m => m.id === stored.id)?.kind === 'itinerary', 'F4: bootstrap shows the itinerary');

  // ── F5: bot reply provenance + retraction
  console.log('F5 bot provenance');
  const m5 = mk('mem-r4-f5', { title: '수박 먹던 여름', visibility: 'family', status: 'saved' });
  ctx.db.memories.put(m5);
  const trig = post(FAMILY_ROOM_ID, { senderId: 'tachi', kind: 'text', text: '어머님이 수박 먹던 여름 이야기를 나눴어요.', meta: { memoryId: m5.id, category: 'memory' } });
  const botUser = ctx.db.users.all().find(u => u.isBot && u.role === 'family')!;
  const reply = await botSpeak(FAMILY_ROOM_ID, botUser, { kind: 'text', text: trig.text }, trig);
  check(!!reply && reply.meta?.memoryId === m5.id && reply.meta?.category === 'memory', 'F5: bot reply carries the trigger provenance');
  check(!!reply && messageFor('jieun', reply).text === reply.text, 'F5: reply visible while the memory is public');
  applyMemoryVisibility(m5.id, 'private');
  check(!!reply && messageFor('jieun', ctx.db.messages.get(reply.id)!).text !== reply.text, 'F5: reply retracted after the memory turned private');
  const late = await botSpeak(FAMILY_ROOM_ID, botUser, { kind: 'text', text: trig.text }, trig);
  check(late === null, 'F5: bot skips a trigger that is already hidden');

  // ── F6: paraphrased answer + individual memory retraction
  console.log('F6 conservative answer provenance');
  const m6 = mk('mem-r4-f6', { title: '여름방학 외갓집', summary: '수박을 가득 나눠 먹던 여름', place: '외갓집마을', visibility: 'family', status: 'saved' });
  ctx.db.memories.put(m6);
  const fctx = buildFamilyContext(ctx.db.users.get('jieun')!);
  const prov = answerProvenance(fctx, '어머님께서 가족과 보낸 달콤한 한여름을 떠올리며 즐거워하셨어요.', 'memory', false, '엄마 추억 얘기 해줘');
  check(prov.memoryIds.includes(m6.id) && prov.categories.includes('memory'), 'F6: paraphrased memory answer is tied to all memories in context');
  const ans = post(FAMILY_ROOM_ID, { senderId: 'tachi', kind: 'text', text: '어머님께서 달콤한 한여름을 떠올리셨어요.', meta: { category: 'memory', categoriesUsed: prov.categories, memoryIdsUsed: prov.memoryIds } });
  check(messageFor('jieun', ans).text === ans.text, 'F6: answer visible before retraction');
  applyMemoryVisibility(m6.id, 'private');
  check(messageFor('jieun', ctx.db.messages.get(ans.id)!).text !== ans.text, 'F6: answer retracted when one individual memory becomes private');

  // ── F8: start_scheduling uses the stored artifactId
  console.log('F8 artifact-specific scheduling');
  const mkArt = (id: string, title: string): Artifact => ({
    id, roomId: FAMILY_ROOM_ID, kind: 'gathering', title, background: '', purpose: '', place: '', dateStatus: 'undecided', agenda: [], tasks: [], notes: '',
    createdBy: 'jieun', updatedBy: 'tachi', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  ctx.db.artifacts.put(mkArt('art-r4-a', '첫 번째 모임'));
  ctx.db.artifacts.put(mkArt('art-r4-b', '두 번째 모임'));
  const card = post(FAMILY_ROOM_ID, { senderId: 'tachi', kind: 'artifact', text: '첫 번째', payload: { type: 'artifact', artifactId: 'art-r4-a' }, actions: [{ id: 'start_scheduling', label: '일정 조율 시작', data: { artifactId: 'art-r4-a' } }] });
  const nPolls = ctx.db.polls.all().length;
  jieun.sock.emit('action', { roomId: FAMILY_ROOM_ID, messageId: card.id, actionId: 'start_scheduling' }, () => undefined);
  const poll = await waitFor('poll', () => ctx.db.polls.all().length > nPolls && ctx.db.polls.all().at(-1));
  check(poll?.artifactId === 'art-r4-a' && poll.title === '첫 번째 모임', `F8: poll belongs to the selected (older) artifact (${poll?.artifactId})`);
  await sleep(300);
  const bad = post(FAMILY_ROOM_ID, { senderId: 'tachi', kind: 'artifact', text: 'x', actions: [{ id: 'start_scheduling', label: 's', data: { artifactId: 'nope' } }] });
  const n2 = ctx.db.polls.all().length;
  await new Promise(r => jieun.sock.emit('action', { roomId: FAMILY_ROOM_ID, messageId: bad.id, actionId: 'start_scheduling' }, r));
  check(ctx.db.polls.all().length === n2, 'F8: foreign / unknown artifactId does not start a poll');

  // ── F7: all-availability answers while a poll awaits mom
  console.log('F7 all-availability');
  for (const p of ctx.db.polls.all()) if (p.status === 'open') ctx.db.polls.put({ ...p, status: 'closed' });
  for (const phrase of ['다 돼요', '전부 가능해요', '언제나 괜찮아', '아무 때나']) {
    await startScheduling(FAMILY_ROOM_ID, { id: 'jieun' });
    const open = ctx.db.polls.all().filter(p => p.status === 'open').at(-1)!;
    const handled = await tryMomAvailability(phrase);
    const after = ctx.db.polls.get(open.id)!;
    check(handled && (after.responses['mom']?.length ?? 0) === open.slots.length, `F7: "${phrase}" accepted as all slots`);
    ctx.db.polls.put({ ...after, status: 'closed' });
  }
  await startScheduling(FAMILY_ROOM_ID, { id: 'jieun' });
  const open2 = ctx.db.polls.all().filter(p => p.status === 'open').at(-1)!;
  check(!(await tryMomAvailability('오늘 점심 먹었어요')) && !ctx.db.polls.get(open2.id)!.responses['mom'], 'F7: meal chat is still excluded');
  ctx.db.polls.put({ ...ctx.db.polls.get(open2.id)!, status: 'closed' });

  // ── together → gathering merge
  console.log('together/gathering merge');
  for (const a of ctx.db.artifacts.all()) ctx.db.artifacts.put({ ...a, createdAt: '2000-01-01T00:00:00.000Z' });
  const mom2 = ctx.db.users.get('mom')!;
  const art = await createGathering(FAMILY_ROOM_ID, mom2, '경주 가족과 함께 가요');
  const nArt = ctx.db.artifacts.all().length;
  const minjun = ctx.db.users.get('minjun')!;
  const merged = await createGathering(FAMILY_ROOM_ID, minjun, '이번 엄마 생신에 다 같이 경주 가자!');
  check(merged.id === art.id && ctx.db.artifacts.all().length === nArt, 'gathering: birthday proposal merges into the same 경주 artifact');
  check(/생신/.test(merged.title) && /생신/.test(merged.purpose ?? ''), `gathering: title/purpose gain the birthday angle (${merged.title})`);
  const last = ctx.db.messages.byRoom(FAMILY_ROOM_ID, 12).filter(m => m.kind === 'artifact').at(-1);
  check(last?.payload?.type === 'artifact' && last.payload.artifactId === art.id, 'gathering: an artifact message is re-posted');

  void applyMemoryVisibility;
  await close();
  console.log(failures ? `\n${failures} FAILED` : '\nall round4 checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
