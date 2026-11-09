// Round-2 regression checks: virtual clock, action authorization, senior key, live/bootstrap privacy projection.
//   npx tsx server/scripts/security.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ReportPayload, ServerToClientEvents, Trip } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { now, post, setDemoClock, syncClock } from '../orchestrator/core';
import { setWallClock } from '../util/misc';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function client(url: string, id: string, key?: string): Promise<Client> {
  const sock = connect(url, { transports: ['websocket'], forceNew: true }) as Client['sock'];
  const c = { id, sock, msgs: [] as Message[] } as Client;
  sock.on('message:new', m => c.msgs.push(m));
  sock.on('message:update', m => { const i = c.msgs.findIndex(x => x.id === m.id); if (i >= 0) c.msgs[i] = m; });
  await new Promise<void>(r => sock.on('connect', () => r()));
  c.boot = await hello(c, key);
  c.msgs.push(...Object.values(c.boot.messages).flat());
  return c;
}
const hello = (c: Client, key?: string) => new Promise<Bootstrap>((res, rej) =>
  c.sock.emit('hello', { userId: c.id, key }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
const act = (c: Client, roomId: string, messageId: string, actionId: string, data?: Record<string, unknown>) =>
  new Promise<{ ok: boolean; error?: string }>(res => { c.sock.emit('action', { roomId, messageId, actionId, data }, r => res(r)); setTimeout(() => res({ ok: false, error: 'no ack' }), 3000); });
const hhmm = () => { const d = now(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

async function main() {
  // ── F3: first scripted clock after boot is absolute even when wall clock is later ──
  const wall = new Date(); wall.setHours(16, 0, 0, 0);
  setWallClock(() => wall.getTime());
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-sec-'));
  process.env.TACHI_SENIOR_KEY = 'mom-secret';
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 20, quiet: true });
  const url = `http://localhost:${await listen(0)}`;
  const dir = await client(url, 'director');
  console.log('clock');
  syncClock(0);
  for (const t of ['09:00', '14:10', '14:20', '21:00']) {
    setDemoClock(t);
    check(hhmm() === t, `clock ${t} (wall 16:00) -> ${hhmm()}`);
  }
  setDemoClock('20:00');
  check(hhmm() === '21:01', 'later calls stay monotonic (20:00 after 21:00 -> 21:01)');
  syncClock(0); // as after reset
  setDemoClock('09:00');
  check(hhmm() === '09:00', 'first clock after reset is absolute again');
  const stamped = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: 'clock check' });
  check(new Date(stamped.createdAt).getHours() === 9, 'message timestamp follows the virtual clock');
  setDemoClock(null); setWallClock(null);

  // ── F6: senior key ──
  console.log('senior key');
  let refused = false;
  try { await client(url, 'mom'); } catch { refused = true; }
  check(refused, 'hello mom without key is refused when TACHI_SENIOR_KEY is set');
  refused = false;
  try { await client(url, 'mom', 'wrong'); } catch { refused = true; }
  check(refused, 'hello mom with wrong key is refused');
  const mom = await client(url, 'mom', 'mom-secret');
  check(!!mom.boot.me, 'hello mom with the right key works');
  const jieun = await client(url, 'jieun');

  // ── F5: action authorization ──
  console.log('action authorization');
  const wedding = () => ctx.db.memories.get('mem-wedding-1976')!.visibility;
  check(wedding() === 'private', 'wedding memory starts private');
  const fam = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: 'plain family message' });
  const famWithAction = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: 'bait', actions: [{ id: 'share_memory', label: 'x', data: { memoryId: 'mem-wedding-1976' } }] });
  await sleep(100);
  let r = await act(jieun, FAMILY_ROOM_ID, fam.id, 'share_memory', { memoryId: 'mem-wedding-1976' });
  check(!r.ok && wedding() === 'private', `jieun share_memory on family message without the action -> rejected (${r.error})`);
  r = await act(jieun, FAMILY_ROOM_ID, famWithAction.id, 'share_memory', { memoryId: 'mem-wedding-1976' });
  check(!r.ok && wedding() === 'private', `jieun share_memory on a family message that carries the action -> rejected (${r.error})`);
  r = await act(jieun, SENIOR_ROOM_ID, 'whatever', 'share_memory', { memoryId: 'mem-wedding-1976' });
  check(!r.ok && wedding() === 'private', `jieun in mom's room -> rejected (${r.error})`);
  r = await act(mom, FAMILY_ROOM_ID, famWithAction.id, 'share_memory', { memoryId: 'mem-wedding-1976' });
  check(!r.ok && wedding() === 'private', `mom's senior action outside her own Tachi room -> rejected (${r.error})`);
  const bait = post(SENIOR_ROOM_ID, { senderId: 'tachi', text: 'bait', actions: [{ id: 'skip_share', label: 'x', data: { memoryId: 'mem-haeundae-1988' } }] });
  r = await act(mom, SENIOR_ROOM_ID, bait.id, 'share_memory', { memoryId: 'mem-wedding-1976' });
  check(!r.ok && wedding() === 'private', `action id not present on the stored message -> rejected (${r.error})`);
  r = await act(mom, SENIOR_ROOM_ID, bait.id, 'skip_share', { memoryId: 'mem-wedding-1976' });
  check(r.ok && wedding() === 'private' && ctx.db.memories.get('mem-haeundae-1988')!.visibility === 'private', 'client memoryId override is ignored (stored action memoryId acted on)');
  const slotMsg = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: 'x' });
  r = await act(jieun, FAMILY_ROOM_ID, slotMsg.id, 'pick_slots', { slotIds: ['bogus'] });
  check(!r.ok, `pick_slots on a non-schedule message -> rejected (${r.error})`);
  r = await act(jieun, FAMILY_ROOM_ID, slotMsg.id, 'no_such_action');
  check(!r.ok, 'unknown action -> rejected');

  // ── F7/F8/F9: live + bootstrap projection ──
  console.log('privacy projection');
  const getJ = (id: string) => jieun.msgs.find(m => m.id === id);
  const setPrivacy = (category: string, visibility: string) => dir.sock.emit('privacy:set', { category, visibility } as never);
  const text1 = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: '어머님 기분은 아주 좋아요', meta: { category: 'mood' } });
  const trip: Trip = {
    id: 'trip-test', memoryId: 'mem-wedding-1976', visibility: 'private', status: 'suggested', createdAt: new Date().toISOString(),
    suggestion: { type: 'trip_suggestion', tripId: 'trip-test', title: '명동성당 나들이', destination: '서울', reason: '1976년 명동성당 결혼식이 떠올랐어요', memoryRef: 'mem-wedding-1976', tags: [] } as never,
  };
  ctx.db.trips.put(trip);
  const tripMsg = post(FAMILY_ROOM_ID, { senderId: 'tachi', kind: 'trip_suggestion', text: '명동성당 나들이 — 1976년 명동성당 결혼식이 떠올랐어요', payload: trip.suggestion, meta: { category: 'trip', tripId: trip.id } });
  const textMem = post(FAMILY_ROOM_ID, { senderId: 'tachi', text: '결혼식 이야기예요', meta: { memoryId: 'mem-wedding-1976' } });
  const report = post(FAMILY_ROOM_ID, {
    senderId: 'tachi', kind: 'report', text: '오늘 09:00, 14:10에 대화했어요.',
    payload: { type: 'report', dateLabel: '11월 9일', moodLabel: '좋음', highlight: '오늘 09:00에 어머님과 대화했어요. 건강 기록 이야기를 하셨어요.',
      sessions: [
        { time: '09:00', title: '아침 안부', summary: '아침 인사', category: 'daily', isPrivate: false },
        { time: '14:10', title: '건강 기록', summary: '혈압을 기록하셨어요', category: 'health', isPrivate: false },
      ] } satisfies ReportPayload,
  });
  await sleep(150);
  check(getJ(text1.id)?.text === text1.text, 'mood text visible while mood is public');
  check(!!getJ(tripMsg.id)?.payload === false, 'private-derived trip message is redacted live for family');
  check(getJ(textMem.id)?.text !== textMem.text, 'text with hidden memory provenance is redacted live');
  const rLive = getJ(report.id)?.payload as ReportPayload | undefined;
  check(rLive?.moodLabel === '좋음', 'report keeps moodLabel while public');

  setPrivacy('mood', 'private'); setPrivacy('health', 'private');
  await sleep(250);
  const edited = { ...ctx.db.messages.get(text1.id)!, text: text1.text + ' (수정)' };
  ctx.db.messages.update(edited);
  const { updateMessage } = await import('../orchestrator/core');
  updateMessage(edited);
  await sleep(150);
  check(getJ(text1.id)?.text !== edited.text && !/기분/.test(getJ(text1.id)?.text ?? ''), 'updateMessage is projected live (mood now private)');
  const dirCopy = dir.msgs.find(m => m.id === text1.id);
  check(dirCopy?.text === edited.text || dirCopy?.text === text1.text, 'director still receives the raw text');

  const fresh = await client(url, 'jieun');
  const bm = Object.values(fresh.boot.messages).flat();
  const bText = bm.find(m => m.id === text1.id);
  check(!!bText && !/기분/.test(bText.text), 'fresh bootstrap: mood answer retracted');
  const bReport = bm.find(m => m.id === report.id);
  const bp = bReport?.payload as ReportPayload | undefined;
  check(!!bp && bp.moodLabel === undefined, 'fresh bootstrap: report moodLabel dropped');
  check(!!bp && bp.sessions.find(s => s.category === 'health')?.isPrivate === true, 'fresh bootstrap: private-category report row re-masked');
  check(!!bp && !/건강 기록/.test(bp.highlight ?? '') && !/건강 기록/.test(bReport!.text), 'fresh bootstrap: highlight regenerated from projected rows');
  check(!fresh.boot.trips.some(t => t.id === 'trip-test'), 'fresh bootstrap: private-derived trip not delivered to family');
  const dirFresh = await client(url, 'director');
  check(dirFresh.boot.trips.some(t => t.id === 'trip-test'), 'director bootstrap still has the trip');

  // trip emission
  const gotTrips: string[] = [];
  jieun.sock.on('trip:upsert', t => gotTrips.push(t.id));
  const { emitTrip } = await import('../orchestrator/core');
  emitTrip({ ...trip, visibility: 'private' });
  await sleep(100);
  check(!gotTrips.includes('trip-test'), 'emitTrip withholds a private-derived trip from family');
  setPrivacy('mood', 'family'); setPrivacy('health', 'family');

  for (const c of [dir, dirFresh, mom, jieun, fresh]) c.sock.close();
  await close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
