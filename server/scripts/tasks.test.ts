// To-do execution & tracking: classification, booking links, calendar invites (.ics), reminders, quick replies,
// follow-up escalation on the demo clock, and the report mention.   npx tsx server/scripts/tasks.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID, TASK_FOLLOWUP } from '../../shared/constants';
import type { Artifact, ArtifactTask, Bootstrap, ClientToServerEvents, Message, ServerToClientEvents, TaskCardPayload } from '../../shared/types';
import { classifyTask, openTasksLine } from '../brain/heuristics/tasks';
import { buildBookingLinks, korailUrl, stationFor } from '../data/booking';
import { placeById } from '../data/places';
import { buildIcs, icsEscape, icsFold } from '../calendar/ics';
import { createLocalCalendar } from '../calendar/local';
import { createBrain } from '../brain/index';
import { createApp } from '../orchestrator/app';
import { now, patchDemo } from '../orchestrator/core';
import { createGathering } from '../orchestrator/artifacts';
import { startScheduling, submitAvailability } from '../orchestrator/scheduling';
import { executeTask, firstFollowUpAt, normalizeTasks, openTasksForReport, runFollowUps, sendInvites } from '../orchestrator/tasks';
import { handleAction } from '../orchestrator/messages';
import { postReport, stopTicker } from '../orchestrator/proactive';
import type { CalendarEvent } from '../../shared/types';

type Client = { id: string; sock: Socket<ServerToClientEvents, ClientToServerEvents>; boot: Bootstrap; msgs: Message[] };
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

function pureTests(): void {
  console.log('classification');
  check(classifyTask('KTX·차량 예약').kind === 'booking_link' && classifyTask('KTX·차량 예약').category === 'train', 'KTX·차량 예약 → booking_link/train');
  const lodging = classifyTask('숙소·식당 예약 (계단 적고 앉아서 먹는 곳)');
  check(lodging.kind === 'booking_link' && lodging.category === 'lodging', '숙소·식당 예약 → booking_link/lodging');
  check(classifyTask('보문호수 근처 한정식 식당 예약').category === 'restaurant', '한정식 식당 예약 → restaurant');
  check(classifyTask('가족 캘린더에 일정 공유').kind === 'calendar_invite', '캘린더 일정 공유 → calendar_invite');
  check(classifyTask('생신 케이크·꽃 준비').kind === 'reminder', '케이크·꽃 준비 → reminder');
  check(classifyTask('메모: 어머님 무릎').kind === 'none', '메모 → none');
  check(classifyTask('렌터카 예약').category === 'car', '렌터카 예약 → car');

  console.log('booking links');
  const st = stationFor(placeById('gyeongju-bulguksa'));
  check(st === '신경주', `불국사 → KTX 신경주역 (${st})`);
  const train = buildBookingLinks({ category: 'train', taskText: 'KTX 예약', place: '경주 일대', date: new Date(2026, 10, 22, 12) });
  check(train.links[0].provider === 'korail' && train.links[0].url.startsWith('https://www.letskorail.com/') && train.links[0].url.includes(encodeURIComponent('신경주'))
    && train.links[0].url.includes('selGoDay=22'), `train → Korail deep link with station and date (${train.links[0].url.slice(0, 80)}…)`);
  const food = buildBookingLinks({ category: 'restaurant', taskText: '불국사 근처 한정식 예약', place: '경주 일대', query: '한정식' });
  check(food.query === '경주 불국사 한정식', `restaurant query from the place in the task (${food.query})`);
  check(food.links.some(l => l.url === `https://map.naver.com/p/search/${encodeURIComponent('경주 불국사 한정식')}`)
    && food.links.some(l => l.url === `https://map.kakao.com/?q=${encodeURIComponent('경주 불국사 한정식')}`), 'restaurant → Naver Map + Kakao Map search URLs');
  const stay = buildBookingLinks({ category: 'lodging', taskText: '숙소 예약', place: '부산 일대', query: '숙소' });
  check(stay.query === '부산 숙소', `lodging falls back to the artifact place (${stay.query})`);
  check(korailUrl('서울', '부산').includes('txtGoStart=%EC%84%9C%EC%9A%B8'), 'korailUrl encodes the departure');

  console.log('ics');
  check(icsEscape('a,b;c\\d\ne') === 'a\\,b\\;c\\\\d\\ne', 'TEXT escaping (comma, semicolon, backslash, newline)');
  const long = `SUMMARY:${'가'.repeat(60)}`;
  const folded = icsFold(long);
  check(folded.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75) && folded.split('\r\n').slice(1).every(l => l.startsWith(' '))
    && folded.replace(/\r\n /g, '') === long, 'lines fold at 75 octets without splitting Hangul');
  const ev: CalendarEvent = {
    id: 'cal-test1234', uid: 'cal-test1234@tachi.local', artifactId: 'art-1', title: '어머니 생신 · 경주 가족 여행', description: '첫째 날, 불국사\n둘째 날; 보문호수',
    location: '경주 일대', startsAt: '2026-11-22T03:00:00.000Z', endsAt: '2026-11-22T06:00:00.000Z', organizerId: 'tachi', attendeeIds: ['mom', 'jieun'],
    sequence: 1, status: 'confirmed', provider: 'local', createdAt: '2026-11-09T00:00:00.000Z', updatedAt: '2026-11-09T00:00:00.000Z',
  };
  const ics = buildIcs([ev], { people: id => ({ id, name: id === 'mom' ? '김순자' : id === 'tachi' ? '타치' : '김지은' }), stamp: new Date('2026-11-09T00:00:00Z') });
  check(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics), 'VCALENDAR envelope with CRLF line endings');
  check(ics.includes('DTSTART:20261122T030000Z') && ics.includes('DTEND:20261122T060000Z') && ics.includes('UID:cal-test1234@tachi.local'), 'UTC DTSTART/DTEND + UID');
  check(ics.includes('SEQUENCE:1') && ics.includes('BEGIN:VALARM') && ics.includes('TRIGGER:-PT1440M'), 'SEQUENCE + one-day VALARM');
  const unfolded = ics.replace(/\r\n /g, '');
  check(unfolded.includes('ATTENDEE;CN="김순자";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:mom@family.tachi.local'), 'ATTENDEE with CN');
  check(unfolded.includes('DESCRIPTION:첫째 날\\, 불국사\\n둘째 날\\; 보문호수'), 'DESCRIPTION escaped');
}

async function calendarStoreTests(): Promise<void> {
  console.log('local calendar store');
  const mem = new Map<string, CalendarEvent>();
  const cal = createLocalCalendar(() => ({ get: id => mem.get(id), all: () => [...mem.values()], put: e => { mem.set(e.id, e); return e; } }));
  const e = await cal.create({ title: 't', startsAt: '2026-11-22T03:00:00.000Z', endsAt: '2026-11-22T06:00:00.000Z', organizerId: 'tachi', attendeeIds: ['jieun', 'jieun', 'mom'] });
  check(/^cal-[A-Za-z0-9_-]{16}$/.test(e.id) && e.sequence === 0 && e.attendeeIds.length === 2, 'create: unguessable id, sequence 0, deduped attendees');
  const same = await cal.update(e.id, { title: 't' });
  check(same?.sequence === 0, 'update with no change keeps the sequence');
  const moved = await cal.update(e.id, { startsAt: '2026-11-29T03:00:00.000Z', endsAt: '2026-11-29T06:00:00.000Z' });
  check(moved?.sequence === 1, 'moving the event bumps SEQUENCE');
  check((await cal.list({ attendeeId: 'mom' })).length === 1 && (await cal.list({ attendeeId: 'harin' })).length === 0, 'list by attendee');
  check((await cal.list({ from: '2026-12-01T00:00:00.000Z' })).length === 0, 'list by range');
  check((await cal.cancel(e.id))?.status === 'cancelled', 'cancel');
}

async function brainTests(): Promise<void> {
  console.log('brain classifyTasks (offline)');
  const b = createBrain();
  b.setActiveModel('demo');
  const r = await b.classifyTasks!({ tasks: [{ id: 't1', text: 'KTX 예약' }, { id: 't2', text: '케이크 준비' }] });
  check(r.value.t1.kind === 'booking_link' && r.value.t2.kind === 'reminder' && r.source === 'heuristic', 'demo brain classifies with the heuristic');
  check(openTasksLine([{ artifactId: 'a', taskId: 't', text: 'KTX·차량 예약', assigneeId: 'minjun', status: 'todo', followUpCount: 0 },
    { artifactId: 'a', taskId: 'u', text: '케이크', status: 'blocked', followUpCount: 2 }], { minjun: '민준' }) === '남은 할 일 2개 · KTX·차량 예약(민준) 외 1개 · 도움이 필요한 일 1개', 'openTasksLine wording');
}

async function flowTests(): Promise<void> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-tasks-'));
  delete process.env.TACHI_SENIOR_KEY; delete process.env.TACHI_DIRECTOR_KEY;
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 10, quiet: true });
  stopTicker(); // the test drives the follow-up scheduler itself
  const url = `http://localhost:${await listen(0)}`;
  patchDemo({ botsEnabled: false, clockOffsetMinutes: 0 });
  const mom = await client(url, 'mom');
  const jieun = await client(url, 'jieun');
  const art = () => ctx.db.artifacts.all().filter(a => a.roomId === FAMILY_ROOM_ID).at(-1)!;
  const task = (re: RegExp) => art().tasks.find(t => re.test(t.text))!;
  const cards = (roomId: string, after: number) => ctx.db.messages.byRoom(roomId, 300).filter(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= after);
  const act = (userId: string, m: Message, actionId: string) => handleAction(userId, { roomId: m.roomId, messageId: m.id, actionId });

  console.log('gathering tasks are normalized');
  const minjun = ctx.db.users.get('minjun')!;
  await createGathering(FAMILY_ROOM_ID, minjun, '이번 엄마 생신에 다 같이 경주 가자!', { forceNew: true });
  const a0 = art();
  check(a0.tasks.length >= 4 && a0.tasks.every(t => !!t.action && t.status === 'todo' && !!t.dueAt), 'every task has an action, status todo and a due time');
  check(task(/KTX/).action?.kind === 'booking_link' && task(/숙소/).action?.kind === 'booking_link' && task(/케이크/).action?.kind === 'reminder', 'draft tasks classified (KTX/숙소 booking, 케이크 reminder)');
  const ktx = task(/KTX/);
  check(ktx.assigneeId === 'minjun' && !!ktx.nextFollowUpAt && Date.parse(ktx.nextFollowUpAt) - now().getTime() <= TASK_FOLLOWUP.firstAfterMin * 60000 + 2000, 'owned task gets its first follow-up within firstAfterMin');

  console.log('booking link action');
  let t0 = Date.now() - 5;
  const rb = await executeTask('jieun', a0.id, task(/숙소/).id);
  const bcard = cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'booking');
  const bp = bcard?.payload as TaskCardPayload | undefined;
  check(rb.ok && !!bp && (bp.links ?? []).some(l => l.provider === 'naver' && l.url.includes(encodeURIComponent('경주'))), 'booking card with a Naver Map link for 경주');
  check(!!bcard?.actions?.some(a => a.id === 'task_booked') && /수연님/.test(bcard?.text ?? ''), 'booking card names who is responsible and has 예약 완료');
  check(task(/숙소/).status === 'in_progress' && !!task(/숙소/).link, 'booking task becomes in_progress with a link');
  const rbk = await act('jieun', bcard!, 'task_booked');
  check(rbk.ok && task(/숙소/).done && task(/숙소/).status === 'done' && /예약 완료/.test(task(/숙소/).result ?? ''), '예약 완료 marks the task done');
  check(!task(/숙소/).nextFollowUpAt, 'done task has no follow-up scheduled');

  console.log('calendar invite on confirmation');
  const rNo = await sendInvites(art(), 'jieun', { manual: true });
  check(!rNo.ok && /확정/.test(rNo.message ?? ''), 'invite before the date is confirmed is refused politely');
  t0 = Date.now() - 5;
  await startScheduling(FAMILY_ROOM_ID, { id: 'jieun' }, { artifactId: a0.id });
  const poll = ctx.db.polls.all().filter(p => p.status === 'open').at(-1)!;
  for (const id of poll.participantIds) await submitAvailability(poll.id, id, ['slot-2']);
  const inv = await waitFor('invite card', () => cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'invite'));
  const ip = inv?.payload as TaskCardPayload | undefined;
  check(art().dateStatus === 'confirmed' && !!ip?.event && ip.event.attendeeIds.length === poll.participantIds.length, `invite card in the family room for ${ip?.event?.attendeeIds.length} members`);
  const evs = ctx.db.calendarEvents.all();
  check(evs.length === 1 && evs[0].artifactId === a0.id && evs[0].startsAt === poll.slots[2].startsAt, 'one local calendar event at the confirmed slot');
  check(cards(SENIOR_ROOM_ID, t0).some(m => (m.payload as TaskCardPayload).stage === 'invite' && /달력/.test(m.text)), "mom's own room gets the invite");
  const jSide = poll.sideRoomIds.jieun;
  check(cards(jSide, t0).some(m => (m.payload as TaskCardPayload).stage === 'invite'), "jieun's side room gets the invite");
  const res = await fetch(`${url}${ip!.icsUrl}`);
  const body = await res.text();
  check(res.status === 200 && /text\/calendar/.test(res.headers.get('content-type') ?? '') && body.includes('BEGIN:VEVENT') && body.replace(/\r\n /g, '').includes(`SUMMARY:${icsEscape(art().title)}`), 'GET .ics serves the event');
  check((await fetch(`${url}/api/calendar/cal-doesnotexist00.ics`)).status === 404, 'unknown .ics → 404');
  const nInv = cards(FAMILY_ROOM_ID, t0).length;
  await sendInvites(art(), 'tachi');
  check(cards(FAMILY_ROOM_ID, t0).length === nInv, 'automatic invite is idempotent (no duplicate card)');
  const rRe = await sendInvites(art(), 'jieun', { manual: true });
  check(rRe.ok && cards(FAMILY_ROOM_ID, t0).length === nInv + 1 && ctx.db.calendarEvents.all().length === 1, 'manual re-send posts again but reuses the event');

  console.log('assignee reminder + quick replies');
  const cake = task(/케이크/);
  check(cake.assigneeId === 'jieun', 'cake task owned by jieun');
  t0 = Date.now() - 5;
  const rr = await executeTask('minjun', a0.id, cake.id);
  const rem = await waitFor('reminder card', () => ctx.db.messages.byRoom(jSide, 50).find(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= t0 && (m.payload as TaskCardPayload).taskId === cake.id));
  check(rr.ok && !!rem && ['task_done', 'task_help', 'task_later'].every(id => rem.actions?.some(a => a.id === id)), 'reminder DM in the side room with 완료/도움 필요/나중에');
  check((task(/케이크/).followUps ?? []).some(f => f.kind === 'manual' && f.roomId === jSide) && task(/케이크/).followUpLevel === 1, 'manual reminder recorded (level 1)');
  const notMine = await act('minjun', rem!, 'task_done');
  check(!notMine.ok && !task(/케이크/).done, 'someone else cannot answer the assignee reminder');
  const beforeLater = now().getTime();
  const rl = await act('jieun', rem!, 'task_later');
  const snooze = Date.parse(task(/케이크/).nextFollowUpAt ?? '0') - beforeLater;
  check(rl.ok && Math.abs(snooze - TASK_FOLLOWUP.snoozeMin * 60000) < 5000, `나중에 snoozes by ${TASK_FOLLOWUP.snoozeMin} min`);
  check(!!ctx.db.messages.get(rem!.id)?.actions?.every(a => a.done), 'answered card buttons are closed');
  // typed quick reply to the next reminder
  t0 = Date.now() - 5;
  await executeTask('minjun', a0.id, cake.id);
  await waitFor('second reminder', () => ctx.db.messages.byRoom(jSide, 50).find(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= t0));
  t0 = Date.now() - 5;
  jieun.sock.emit('message:send', { roomId: jSide, text: '완료했어요!' });
  await waitFor('typed done', () => task(/케이크/).done);
  check(task(/케이크/).status === 'done' && task(/케이크/).completedBy === 'jieun', 'typed "완료했어요" in the side room marks it done');
  check(!!(await waitFor('family done line', () => cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'done'))), 'family room hears the task is done');
  // help → blocked + family escalation
  const meds = task(/복약/);
  t0 = Date.now() - 5;
  await executeTask('minjun', a0.id, meds.id);
  const rem2 = await waitFor('meds reminder', () => ctx.db.messages.byRoom(jSide, 50).find(m => m.kind === 'task_card' && Date.parse(m.createdAt) >= t0 && (m.payload as TaskCardPayload).taskId === meds.id));
  await act('jieun', rem2!, 'task_help');
  const help = cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).stage === 'escalate' && (m.payload as TaskCardPayload).taskId === meds.id);
  check(task(/복약/).status === 'blocked' && !!help && /도움이 필요/.test(help.text) && !!help.actions?.some(a => a.id === 'task_take'), '도움 필요 → blocked + family room asks who can take it');
  const take = await act('suyeon', help!, 'task_take');
  check(take.ok && task(/복약/).assigneeId === 'suyeon' && task(/복약/).status === 'todo' && (task(/복약/).followUpLevel ?? 0) === 0 && !!task(/복약/).nextFollowUpAt, '제가 맡을게요 reassigns and restarts the follow-up ladder');

  console.log('follow-up escalation on the demo clock');
  const ktxId = task(/KTX/).id;
  const step = async (label: string, minutes: number) => { patchDemo({ clockOffsetMinutes: minutes }); return runFollowUps(now()); };
  // reset the KTX task's ladder from 'now' so the timing is deterministic
  { const a = art(); const t = a.tasks.find(x => x.id === ktxId)!; t.followUpLevel = 0; t.followUps = []; t.dueAt = new Date(now().getTime() + 5 * 86400000).toISOString(); t.nextFollowUpAt = firstFollowUpAt(t); ctx.db.artifacts.put(a); }
  const base = Date.parse(task(/KTX/).nextFollowUpAt!) - now().getTime(); // ms until the first reminder
  const baseMin = Math.ceil(base / 60000);
  check(baseMin === TASK_FOLLOWUP.firstAfterMin, `first reminder is due in ${baseMin} min`);
  const mSide = () => ctx.db.rooms.all().find(r => r.type === 'side' && r.memberIds.includes('minjun') && r.memberIds.length === 2)?.id;
  const ktxCards = (roomId: string | undefined, stage: string) => (roomId ? ctx.db.messages.byRoom(roomId, 200) : []).filter(m => m.kind === 'task_card' && (m.payload as TaskCardPayload).taskId === ktxId && (m.payload as TaskCardPayload).stage === stage);
  // other open tasks (assigned to suyeon) also come due; count only the KTX ladder
  const lvl = () => task(/KTX/).followUpLevel ?? 0;
  await step('early', baseMin - 5);
  check(lvl() === 0 && ktxCards(mSide(), 'reminder').length === 0, 'nothing before the first follow-up time');
  await step('reminder', baseMin + 1);
  check(lvl() === 1 && ktxCards(mSide(), 'reminder').length === 1, 'level 1: reminder DM to minjun');
  await step('too early for nudge', baseMin + TASK_FOLLOWUP.repeatAfterMin - 10);
  check(lvl() === 1, 'no second nudge before repeatAfterMin');
  await step('nudge', baseMin + TASK_FOLLOWUP.repeatAfterMin + 2);
  check(lvl() === 2 && ktxCards(mSide(), 'nudge').length === 1 && /한 번 더/.test(ktxCards(mSide(), 'nudge')[0].text), 'level 2: second nudge');
  await step('escalate', baseMin + TASK_FOLLOWUP.repeatAfterMin + TASK_FOLLOWUP.escalateAfterMin + 4);
  const esc = ktxCards(FAMILY_ROOM_ID, 'escalate');
  check(lvl() === 3 && esc.length === 1 && /아직 남아/.test(esc[0].text) && !!esc[0].actions?.some(a => a.id === 'task_take'), 'level 3: family room told it is still open, offers reassignment');
  const hist = task(/KTX/).followUps ?? [];
  check(['reminder', 'nudge', 'escalate'].every(k => hist.some(f => f.kind === k && f.by === 'auto')), 'follow-up history recorded (reminder, nudge, escalate)');
  await step('after escalation', baseMin + 2000);
  check(ktxCards(FAMILY_ROOM_ID, 'escalate').length === 1 && !task(/KTX/).nextFollowUpAt, 'stops after escalating (no more automatic follow-ups)');
  // done stops everything: mark via the escalation card
  await act('jieun', esc[0], 'task_done');
  check(task(/KTX/).done, '이미 끝났어요 on the family card marks it done');

  console.log('report mentions open tasks');
  ctx.db.kv.del('report-fired-on');
  const open = openTasksForReport(FAMILY_ROOM_ID);
  check(open.length > 0 && open.every(t => !art().tasks.find(x => x.id === t.taskId)?.done), `openTasksForReport lists ${open.length} open task(s)`);
  t0 = Date.now() - 5;
  await postReport(false);
  const rep = ctx.db.messages.byRoom(FAMILY_ROOM_ID, 50).filter(m => m.kind === 'report').at(-1);
  const rp = rep?.payload?.type === 'report' ? rep.payload : undefined;
  check(!!rp?.openTasks?.length && /^남은 할 일 \d+개/.test(rp.tasksLine ?? ''), `report payload has open tasks (${rp?.tasksLine})`);
  check(!rp?.openTasks?.some(t => /KTX|케이크/.test(t.text)), 'done tasks are not in the report');

  console.log('socket: toggle keeps status in sync, execute via socket');
  const left = art().tasks.find(t => !t.done)!;
  jieun.sock.emit('artifact:task', { artifactId: a0.id, op: 'toggle', taskId: left.id });
  await waitFor('toggle', () => art().tasks.find(t => t.id === left.id)?.done);
  check(art().tasks.find(t => t.id === left.id)?.status === 'done', 'checkbox toggle → status done');
  jieun.sock.emit('artifact:task:status', { artifactId: a0.id, taskId: left.id, status: 'blocked' });
  await waitFor('status', () => art().tasks.find(t => t.id === left.id)?.status === 'blocked');
  const lt = art().tasks.find(t => t.id === left.id)!;
  check(lt.status === 'blocked' && !lt.done, 'artifact:task:status blocked reopens the task');
  jieun.sock.emit('artifact:task', { artifactId: a0.id, op: 'add', text: '보문호수 근처 한정식 식당 예약', assigneeId: 'suyeon' });
  const added = await waitFor('added', () => art().tasks.find(t => /한정식/.test(t.text)));
  check(added?.action?.kind === 'booking_link' && added.action.category === 'restaurant' && added.assigneeId === 'suyeon', 'added task is classified on the fly');
  const ack = await new Promise<{ ok: boolean }>(r => jieun.sock.emit('artifact:task:execute', { artifactId: a0.id, taskId: added!.id }, x => r(x)));
  const food = cards(FAMILY_ROOM_ID, t0).find(m => (m.payload as TaskCardPayload).taskId === added!.id);
  check(ack.ok && !!food && (food.payload as TaskCardPayload).links!.some(l => l.url.includes(encodeURIComponent('경주 보문호수 한정식'))), 'artifact:task:execute shares a restaurant link for 경주 보문호수');
  const outsider = await new Promise<{ ok: boolean }>(r => mom.sock.emit('artifact:task:execute', { artifactId: 'nope', taskId: 'x' }, x => r(x)));
  check(!outsider.ok, 'unknown artifact is refused');
  const forced = await new Promise<{ ok: boolean }>(r => jieun.sock.emit('artifact:task:execute', { artifactId: a0.id, taskId: added!.id, kind: 'reminder' }, x => r(x)));
  check(forced.ok && art().tasks.find(t => t.id === added!.id)?.action?.classifiedBy === 'user' && art().tasks.find(t => t.id === added!.id)?.action?.kind === 'reminder', 'kind override is remembered as the user choice');

  // normalization is idempotent
  const snap = JSON.stringify(art());
  check(JSON.stringify(normalizeTasks(JSON.parse(snap) as Artifact)) === snap, 'normalizeTasks is idempotent');
  void ({} as ArtifactTask);

  mom.sock.close(); jieun.sock.close();
  patchDemo({ clockOffsetMinutes: 0 });
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

async function main() {
  pureTests();
  await calendarStoreTests();
  await brainTests();
  await flowTests();
  console.log(failures ? `\nTASKS FAILED (${failures}, ${passes} passed)` : `\nTASKS OK (${passes} checks)`);
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
