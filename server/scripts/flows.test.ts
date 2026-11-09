// Focused regression checks for senior/scheduling flows (round-1 fixes).  npx tsx server/scripts/flows.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { DEMO_SCRIPT, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import { ymd } from '../util/misc';
import { createApp } from '../orchestrator/app';
import { tryMomAvailability } from '../orchestrator/scheduling';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[]; health?: unknown };
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
  sock.on('health:update', h => { c.health = h; });
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

  // F5: a family member cannot publish her private memory through a senior-only action on a family message
  const famMsg = jieun.msgs.find(m => m.roomId === FAMILY_ROOM_ID);
  if (famMsg) {
    jieun.sock.emit('action', { roomId: FAMILY_ROOM_ID, messageId: famMsg.id, actionId: 'share_memory', data: { memoryId: memId } }, () => undefined);
    jieun.sock.emit('action', { roomId: SENIOR_ROOM_ID, messageId: card!.id, actionId: 'share_memory', data: { memoryId: memId } }, () => undefined);
    await sleep(700);
    const jx = await client(url, 'jieun');
    check(!jx.boot.memories.some(m => m.id === memId && m.visibility === 'family') && !find(jx, FAMILY_ROOM_ID, 'share_card', t0), 'F5: family-forged share_memory does not publish');
    jx.sock.close();
  }

  // share via button, immediately recall → exactly one trip_suggestion
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, '가족한테 보내줘');
  await waitFor('share_card', () => find(jieun, FAMILY_ROOM_ID, 'share_card', t0));
  say(mom, SENIOR_ROOM_ID, '불국사');
  await waitFor('recall_card', () => find(mom, SENIOR_ROOM_ID, 'recall_card', t0));
  say(mom, SENIOR_ROOM_ID, '좋아'); // F2: acceptance before the offer has posted must not be dropped
  await waitFor('itinerary', () => find(mom, SENIOR_ROOM_ID, 'itinerary', t0));
  await sleep(3000);
  check(findAll(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0).length === 1, `exactly one trip_suggestion (${findAll(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0).length})`);
  check(findAll(mom, SENIOR_ROOM_ID, 'itinerary', t0).length === 1, 'F2: immediate yes -> exactly one itinerary');
  const sugg = find(mom, SENIOR_ROOM_ID, 'trip_suggestion', t0);
  check(!!sugg?.meta?.tripId && !!sugg?.meta?.memoryId, 'F8: trip suggestion carries meta.tripId/memoryId');
  check(!!sugg?.actions?.every(a => a.done), 'F20: offer actions done after the itinerary committed');
  t0 = Date.now();
  say(mom, SENIOR_ROOM_ID, '가족과 함께 가기');
  check(!!(await waitFor('artifact from itinerary text', () => find(jieun, FAMILY_ROOM_ID, 'artifact', t0))), "'가족과 함께 가기' text creates the gathering");

  // F20: sharing twice is idempotent (one itinerary card in the family room)
  const itin = find(mom, SENIOR_ROOM_ID, 'itinerary', 0)!;
  const nShare = () => jieun.msgs.filter(m => m.roomId === FAMILY_ROOM_ID && m.kind === 'itinerary').length;
  const before = nShare();
  for (let i = 0; i < 2; i++) mom.sock.emit('action', { roomId: SENIOR_ROOM_ID, messageId: itin.id, actionId: 'share_trip' }, () => undefined);
  await sleep(1200);
  check(nShare() === before + 1, `F20: share_trip twice -> one family itinerary (${nShare() - before})`);
  // family-room trip = travel-story card: memory + highlights + date up front, the day plan stays folded
  const famItin = [...jieun.msgs].reverse().find(m => m.roomId === FAMILY_ROOM_ID && m.kind === 'itinerary');
  const story = famItin?.payload?.type === 'itinerary' ? famItin.payload.story : undefined;
  check(!!story && story.highlights.length > 0 && !!story.memoryId && !!story.reason, 'family itinerary is a story card (memory, highlights, reason)');
  check(famItin?.payload?.type === 'itinerary' && famItin.payload.days.length > 0, 'story card still carries the day plan for "View itinerary"');
  if (story?.memoryId && famItin) {
    mom.sock.emit('memory:visibility', { memoryId: story.memoryId, visibility: 'private' });
    await sleep(800);
    const jp = await client(url, 'jieun');
    const projected = (jp.boot.messages[FAMILY_ROOM_ID] ?? []).find(m => m.id === famItin.id);
    const ps = projected?.payload?.type === 'itinerary' ? projected.payload.story : undefined;
    check(!!ps && !ps.memoryId && !ps.reason && ps.highlights.length > 0, 'memory made private -> story card keeps the trip but drops the memory part');
    jp.sock.close();
    mom.sock.emit('memory:visibility', { memoryId: story.memoryId, visibility: 'family' });
    await sleep(800);
  }
  check(!find(mom, SENIOR_ROOM_ID, 'itinerary', 0)?.payload || !(find(mom, SENIOR_ROOM_ID, 'itinerary', 0)!.payload as { story?: unknown }).story, "the senior's own itinerary stays a plain plan card");

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

  check(pl !== undefined && pl.available.every(u => !pl.unavailable.includes(u) && !pl.unanswered?.includes(u)) && !pl.unavailable.some(u => pl.unanswered?.includes(u))
    && new Set([...pl.available, ...pl.unavailable, ...(pl.unanswered ?? [])]).size === pl.available.length + pl.unavailable.length + (pl.unanswered?.length ?? 0), 'F16: available/unavailable/unanswered are disjoint');

  // F18: medication / mood observations are persisted
  await turn('오늘 아침 약 안 먹었어', 'med missed');
  const medOk = await waitFor('health update', () => (mom.health as { medications?: { date: string; taken: boolean }[] } | undefined)?.medications?.some(m => m.taken === false && m.date === ymd(new Date())) , 3000);
  check(!!medOk, 'F18: "약 안 먹었어" stores a missed medication entry');

  // F7: category set to 나만 보기 -> sharing is refused kindly
  mom.sock.emit('privacy:set', { category: 'memory', visibility: 'private' });
  await sleep(300);
  const refused = await turn('가족한테 보내줘', 'share refused');
  check(/나만 보기/.test(refused.text) || /이미/.test(refused.text), `F7: private category -> kind refusal (${refused.text.slice(0, 30)})`);
  mom.sock.emit('privacy:set', { category: 'memory', visibility: 'family' });

  // F17: every proactive quick reply continues sensibly offline
  const dir = await client(url, 'director').catch(() => undefined);
  if (dir) {
    for (const kind of ['morning', 'memory'] as const) {
      const t1 = Date.now();
      dir.sock.emit('demo:proactive', { kind });
      const g = await waitFor(`proactive ${kind}`, () => mom.msgs.find(m => m.roomId === SENIOR_ROOM_ID && m.meta?.proactive && Date.parse(m.createdAt) >= t1));
      for (const chip of g?.quickReplies ?? []) {
        dir.sock.emit('demo:proactive', { kind });
        await sleep(400);
        const t2 = Date.now();
        const n = tachiCount(mom, SENIOR_ROOM_ID);
        say(mom, SENIOR_ROOM_ID, chip);
        await waitFor(`reply to chip ${chip}`, () => tachiCount(mom, SENIOR_ROOM_ID) > n, 8000);
        await sleep(300);
        if (/사진 얘기|얘기해 줄게/.test(chip) && !/다음에|나중에/.test(chip)) {
          check(!!find(mom, SENIOR_ROOM_ID, 'recall_card', t2), `F17: chip "${chip}" recalls the referenced memory`);
        }
      }
    }
    dir.sock.close();
  } else check(false, 'director client unavailable for F17');

  // F12: a refused share keeps the card usable: private category -> ack not ok; after switching to family the same card shares
  {
    const tA = Date.now();
    say(mom, SENIOR_ROOM_ID, undefined, photo);
    await sleep(1200);
    for (let i = 0; i < 6 && !find(mom, SENIOR_ROOM_ID, 'memory_card', tA); i++) { await turn(texts[i] ?? '그냥 참 좋았지', `F12 turn ${i}`); }
    const c2 = await waitFor('F12 memory_card', () => find(mom, SENIOR_ROOM_ID, 'memory_card', tA));
    if (c2) {
      const ackOf = () => new Promise<{ ok: boolean; error?: string }>(res => mom.sock.emit('action', { roomId: SENIOR_ROOM_ID, messageId: c2.id, actionId: 'share_memory' }, r => res(r)));
      mom.sock.emit('privacy:set', { category: 'memory', visibility: 'private' });
      await sleep(300);
      const r1 = await ackOf();
      check(r1.ok === false && r1.error === 'refused', `F12: private category -> ack {ok:false,error:'refused'} (${JSON.stringify(r1)})`);
      check(!c2 || !(mom.msgs.find(m => m.id === c2.id)?.actions?.find(x => x.id === 'share_memory')?.done), 'F12: card action not marked done after refusal');
      mom.sock.emit('privacy:set', { category: 'memory', visibility: 'family' });
      await sleep(300);
      const r2 = await ackOf();
      check(r2.ok === true && !!find(jieun, FAMILY_ROOM_ID, 'share_card', tA), `F12: same card shares after the category changes (${JSON.stringify(r2)})`);
    }
  }


  // ── round-3 additions: invite, casual sentences, merge, availability hijack ──
  {
    const arts = new Map<string, { id: string; roomId: string; place: string; title: string }>();
    jieun.sock.on('artifact:upsert', a => arts.set(a.id, a as never));
    const sysIn = (c: Client, roomId: string, re: RegExp, after: number) => c.msgs.find(m => m.roomId === roomId && m.kind === 'system' && re.test(m.text) && Date.parse(m.createdAt) >= after);
    // P1-6: harin joins the family room with a system line and a non-robotic greeting
    let t1 = Date.now();
    jieun.sock.emit('room:invite', { roomId: FAMILY_ROOM_ID, contactId: 'c-harin' } as never);
    check(!!(await waitFor('invite system note', () => sysIn(jieun, FAMILY_ROOM_ID, /박하린님이 초대되었어요/, t1))), 'inviteContact posts the 초대 system message');
    const greet = await waitFor('harin greeting', () => jieun.msgs.find(m => m.roomId === FAMILY_ROOM_ID && m.senderId === 'harin' && Date.parse(m.createdAt) >= t1), 8000);
    check(!!greet && !/^네, 알겠습니다/.test(greet.text), `harin greeting is not robotic: ${greet?.text}`);

    // P1-3: a friend invited into a new room is not kin; family Q&A is refused
    const room = await new Promise<{ id: string }>(res => jieun.sock.emit('room:create', { title: '친구방', memberIds: ['mom'] }, r => res(r as { id: string })));
    t1 = Date.now();
    jieun.sock.emit('room:invite', { roomId: room.id, contactId: 'c-jungsook' } as never);
    await waitFor('friend invited', () => sysIn(jieun, room.id, /최정숙님이 초대되었어요/, t1));
    const jboot = await client(url, 'jieun');
    const friend = jboot.boot.users.find(u => u.name === '최정숙');
    jboot.sock.close();
    check(!!friend && friend.relation === '친구', 'friend keeps relation 친구 (not in KIN_RELATIONS)');
    t1 = Date.now();
    say(jieun, room.id, '타치, 엄마 요즘 혈압은 괜찮으셔?');
    await sleep(3500);
    const fr = jieun.msgs.filter(m => m.roomId === room.id && m.senderId === 'tachi' && Date.parse(m.createdAt) >= t1);
    check(!fr.some(m => m.kind === 'health_card') && !fr.some(m => /\d{2,3}\/\d{2,3}/.test(m.text)), 'friend in room: no health_card / BP digits');

    // P1-4: casual sentences create no artifact; the real proposal creates one with 경주
    const croom = await new Promise<{ id: string }>(res => jieun.sock.emit('room:create', { title: '남매방', memberIds: ['minjun'] }, r => res(r as { id: string })));
    t1 = Date.now();
    for (const c of ['엄마 생신 선물 뭐가 좋을까?', '타치, 지난번 모임 사진 어디 있어?', '다음 주에 엄마랑 병원 같이 가자']) { say(jieun, croom.id, c); await sleep(1200); }
    await sleep(2500);
    check(!jieun.msgs.some(m => m.roomId === croom.id && m.kind === 'artifact'), 'three casual sentences create 0 artifacts');
    say(jieun, croom.id, '이번 엄마 생신에 다 같이 경주 가자!');
    const am = await waitFor('gathering artifact', () => jieun.msgs.find(m => m.roomId === croom.id && m.kind === 'artifact' && Date.parse(m.createdAt) >= t1));
    const aid = am?.payload?.type === 'artifact' ? am.payload.artifactId : '';
    check(!!aid && /경주/.test(arts.get(aid)?.place ?? ''), `artifact place contains 경주 (${arts.get(aid)?.place})`);
    // second proposal within 24h merges into the same artifact
    t1 = Date.now();
    say(jieun, croom.id, '그날 케이크도 다 같이 준비하자!');
    const m2 = await waitFor('merged artifact post', () => jieun.msgs.find(m => m.roomId === croom.id && m.kind === 'artifact' && Date.parse(m.createdAt) >= t1), 10000);
    check(m2?.payload?.type === 'artifact' && m2.payload.artifactId === aid && /기존 모임 기획서/.test(m2.text), 'P1-4: second proposal merges into the existing artifact');

    // F14: a different destination asks instead of silently merging; choosing "new" makes a second artifact with 부산
    t1 = Date.now();
    say(jieun, croom.id, '부산으로 가족여행 가자');
    const q = await waitFor('gathering choice', () => jieun.msgs.find(m => m.roomId === croom.id && m.senderId === 'tachi' && Date.parse(m.createdAt) >= t1 && m.actions?.some(x => x.id === 'revise_gathering')), 10000);
    check(!!q && !!q.actions?.some(x => x.id === 'new_gathering') && !jieun.msgs.some(m => m.roomId === croom.id && /기존 모임 기획서/.test(m.text) && Date.parse(m.createdAt) >= t1), 'F14: different destination -> choice prompt, no silent merge');
    check(!/부산/.test(arts.get(aid)?.place ?? ''), 'F14: existing artifact untouched');
    if (q) {
      jieun.sock.emit('action', { roomId: croom.id, messageId: q.id, actionId: 'new_gathering' }, () => undefined);
      const second = await waitFor('second artifact', () => [...arts.values()].find(x => x.roomId === croom.id && x.id !== aid), 10000);
      check(!!second && /부산/.test(`${second.place} ${second.title}`), `F14: new_gathering -> second artifact with 부산 (${second?.title})`);
    }

    // P2: 점심 먹었어 during an open poll is not availability
    const nReq = mom.msgs.filter(m => m.kind === 'schedule_request').length;
    say(jieun, FAMILY_ROOM_ID, DEMO_SCRIPT.find(s => s.id === 'schedule')!.text);
    const req2 = await waitFor('second schedule_request', () => mom.msgs.filter(m => m.kind === 'schedule_request').length > nReq && mom.msgs.filter(m => m.kind === 'schedule_request').at(-1));
    if (req2) {
      check((await tryMomAvailability('점심 먹었어')) === false, "P2: '점심 먹었어' is not read as availability");
      check((await tryMomAvailability('아무 때나 괜찮아')) === true, "P2: '아무 때나 괜찮아' is availability");
    }
  }

  mom.sock.close(); jieun.sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nFLOWS FAILED (${failures})` : '\nFLOWS OK');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
