// To-do execution & tracking in English (the default product language): classification of English task texts, booking
// links with English labels, assignee reminders + typed English replies, follow-up escalation, the Director toast and the
// report line — and no Korean anywhere a person reads.   npx tsx server/scripts/tasks.en.test.ts
// Regression: QA round "integration" (docs/qa/round-integration.md) — ISSUE-001/002/003: todo copy was Korean-only and
// English task texts / replies were not recognised.
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, TASK_FOLLOWUP } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents, TaskCardPayload } from '../../shared/types';
import { classifyTask, openTasksLine } from '../brain/heuristics/tasks';
import { buildBookingLinks } from '../data/booking';
import { setLocale } from '../brain/locale';
import { createApp } from '../orchestrator/app';
import { now, patchDemo } from '../orchestrator/core';
import { createGathering } from '../orchestrator/artifacts';
import { executeTask, firstFollowUpAt, runFollowUps } from '../orchestrator/tasks';
import { handleAction } from '../orchestrator/messages';
import { postReport, stopTicker } from '../orchestrator/proactive';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[]; toasts: string[] };
const HANGUL = /[가-힣]/;
let failures = 0;
let passes = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (ok) passes++; else failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | false, ms = 10000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  console.log(`  (timeout: ${label})`);
  return undefined;
}
async function client(url: string, id: string, key?: string): Promise<Client> {
  const sock = connect(url, { transports: ['websocket'], forceNew: true }) as Client['sock'];
  const c = { id, sock, msgs: [] as Message[], toasts: [] as string[] } as Client;
  sock.on('message:new', m => c.msgs.push(m));
  sock.on('toast', t => c.toasts.push(t.text));
  await new Promise<void>(r => sock.on('connect', () => r()));
  c.boot = await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: id, key }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
  return c;
}

function pureTests(): void {
  setLocale('en');
  console.log('classification (English task texts)');
  const ktx = classifyTask('Book KTX tickets / a car');
  check(ktx.kind === 'booking_link' && ktx.category === 'train', 'Book KTX tickets → booking_link/train');
  const stay = classifyTask('Book lodging and restaurants (few stairs, seated dining)');
  check(stay.kind === 'booking_link' && stay.category === 'lodging', 'Book lodging and restaurants → booking_link/lodging');
  check(classifyTask('Reserve a table at a hanjeongsik restaurant').category === 'restaurant', 'Reserve a table → restaurant');
  check(classifyTask('Book a rental car').category === 'car', 'Book a rental car → car');
  check(classifyTask('Book a hanok stay').query === '한옥 숙소', 'hanok → canonical Korean search noun');
  for (const t of ['Prepare a birthday cake and flowers', 'Send invitations', "Look after Mom's medication and wellbeing", 'Share the schedule with everyone', 'Pick up dinner ingredients'])
    check(classifyTask(t).kind === 'reminder', `${t} → reminder`);
  check(classifyTask('Note: Mom prefers the window seat').kind === 'none', 'Note: … → none');

  console.log('booking links (English labels, Korean search words in the URL)');
  const train = buildBookingLinks({ category: 'train', taskText: 'Book KTX tickets', place: 'Gyeongju area', date: new Date(2026, 10, 22, 12) });
  check(train.query === 'Seoul → Singyeongju' && train.links[0].label === 'Korail Seoul → Singyeongju', `train labels in English (${train.links.map(l => l.label).join(' | ')})`);
  check(train.links[0].url.includes(encodeURIComponent('신경주')), 'Korail URL still uses the Korean station name');
  const food = buildBookingLinks({ category: 'restaurant', taskText: 'Book a restaurant near Bulguksa', place: 'Gyeongju area', query: '식당' });
  check(food.query === 'Gyeongju Bulguksa Temple restaurant' && food.searchQuery === '경주 불국사 식당', `restaurant query: ${food.query} / ${food.searchQuery}`);
  check(food.links.every(l => !HANGUL.test(l.label)) && food.links.some(l => l.url === `https://map.naver.com/p/search/${encodeURIComponent('경주 불국사 식당')}`), 'map links: English label, Korean search');
  check(openTasksLine([{ artifactId: 'a', taskId: 't', text: 'Book KTX tickets / a car', assigneeId: 'minjun', status: 'todo', followUpCount: 0 }], { minjun: 'Minjun' }) === '1 open task · Book KTX tickets / a car (Minjun)', 'openTasksLine (en)');
}

async function flowTests(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-tasks-en-'));
  delete process.env.TACHI_SENIOR_KEY; delete process.env.TACHI_DIRECTOR_KEY;
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 10, quiet: true, locale: 'en' });
  stopTicker();
  const url = `http://localhost:${await listen(0)}`;
  patchDemo({ botsEnabled: false, clockOffsetMinutes: 0 });
  const jieun = await client(url, 'jieun');
  const dir = await client(url, 'director');
  const art = () => ctx.db.artifacts.all().filter(a => a.roomId === FAMILY_ROOM_ID).at(-1)!;
  const task = (re: RegExp) => art().tasks.find(t => re.test(t.text))!;
  const cards = (roomId: string, after: number) => ctx.db.messages.byRoom(roomId, 300).filter(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= after);
  const act = (userId: string, m: Message, actionId: string) => handleAction(userId, { roomId: m.roomId, messageId: m.id, actionId });
  const readable = (m?: Message) => (m ? [m.text, ...(m.actions ?? []).map(a => a.label), ...((m.payload as TaskCardPayload | undefined)?.links ?? []).map(l => l.label)].join(' | ') : '');

  console.log('English gathering tasks are classified');
  await createGathering(FAMILY_ROOM_ID, ctx.db.users.get('minjun')!, "Let's all go to Gyeongju for Mom's birthday!", { forceNew: true });
  const a0 = art();
  check(task(/KTX/).action?.kind === 'booking_link' && task(/lodging/i).action?.kind === 'booking_link' && task(/cake/i).action?.kind === 'reminder', 'KTX + lodging are bookings, cake is a reminder');

  console.log('booking card');
  let t0 = Date.now() - 5;
  await executeTask('jieun', a0.id, task(/lodging/i).id);
  const bcard = cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'booking');
  const bp = bcard?.payload as TaskCardPayload | undefined;
  check(!!bcard && !HANGUL.test(readable(bcard)), `booking card is English: ${readable(bcard).slice(0, 140)}`);
  check(!!bp?.links?.some(l => l.provider === 'naver') && !!bp?.links?.some(l => /restaurant/.test(l.label)), 'lodging + restaurant links');
  const again = Date.now() - 5;
  await executeTask('jieun', a0.id, task(/lodging/i).id);
  const b2 = cards(FAMILY_ROOM_ID, again).find(m => (m.payload as TaskCardPayload).stage === 'booking');
  check(!!b2 && !/Gyeongju Gyeongju/.test(readable(b2)) && !(b2.payload as TaskCardPayload).links!.some(l => l.url.includes(encodeURIComponent('경주 경주'))), 'sharing the links again does not repeat the area (ISSUE-008)');
  await act('jieun', bcard!, 'task_booked');
  const done = cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'done');
  check(task(/lodging/i).done && !!done && !HANGUL.test(done.text) && !HANGUL.test(task(/lodging/i).result ?? ''), `Booked → done in English: ${done?.text}`);

  console.log('assignee reminder + typed English replies');
  const cake = task(/cake/i);
  t0 = Date.now() - 5;
  await executeTask('minjun', a0.id, cake.id);
  const side = await waitFor('side room', () => ctx.db.rooms.all().find(r => r.type === 'side' && r.memberIds.includes(cake.assigneeId!) && r.memberIds.length === 2));
  const rem = side && await waitFor('reminder card', () => ctx.db.messages.byRoom(side.id, 50).find(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= t0));
  check(!!side && !HANGUL.test(side.title ?? ''), `side room title is English: ${side?.title}`);
  check(!!side && !/^(To-do|Scheduling)\s*·/.test(side.title ?? '') && !side.pollId, `ISSUE-016: a to-do room has a plain gathering title and no poll (badge reads To-do): ${side?.title}`);
  check(!!rem && !HANGUL.test(readable(rem)) && rem.actions?.map(a => a.label).join('/') === 'Done/I need help/Later', `reminder card is English: ${readable(rem).slice(0, 160)}`);
  const ownerSock = await client(url, cake.assigneeId!);
  const reply = async (text: string) => { const n = ctx.db.messages.byRoom(side!.id, 200).length; ownerSock.sock.emit('message:send', { roomId: side!.id, text }); return waitFor(`reply to "${text}"`, () => ctx.db.messages.byRoom(side!.id, 200).slice(n).find(m => m.senderId === 'tachi')); };
  const before = now().getTime();
  const r1 = await reply("I'll do it later");
  check(!!r1 && /check in again/.test(r1.text) && !HANGUL.test(r1.text), `typed "later" snoozes: ${r1?.text}`);
  check(Math.abs(Date.parse(task(/cake/i).nextFollowUpAt ?? '0') - before - TASK_FOLLOWUP.snoozeMin * 60000) < 5000, 'snoozed by snoozeMin');
  t0 = Date.now() - 5;
  await executeTask('minjun', a0.id, cake.id);
  await sleep(100);
  const r2 = await reply('Sorry, I need help with this one');
  const esc = await waitFor('family escalation', () => cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'escalate'));
  check(!!r2 && !HANGUL.test(r2.text) && task(/cake/i).status === 'blocked', `typed "help" → blocked: ${r2?.text}`);
  check(!!esc && !HANGUL.test(readable(esc)) && /needs help/.test(esc.text), `family escalation is English: ${readable(esc).slice(0, 140)}`);
  const take = await act('suyeon', esc!, 'task_take');
  check(take.ok && task(/cake/i).assigneeId === 'suyeon', "I'll take it reassigns");
  // typed done
  const meds = task(/medication/i);
  t0 = Date.now() - 5;
  await executeTask('minjun', a0.id, meds.id);
  const side2 = ctx.db.rooms.all().find(r => r.type === 'side' && r.memberIds.includes(meds.assigneeId!) && r.memberIds.length === 2)!;
  await waitFor('meds card', () => ctx.db.messages.byRoom(side2.id, 50).find(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= t0));
  const owner2 = meds.assigneeId === ownerSock.id ? ownerSock : await client(url, meds.assigneeId!);
  owner2.sock.emit('message:send', { roomId: side2.id, text: 'Done, all taken care of!' });
  await waitFor('typed done', () => task(/medication/i).done);
  check(task(/medication/i).done, 'typed "Done" marks it done');

  console.log('follow-up ladder + Director toast');
  const ktxId = task(/KTX/).id;
  { const a = art(); const t = a.tasks.find(x => x.id === ktxId)!; t.followUpLevel = 0; t.followUps = []; t.dueAt = new Date(now().getTime() + 5 * 86400000).toISOString(); t.nextFollowUpAt = firstFollowUpAt(t); ctx.db.artifacts.put(a); }
  const base = Math.ceil((Date.parse(task(/KTX/).nextFollowUpAt!) - now().getTime()) / 60000);
  patchDemo({ clockOffsetMinutes: base + 1 }); await runFollowUps(now());
  patchDemo({ clockOffsetMinutes: base + TASK_FOLLOWUP.repeatAfterMin + 2 }); await runFollowUps(now());
  patchDemo({ clockOffsetMinutes: base + TASK_FOLLOWUP.repeatAfterMin + TASK_FOLLOWUP.escalateAfterMin + 4 });
  dir.toasts.length = 0;
  dir.sock.emit('demo:followups');
  const toast = await waitFor('director toast', () => dir.toasts[0]);
  check(!!toast && !HANGUL.test(toast) && /Followed up on \d+ to-dos?\./.test(toast), `Director follow-up toast in English: ${toast}`);
  const ktxCards = ctx.db.rooms.all().flatMap(r => ctx.db.messages.byRoom(r.id, 300)).filter(m => m.kind === 'task_card' && (m.payload as TaskCardPayload).taskId === ktxId);
  const stages = ktxCards.map(m => (m.payload as TaskCardPayload).stage);
  check(['reminder', 'nudge', 'escalate'].every(s => stages.includes(s as TaskCardPayload['stage'])), `ladder reminder → nudge → escalate (${stages.join(',')})`);
  check(ktxCards.every(m => !HANGUL.test(readable(m))), 'every follow-up card is English');

  console.log('report');
  ctx.db.kv.del('report-fired-on');
  await postReport(false);
  const rep = ctx.db.messages.byRoom(FAMILY_ROOM_ID, 80).filter(m => m.kind === 'report').at(-1);
  const rp = rep?.payload?.type === 'report' ? rep.payload : undefined;
  check(!!rp?.tasksLine && /^\d+ open tasks?/.test(rp.tasksLine) && !HANGUL.test(rp.tasksLine), `report line: ${rp?.tasksLine}`);

  console.log('no Hangul in any task text a person reads');
  const all = ctx.db.rooms.all().flatMap(r => ctx.db.messages.byRoom(r.id, 300)).filter(m => m.kind === 'task_card' || (m.senderId === 'tachi' && m.roomId.startsWith('room-side')));
  const leaks = all.filter(m => HANGUL.test(readable(m)) || HANGUL.test(m.payload?.type === 'task_card' ? m.payload.title : ''));
  check(leaks.length === 0, `task messages without Hangul (${all.length} checked${leaks.length ? `; e.g. ${readable(leaks[0]).slice(0, 80)}` : ''})`);
  const notes = art().tasks.flatMap(t => (t.followUps ?? []).map(f => f.note ?? ''));
  check(notes.every(n => !HANGUL.test(n)), 'follow-up history notes are English');

  jieun.sock.close(); dir.sock.close(); ownerSock.sock.close(); if (owner2 !== ownerSock) owner2.sock.close();
  patchDemo({ clockOffsetMinutes: 0 });
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function main() {
  pureTests();
  await flowTests();
  console.log(failures ? `\nTASKS EN FAILED (${failures}, ${passes} passed)` : `\nTASKS EN OK (${passes} checks)`);
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
