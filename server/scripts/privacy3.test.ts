// Round-3 privacy regressions: non-kin viewers (F7), answer provenance (F6), derived trips (F8), media URLs (F9).
//   npx tsx server/scripts/privacy3.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID } from '../../shared/constants';
import type { Artifact, Bootstrap, ClientToServerEvents, Memory, Message, ServerToClientEvents, Trip } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { applyMemoryVisibility, tripVisibleToFamily } from '../orchestrator/core';
import { createGathering, emitArtifact } from '../orchestrator/artifacts';

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
const reboot = async (c: Client) => {
  const b = await new Promise<Bootstrap>((res, rej) => c.sock.emit('hello', { userId: c.id }, x => ('error' in x ? rej(new Error(x.error)) : res(x))));
  return b;
};

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-p3-'));
  delete process.env.TACHI_SENIOR_KEY; delete process.env.TACHI_DIRECTOR_KEY;
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 20, quiet: true });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  const jieun = await client(url, 'jieun');
  const mom = await client(url, 'mom');

  // ── F7 + F6: a friend joins a room that already holds a health card and an answer built from health + mood
  console.log('F7/F6 non-kin viewer + answer provenance');
  const room = await new Promise<{ id: string }>(res => jieun.sock.emit('room:create', { title: '확인방', memberIds: [] }, r => res(r as { id: string })));
  jieun.sock.emit('message:send', { roomId: room.id, text: '타치, 엄마 혈압 어때?' });
  const card = await waitFor('health card', () => jieun.msgs.find(m => m.roomId === room.id && m.kind === 'health_card'));
  check(!!card, 'kin asker receives the health card');
  jieun.sock.emit('message:send', { roomId: room.id, text: '타치, 엄마 요즘 어때?' });
  const general = await waitFor('general answer', () => jieun.msgs.filter(m => m.roomId === room.id && m.senderId === 'tachi' && m.kind === 'text' && m.meta?.source !== 'rule').at(-1) && jieun.msgs.filter(m => m.roomId === room.id && m.senderId === 'tachi' && m.kind === 'text' && !!m.meta?.categoriesUsed).at(-1));
  check(!!general && (general.meta?.categoriesUsed?.length ?? 0) > 0, `F6: general wellbeing answer carries categoriesUsed (${JSON.stringify(general?.meta?.categoriesUsed)})`);

  jieun.sock.emit('room:invite', { roomId: room.id, contactId: 'c-jungsook' } as never);
  await waitFor('invited', () => jieun.msgs.find(m => m.roomId === room.id && /최정숙님이 초대되었어요/.test(m.text)));
  const friend = await client(url, 'u-jungsook');
  const fb = friend.boot;
  check(fb.memories.length === 0 && fb.trips.length === 0 && fb.health === null && fb.graph.nodes.length === 0, 'F7: friend bootstrap has no memories / trips / health / graph');
  const fmsgs = fb.messages[room.id] ?? [];
  const leak = fmsgs.some(m => m.kind === 'health_card' || m.payload?.type === 'health_card');
  check(!leak && fmsgs.some(m => m.id === card?.id && /가족에게만/.test(m.text)), 'F7: friend sees the health card only as a redacted notice');
  check(!!general && !!fmsgs.find(m => m.id === general.id)?.text.includes('가족에게만'), 'F7: provenance-tagged answer is redacted for the friend');
  const jm = jieun.msgs.find(m => m.id === card?.id);
  check(jm?.kind === 'health_card' && !!jm.payload, 'F7: kin (jieun) still sees the health card');
  // live: a new health answer is redacted for the friend as it arrives
  friend.msgs.length = 0;
  jieun.sock.emit('message:send', { roomId: room.id, text: '타치, 엄마 혈압 알려줘' });
  await sleep(1500);
  check(friend.msgs.every(m => m.senderId !== 'tachi' || m.payload?.type !== 'health_card'), 'F7: live health card is redacted for the friend');
  const live = friend.msgs.filter(m => m.kind === 'health_card');
  check(live.length === 0, 'F7: no health_card kind reaches the friend live');

  // ── round-5 F6: artifacts are projected per viewer (bootstrap, live upsert, non-kin proposals)
  const seedMem = ctx.db.memories.all().find(m => m.visibility === 'family' && m.status === 'saved')!;
  const art: Artifact = {
    id: 'art-p3', roomId: room.id, kind: 'gathering', title: '가족 모임', background: `${seedMem.title} 이야기에서 시작된 모임`, purpose: '', place: '경주 일대',
    dateStatus: 'undecided', agenda: [], tasks: [], notes: '', linkedMemoryId: seedMem.id, linkedTripId: 'trip-none',
    createdBy: 'jieun', updatedBy: 'tachi', updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  };
  const liveArts: Artifact[] = [];
  friend.sock.on('artifact:upsert', a => liveArts.push(a));
  const kinArts: Artifact[] = [];
  jieun.sock.on('artifact:upsert', a => kinArts.push(a));
  ctx.db.artifacts.put(art);
  emitArtifact(art);
  await waitFor('artifact upsert', () => liveArts.length && kinArts.length);
  const stripped = (a?: Artifact) => !!a && !a.background && !a.linkedMemoryId && !a.linkedTripId && !JSON.stringify(a).includes(seedMem.title);
  check(stripped(liveArts.at(-1)), 'round5 F6: live artifact:upsert strips background / linked resources for the friend');
  check(kinArts.at(-1)?.linkedMemoryId === seedMem.id && !!kinArts.at(-1)?.background, 'round5 F6: kin still receives the full artifact');
  const fb2 = await reboot(friend);
  check(stripped(fb2.artifacts.find(a => a.id === art.id)), 'round5 F6: friend bootstrap artifact is stripped');
  const proposer = ctx.db.users.get('u-jungsook')!;
  const ga = await createGathering(room.id, proposer, '경주 가족 여행 가요', { memory: seedMem, forceNew: true });
  check(!ga.linkedMemoryId && !ga.linkedTripId && !ga.background.includes(seedMem.title), 'round5 F6: non-kin proposal cannot pull memory / trip into the draft');

  // ── F6: retraction of a category hides the stored general answer for family
  mom.sock.emit('privacy:set', { category: 'health', visibility: 'private' });
  mom.sock.emit('privacy:set', { category: 'mood', visibility: 'private' });
  await sleep(400);
  const jb = await reboot(jieun);
  const gm = general && (jb.messages[room.id] ?? []).find(m => m.id === general.id);
  const usedPrivate = !!general?.meta?.categoriesUsed?.some(c => c === 'health' || c === 'mood');
  check(!usedPrivate || !general || (!!gm && gm.text !== general.text && /비공개/.test(gm.text)), 'F6: general answer retracted after health/mood go private');
  mom.sock.emit('privacy:set', { category: 'health', visibility: 'family' });
  mom.sock.emit('privacy:set', { category: 'mood', visibility: 'family' });
  await sleep(300);

  // ── F8: derived trips follow their source memory
  console.log('F8 derived trips');
  const mem = ctx.db.memories.all().find(m => m.visibility === 'family' && m.status === 'saved')!;
  const trip: Trip = {
    id: 'trip-p3', memoryId: mem.id, status: 'suggested', createdAt: new Date().toISOString(),
    suggestion: { type: 'trip_suggestion', tripId: 'trip-p3', memoryId: mem.id, title: '다시 찾는 곳, 1박 2일', reason: `${mem.title} 기억을 따라`, destination: mem.place ?? '경주', highlights: [], durationLabel: '1박 2일' },
  };
  ctx.db.trips.put(trip);
  check(tripVisibleToFamily(trip), 'trip visible while its memory is family-visible');
  let jb2 = await reboot(jieun);
  check(jb2.trips.some(t => t.id === trip.id), 'family bootstrap lists the derived trip');
  applyMemoryVisibility(mem.id, 'private');
  check(!tripVisibleToFamily(trip), 'F8: trip hidden once its memory is private');
  jb2 = await reboot(jieun);
  check(!jb2.trips.some(t => t.id === trip.id) && !JSON.stringify(jb2.artifacts).includes('다시 찾는 곳'), 'F8: bootstrap drops the derived trip');
  ctx.db.trips.put({ ...trip, sharedSeparately: true });
  check(tripVisibleToFamily({ ...trip, sharedSeparately: true }), 'F8: sharedSeparately keeps the trip visible');
  ctx.db.trips.delete(trip.id);
  applyMemoryVisibility(mem.id, 'family');

  // ── F9: uploaded media URLs
  console.log('F9 media');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('file', new Blob([png], { type: 'image/png' }), 'x.png');
  const up = await (await fetch(`${url}/api/upload`, { method: 'POST', body: fd })).json() as { url: string };
  const base = path.basename(up.url, path.extname(up.url));
  check(base.length >= 21, `upload name is unguessable (${base.length} chars)`);
  const r0 = await fetch(url + up.url);
  check(r0.status === 200 && /no-store/.test(r0.headers.get('cache-control') ?? ''), 'upload served with Cache-Control private, no-store');
  const pm: Memory = { ...mem, id: 'mem-p3-photo', title: '사진 테스트 추억', photoUrl: up.url, visibility: 'family', status: 'saved' };
  ctx.db.memories.put(pm);
  const bootMom = await reboot(mom);
  void bootMom;
  applyMemoryVisibility(pm.id, 'private');
  const after = ctx.db.memories.get(pm.id)!;
  check(after.photoUrl !== up.url && !!after.photoUrl?.startsWith('/uploads/'), 'F9: photo rotated to a new name when the memory turned private');
  check((await fetch(url + up.url)).status === 404, 'F9: previously leaked URL now 404');
  check((await fetch(url + after.photoUrl!)).status === 200, 'F9: senior still gets the rotated URL');
  const jb3 = await reboot(jieun);
  check(!JSON.stringify(jb3).includes(path.basename(after.photoUrl!)), 'F9: family bootstrap never contains the rotated URL');
  const seeded = ctx.db.memories.get('mem-wedding-1976');
  check(!!seeded?.photoUrl?.startsWith('/uploads/') && path.basename(seeded.photoUrl, '.jpg').length >= 21, 'F9: seeded private wedding photo lives under a non-guessable upload name');
  void FAMILY_ROOM_ID;

  await close();
  console.log(failures ? `\n${failures} FAILED` : '\nall privacy3 checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
