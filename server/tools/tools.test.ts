// Tool registry: validation, privacy, and each tool against a temp SQLite db + in-memory graph.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { before, test } from 'node:test';
import { DEFAULT_PRIVACY, USERS } from '../../shared/constants';
import type { Memory, PrivacySettings } from '../../shared/types';
import { openDb, type Db } from '../db';
import { createGraphStore } from '../graph/index';
import type { GraphStore } from '../graph/contract';
import { LocalCalendar, seedCalendar } from './calendar';
import { TOOLS, executeTool, toLLMSpecs, toolsFor } from './index';
import { dueReminders, markDelivered } from './reminders';
import { estimateRoute, haversineKm, resolvePoint } from './places';
import { parseWhen } from './time';
import type { ToolContext, ToolNotice } from './types';
import { validate } from './validate';

process.env.TACHI_GRAPH_ENGINE = 'memory';
const NOW = new Date(2026, 10, 9, 14, 10); // Monday 14:10 local
let db: Db; let graph: GraphStore;
let privacy: PrivacySettings = { ...DEFAULT_PRIVACY };

const mem = (id: string, title: string, place: string, visibility: 'family' | 'private', extra: Partial<Memory> = {}): Memory => ({
  id, ownerId: 'mom', status: 'saved', title, story: `${title} 이야기`, summary: `${title} 요약`, year: 1988, place, people: [{ name: '박영수', relation: '남편' }],
  emotions: ['그리움'], tags: [], visibility, createdAt: NOW.toISOString(), ...extra,
});

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-tools-'));
  db = openDb(dir);
  graph = createGraphStore({ dataDir: dir });
  await graph.init();
  for (const m of [mem('m-pub', '1988년 여름, 해운대 가족 피서', '부산 해운대', 'family'), mem('m-priv', '1976년 가을, 명동성당 결혼식', '서울 명동성당', 'private', { event: '결혼식' })]) {
    db.memories.put(m); await graph.upsertMemory(m);
  }
  seedCalendar(db, NOW);
});

function tctx(audience: 'senior' | 'family', callerId = audience === 'senior' ? 'mom' : 'jieun', notices: ToolNotice[] = []): ToolContext {
  return {
    audience, callerId, seniorId: 'mom', now: () => NOW, db, graph, calendar: new LocalCalendar(db), privacy: () => privacy,
    memoryVisibleToFamily: id => { const m = db.memories.get(id); return !!m && m.status === 'saved' && m.visibility === 'family' && privacy.memory === 'family'; },
    users: () => USERS, notify: n => notices.push(n),
  };
}

test('validate: types, required, enum, bounds, unknown props, defaults, coercion', () => {
  const schema = { type: 'object' as const, additionalProperties: false, required: ['a'], properties: {
    a: { type: 'string' as const, minLength: 2, maxLength: 5 }, n: { type: 'integer' as const, minimum: 1, maximum: 3, default: 2 },
    e: { type: 'string' as const, enum: ['x', 'y'] }, arr: { type: 'array' as const, items: { type: 'string' as const }, maxItems: 2 },
  } };
  assert.deepEqual(validate(schema, { a: ' ab ' }), { ok: true, value: { a: 'ab', n: 2 } });
  assert.deepEqual(validate(schema, { a: 'abc', n: '3' }), { ok: true, value: { a: 'abc', n: 3 } });
  const bad = validate(schema, { n: 1.5, e: 'z', arr: ['a', 'b', 'c'], zzz: 1 });
  assert.equal(bad.ok, false);
  const errs = bad.ok ? [] : bad.errors.join(' | ');
  for (const frag of ['.a: required', 'expected integer', 'must be one of', 'at most 2 items', 'unknown property']) assert.match(String(errs), new RegExp(frag.replace('.', '\\.')));
  assert.equal(validate(schema, 'nope').ok, false);
});

test('registry: specs, audiences, unknown tool, invalid input never throws', async () => {
  assert.equal(new Set(TOOLS.map(t => t.name)).size, TOOLS.length);
  for (const t of TOOLS) { assert.ok(/[가-힣]/.test(t.description) && /[a-z]{4}/i.test(t.description), `${t.name} has ko+en description`); assert.ok(t.label); }
  const specs = toLLMSpecs(toolsFor('family'));
  assert.ok(specs.every(s => s.inputSchema.type === 'object'));
  const r1 = await executeTool('nope', {}, tctx('senior'));
  assert.equal(r1.ok, false); assert.equal(r1.error?.code, 'unknown_tool');
  const r2 = await executeTool('transit_route', { to: 5 }, tctx('senior'));
  assert.equal(r2.error?.code, 'invalid_input');
  assert.match(r2.content, /invalid_input/);
  const r3 = await executeTool('transit_route', { to: '불국사' }, tctx('senior'), { allowed: toolsFor('senior', ['graph_search']) });
  assert.equal(r3.error?.code, 'unknown_tool', 'tools outside the allowed set are refused');
});

test('graph_search: senior sees all, family only public memories; memory category private → forbidden', async () => {
  const s = await executeTool('graph_search', { keywords: ['결혼식'] }, tctx('senior'));
  assert.ok(s.ok); assert.equal((s.output!.data as { results: { memoryId: string }[] }).results[0]?.memoryId, 'm-priv');
  const f = await executeTool('graph_search', { keywords: ['결혼식', '명동성당', '박영수'] }, tctx('family'));
  assert.ok(f.ok);
  const ids = (f.output!.data as { results: { memoryId: string; story?: string }[] }).results.map(r => r.memoryId);
  assert.ok(!ids.includes('m-priv'), 'private memory never reaches a family-facing call');
  assert.ok(!f.content.includes('명동성당 결혼식'));
  const h = await executeTool('graph_search', { keywords: ['해운대'] }, tctx('family'));
  assert.deepEqual(h.output!.provenance, { memoryIds: ['m-pub'], categories: ['memory'] });
  assert.ok(!('story' in (h.output!.data as { results: Record<string, unknown>[] }).results[0]), 'family results carry no full story');
  privacy = { ...privacy, memory: 'private' };
  try {
    const p = await executeTool('graph_search', { keywords: ['해운대'] }, tctx('family'));
    assert.equal(p.error?.code, 'forbidden');
  } finally { privacy = { ...DEFAULT_PRIVACY }; }
});

test('calendar_list: own events in full, others\' private events as busy, free slots', async () => {
  const mine = await executeTool('calendar_list', { range: '이번 주' }, tctx('senior'));
  const evs = (mine.output!.data as { events: { title: string }[] }).events.map(e => e.title);
  assert.ok(evs.includes('마포 연세내과 정기 검진') && evs.includes('정숙이와 망원시장 점심'));
  const fam = await executeTool('calendar_list', { userIds: ['mom'], range: '이번 주' }, tctx('family'));
  assert.ok(!fam.content.includes('정숙') && !fam.content.includes('망원시장'), 'private event content hidden from family');
  assert.match(fam.content, /바쁨/);
  const tomorrow = await executeTool('calendar_list', { range: '내일', userIds: ['mom', 'jieun'], freeSlotMinutes: 60 }, tctx('family'));
  const d = tomorrow.output!.data as { events: { title: string }[]; freeSlots: { startsAt: string }[] };
  assert.deepEqual(d.events.map(e => e.title), ['마포 연세내과 정기 검진', '팀 회식']);
  assert.ok(d.freeSlots.length > 0 && d.freeSlots.every(s => { const h = new Date(s.startsAt).getHours(); return h >= 10 && h < 20; }));
  assert.equal((await executeTool('calendar_list', { userIds: ['ghost'] }, tctx('family'))).error?.code, 'not_found');
});

test('calendar_invite: creates an event + notice; refuses past; reports conflicts', async () => {
  const notices: ToolNotice[] = [];
  const ok = await executeTool('calendar_invite', { title: '가족 점심', startsAt: '2026-11-15T12:00', attendeeIds: ['mom', 'minjun'], location: '마포' }, tctx('family', 'jieun', notices));
  assert.ok(ok.ok, ok.content);
  assert.equal((ok.output!.data as { created: boolean }).created, true);
  assert.equal(notices.length, 1); assert.equal(notices[0].kind, 'calendar_invite');
  const ev = db.calendar.all().find(e => e.title === '가족 점심')!;
  assert.deepEqual([ev.ownerId, ...ev.attendeeIds], ['jieun', 'mom', 'minjun']);
  const past = await executeTool('calendar_invite', { title: '지난 모임', startsAt: '2026-11-01T12:00', attendeeIds: ['mom'] }, tctx('family'));
  assert.equal(past.error?.code, 'invalid');
  const clash = await executeTool('calendar_invite', { title: '겹치는 약속', startsAt: '2026-11-10T10:30', attendeeIds: ['mom'], durationMinutes: 30 }, tctx('family', 'minjun', notices));
  assert.equal((clash.output!.data as { created: boolean; conflicts: unknown[] }).created, false);
  assert.equal(notices.length, 1, 'no notice for a refused invite');
});

test('transit_route / map_search: deterministic senior-friendly estimates from the gazetteer', async () => {
  assert.ok(Math.abs(haversineKm({ lat: 37.5665, lng: 126.978 }, { lat: 35.1796, lng: 129.0756 }) - 325) < 5, 'Seoul–Busan ≈ 325km');
  const r = await executeTool('transit_route', { to: '불국사' }, tctx('senior'));
  const d = r.output!.data as { mode: string; minutes: number; seniorNotes: string[]; typical?: string };
  assert.equal(d.mode, 'ktx'); assert.ok(d.minutes > 120 && d.minutes < 240); assert.ok(d.seniorNotes.length >= 2); assert.match(d.typical ?? '', /KTX/);
  const again = await executeTool('transit_route', { to: '불국사' }, tctx('senior'));
  assert.equal(again.content, r.content, 'deterministic');
  const near = estimateRoute(resolvePoint('불국사')!, resolvePoint('석굴암')!);
  assert.ok(['subway', 'walk'].includes(near.mode) && near.minutes < 60);
  assert.equal((await executeTool('transit_route', { to: '화성' }, tctx('senior'))).error?.code, 'not_found');
  const m = await executeTool('map_search', { near: '불국사', limit: 3 }, tctx('family'));
  const places = (m.output!.data as { places: { name: string; distanceKm: number }[] }).places;
  assert.ok(places.length >= 2 && places[0].distanceKm <= places[places.length - 1].distanceKm);
  assert.ok(places.some(p => p.name === '석굴암'));
  assert.equal((await executeTool('map_search', {}, tctx('family'))).error?.code, 'invalid');
});

test('reminders: create (senior + family), privacy-aware list, due + delivery (daily reschedules)', async () => {
  const notices: ToolNotice[] = [];
  const a = await executeTool('reminder_create', { text: '혈압약 드시기', at: '내일 아침 8시', repeat: 'daily' }, tctx('senior', 'mom', notices));
  assert.ok(a.ok, a.content);
  const b = await executeTool('reminder_create', { text: '화분에 물 주기', at: '오후 4시' }, tctx('senior'));
  assert.ok(b.ok);
  const dup = await executeTool('reminder_create', { text: '화분에 물 주기', at: '오후 4시' }, tctx('senior'));
  assert.equal((dup.output!.data as { duplicate: boolean }).duplicate, true);
  assert.equal((await executeTool('reminder_create', { text: '전화', at: '오후 4시', forUserId: 'jieun' }, tctx('family'))).error?.code, 'forbidden');
  assert.equal((await executeTool('reminder_create', { text: '전화', at: '어제쯤' }, tctx('family'))).error?.code, 'invalid');
  const c = await executeTool('reminder_create', { text: '사진 앨범 정리하기', at: '내일 3시' }, tctx('family', 'jieun', notices));
  assert.ok(c.ok);
  assert.equal(notices.length, 2);
  // family: own reminder + public (health) ones; mom's own 'daily' reminder stays hidden (daily is private by default)
  const fl = await executeTool('reminder_list', {}, tctx('family', 'minjun'));
  const texts = (fl.output!.data as { reminders: { text: string }[]; hiddenCount: number }).reminders.map(r => r.text);
  assert.ok(texts.includes('혈압약 드시기') && !texts.includes('화분에 물 주기') && !texts.includes('사진 앨범 정리하기'));
  assert.ok((fl.output!.data as { hiddenCount: number }).hiddenCount >= 2);
  const jl = await executeTool('reminder_list', {}, tctx('family', 'jieun'));
  assert.ok((jl.output!.data as { reminders: { text: string }[] }).reminders.some(r => r.text === '사진 앨범 정리하기'));
  // delivery
  const at17 = new Date(2026, 10, 9, 17, 0);
  const due = dueReminders(db, at17);
  assert.deepEqual(due.map(r => r.text), ['화분에 물 주기']);
  markDelivered(db, due[0], at17);
  assert.equal(dueReminders(db, at17).length, 0);
  const tomorrow9 = new Date(2026, 10, 10, 9, 0);
  const daily = dueReminders(db, tomorrow9).find(r => r.repeat === 'daily')!;
  const next = markDelivered(db, daily, tomorrow9);
  assert.equal(next.status, 'scheduled');
  assert.equal(new Date(next.dueAt).getDate(), 11, 'daily reminder moves to the next day');
});

test('time parsing: Korean + ISO', () => {
  const at = (s: string) => parseWhen(s, NOW);
  assert.equal(at('내일 아침 8시')!.getTime(), new Date(2026, 10, 10, 8, 0).getTime());
  assert.equal(at('오후 3시 반')!.getTime(), new Date(2026, 10, 9, 15, 30).getTime());
  assert.equal(at('3시')!.getTime(), new Date(2026, 10, 9, 15, 0).getTime(), 'bare hour later today = pm');
  assert.equal(at('2시')!.getTime(), new Date(2026, 10, 10, 14, 0).getTime(), 'bare passed hour = tomorrow afternoon');
  assert.equal(at('30분 뒤')!.getTime(), NOW.getTime() + 30 * 60000);
  assert.equal(at('두 시간 후')!.getTime(), NOW.getTime() + 2 * 3600000);
  assert.equal(at('2026-11-15T12:00')!.getTime(), new Date(2026, 10, 15, 12, 0).getTime());
  assert.equal(at('금요일 10시')!.getTime(), new Date(2026, 10, 13, 10, 0).getTime());
  assert.equal(at('맛있는 거'), undefined);
});
