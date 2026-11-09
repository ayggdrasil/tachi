import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT_SLOT_PREFS, DEMO_SCRIPT, USERS, buildCandidateSlots } from '../../shared/constants';
import type { HealthSummary, Memory, PrivacySettings, SessionLog } from '../../shared/types';
import { createBrain } from './index';
import { questionCategory } from './heuristics/family';
import type { FamilyContext, InterviewState } from './contract';

process.env.TACHI_DEFAULT_MODEL = 'demo';
const brain = createBrain();
brain.setActiveModel('demo');
const mom = USERS.find(u => u.id === 'mom')!;
const user = (id: string) => USERS.find(u => u.id === id)!;
const step = (id: string) => DEMO_SCRIPT.find(s => s.id === id)!.text!;

async function runInterview() {
  const start = await brain.startInterview({ memoryId: 'm1', photoUrl: '/x.jpg', senior: mom });
  assert.equal(start.model, '데모 브레인');
  assert.equal(start.fallback, false);
  assert.match(start.value.reply, /언제쯤 찍으신 거예요/);
  assert.deepEqual(start.value.quickReplies, ['70년대쯤', '80년대쯤', '잘 기억이 안 나요']);
  let st: InterviewState = start.value.state;

  const t1 = await brain.interviewTurn(st, step('a-when'), mom);
  assert.equal(t1.value.done, false);
  assert.ok(t1.value.state.filled.when && t1.value.state.filled.where);
  assert.match(t1.value.reply, /1984년 봄, 경주 불국사였군요/);
  assert.match(t1.value.reply, /누구와/);
  assert.deepEqual(t1.value.state.asked, ['when', 'who']);
  st = t1.value.state;

  const t2 = await brain.interviewTurn(st, step('a-who'), mom);
  assert.equal(t2.value.done, false);
  assert.match(t2.value.reply, /기억나는 일/);
  assert.deepEqual(t2.value.state.asked, ['when', 'who', 'story']);
  st = t2.value.state;

  const t3 = await brain.interviewTurn(st, step('a-story'), mom);
  assert.equal(t3.value.done, true);
  assert.equal(t3.value.reply, '정말 소중한 이야기예요. 추억으로 잘 담아 둘게요.');
  return t3.value.state;
}

test('demo interview + extraction', async () => {
  const st = await runInterview();
  const ex = (await brain.extractMemory(st, mom)).value;
  assert.equal(ex.title, '1984년 봄, 경주 불국사 가족여행');
  assert.equal(ex.year, 1984);
  assert.equal(ex.era, '1980년대');
  assert.equal(ex.season, '봄');
  assert.equal(ex.place, '경주 불국사');
  assert.equal(ex.placeId, 'gyeongju-bulguksa');
  assert.deepEqual(ex.people, [{ name: '박영수', relation: '남편' }, { name: '김지은', relation: '딸' }, { name: '박민준', relation: '아들' }]);
  assert.equal(ex.event, '가족여행');
  assert.ok(ex.emotions.includes('즐거움') && ex.emotions.includes('그리움'));
  assert.ok(ex.tags.includes('다보탑') && ex.tags.includes('벚꽃'));
  assert.match(ex.story, /1984년 봄이었어요/);
  assert.match(ex.story, /웃었어요/);
  assert.ok(ex.summary.length > 10);
});

const memory: Memory = {
  id: 'm1', ownerId: 'mom', title: '1984년 봄, 경주 불국사 가족여행', story: '1984년 봄이었어요. 다보탑 앞에서 사진 찍는데 민준이가 자꾸 도망가서 한참 웃었어요.',
  summary: '가족과 경주 불국사에 다녀온 이야기예요.', year: 1984, era: '1980년대', season: '봄', place: '경주 불국사', placeId: 'gyeongju-bulguksa',
  people: [{ name: '박영수', relation: '남편' }, { name: '김지은', relation: '딸' }, { name: '박민준', relation: '아들' }],
  event: '가족여행', emotions: ['즐거움', '그리움'], tags: ['다보탑', '벚꽃'], visibility: 'family', status: 'saved', createdAt: new Date().toISOString(),
};

test('senior intents for every DEMO_SCRIPT line', async () => {
  const names = ['경주 불국사', '박영수', '김지은', '박민준', '1984년', '가족여행', '다보탑', '벚꽃', '그리움'];
  const cls = async (text: string, pending: 'share_confirm' | 'trip_confirm' | null = null) =>
    (await brain.classifySeniorIntent(text, { knownNodeNames: names, pending })).value;
  assert.deepEqual(await cls(step('share'), 'share_confirm'), { type: 'yes' });
  assert.deepEqual(await cls(step('share')), { type: 'ask_share' });
  assert.deepEqual(await cls(step('recall')), { type: 'recall', keywords: ['불국사'] });
  assert.deepEqual(await cls(step('trip'), 'trip_confirm'), { type: 'yes' });
  assert.equal((await cls(step('trip'))).type, 'trip');
  assert.equal((await cls('아니 나중에 할래', 'share_confirm')).type, 'no');
  const bp = await cls('오늘 혈압 132에 84였어');
  assert.deepEqual(bp, { type: 'health_log', systolic: 132, diastolic: 84, note: '오늘 혈압 132에 84였어' });
  assert.equal((await cls('다보탑 사진 보여줘')).type, 'recall');
  assert.equal((await cls('오늘 날씨가 좋네')).type, 'smalltalk');
  assert.equal((await cls('우리 여행 갈까')).type, 'trip');
});

test('family intents', async () => {
  const fi = async (t: string) => (await brain.classifyFamilyIntent(t, user('jieun'))).value.type;
  assert.equal(await fi(step('health')), 'ask_tachi');
  assert.equal(await fi(step('gathering')), 'gathering');
  assert.equal(await fi(step('schedule')), 'schedule');
  assert.equal(await fi('타치, 모임 시간 좀 잡아줘'), 'schedule');
  assert.equal(await fi('오늘 저녁 뭐 먹지'), 'none');
  assert.equal(await fi('엄마 요즘 잘 주무셔?'), 'ask_tachi');
});

test('recall, share, trip, itinerary', async () => {
  const r = (await brain.recallReply(memory, '불국사', mom)).value;
  assert.match(r, /1984년 경주 불국사/);
  const s = (await brain.shareSummary(memory, mom)).value;
  assert.match(s.summary, /^어머님께서 오늘 1984년 봄, 경주 불국사 가족여행 이야기를 들려주셨어요\./);
  const t = (await brain.suggestTrip(memory, mom)).value;
  assert.equal(t.destination, '경주');
  assert.match(t.reason, /KTX로 2시간/);
  assert.match(t.reason, /다보탑/);
  assert.ok(t.highlights.length >= 3);
  const it = (await brain.planItinerary({ tripId: 't1', ...t }, mom)).value;
  assert.equal(it.days.length, 2);
  for (const d of it.days) assert.ok(d.stops.length >= 4 && d.stops.length <= 5);
  assert.ok(it.tips.some(x => x.includes('복용 시간표')));
  assert.ok(!JSON.stringify(it).includes('아침 식후'));
  const b = (await brain.planItinerary({ tripId: 't2', ...t, destination: '속초' }, mom)).value;
  assert.equal(b.days.length, 2);
});

test('proactive messages', async () => {
  const hae: Memory = { ...memory, id: 'm0', title: '1988년 해운대', year: 1988, place: '해운대' };
  const m = (await brain.proactiveMessage({ kind: 'morning', memory: hae, senior: mom, now: new Date() })).value;
  assert.match(m.text, /어머님, 좋은 아침이에요\. 어젯밤은 잘 주무셨어요\? 문득 1988년 해운대 사진이 생각났어요/);
  assert.match((await brain.proactiveMessage({ kind: 'evening', senior: mom, now: new Date() })).value.text, /저녁 약/);
  assert.match((await brain.proactiveMessage({ kind: 'ask_photo', senior: mom, now: new Date() })).value.text, /사진/);
});

test('report privacy masking', async () => {
  const privacy: PrivacySettings = { health: 'family', memory: 'family', daily: 'private', mood: 'family', trip: 'family' };
  const d = new Date(); d.setHours(9, 2, 0, 0);
  const d2 = new Date(); d2.setHours(14, 10, 0, 0);
  const sessions: SessionLog[] = [
    { id: 's1', startedAt: d.toISOString(), kind: 'proactive', title: '아침 안부', category: 'daily', summary: '잘 주무셨대요', reported: false },
    { id: 's2', startedAt: d2.toISOString(), kind: 'senior', title: '옛 사진 이야기', category: 'memory', summary: '경주 불국사 사진 이야기를 나눴어요', reported: false },
  ];
  const rep = (await brain.composeReport({ sessions, privacy, moodToday: '좋음', senior: mom, now: new Date() })).value;
  assert.equal(rep.sessions[0].time, '09:02');
  assert.equal(rep.sessions[0].isPrivate, true);
  assert.equal(rep.sessions[0].summary, '비공개 대화예요');
  assert.ok(!JSON.stringify(rep).includes('잘 주무셨대요'));
  assert.equal(rep.sessions[1].isPrivate, false);
  assert.equal(rep.moodLabel, '좋음');
  assert.match(rep.highlight!, /09:02, 14:10/);
});

const health: HealthSummary = {
  updatedAt: new Date().toISOString(),
  bloodPressure: [128, 132, 126, 135, 130, 128, 132].map((s, i) => ({ date: `2026-11-0${i + 2}`, systolic: s, diastolic: 80 + (i % 3) })),
  medications: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, name: '혈압약', time: '아침' as const, taken: i !== 3 })),
  sleepHours: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, hours: 6.5 })),
  steps: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, count: 3000 + i * 100 })),
  mood: [{ date: '2026-11-08', label: '좋음' }], notes: [],
};
const baseCtx = (over: Partial<FamilyContext> = {}): FamilyContext => ({
  senior: mom, asker: user('jieun'),
  privacy: { health: 'family', memory: 'family', daily: 'private', mood: 'family', trip: 'family' }, privateCategories: ['daily'],
  health, moodToday: '좋음', memories: [{ id: 'm1', title: memory.title, summary: memory.summary, year: 1984, place: memory.place, people: memory.people, emotions: memory.emotions }],
  recentSessions: [], trips: [], ...over,
});

test('family Q&A: health numbers, privacy refusal', async () => {
  const a = (await brain.answerFamily(step('health'), baseCtx())).value;
  assert.equal(a.showHealthCard, true);
  assert.match(a.text, /어머님께서는 최근 7일 평균 혈압이 130\/81/);
  assert.match(a.text, /7일 중 6일/);
  assert.match(a.text, /11월 5일/);
  const priv = (await brain.answerFamily(step('health'), baseCtx({ health: undefined, privateCategories: ['health', 'daily'] }))).value;
  assert.equal(priv.showHealthCard, false);
  assert.match(priv.text, /비공개로 해 두셨어요/);
  assert.ok(!/\d{3}\/\d{2}/.test(priv.text));
  const gr = (await brain.answerFamily('할머니 요즘 혈압 어때요?', baseCtx({ asker: user('harin') }))).value;
  assert.match(gr.text, /할머님/);
});

test('gathering draft + assist + availability + bots', async () => {
  const members = ['jieun', 'minjun', 'suyeon', 'mom'].map(user);
  const d = (await brain.draftGathering({ proposalText: step('gathering'), proposer: user('minjun'), members, senior: mom, linkedMemory: memory })).value;
  assert.equal(d.title, '어머니 생신 · 경주 가족 여행');
  assert.equal(d.tasks.find(t => t.text.includes('KTX'))?.assigneeId, 'minjun');
  assert.equal(d.tasks.find(t => t.text.includes('숙소'))?.assigneeId, 'suyeon');
  assert.equal(d.tasks.find(t => t.text.includes('케이크'))?.assigneeId, 'jieun'); // harin not a member
  assert.equal(d.tasks.find(t => t.text.includes('복약'))?.assigneeId, 'jieun');
  assert.match(d.background, /불국사/);
  const art = { id: 'a', roomId: 'r', kind: 'gathering' as const, ...d, dateStatus: 'undecided' as const, tasks: d.tasks.map((t, i) => ({ ...t, id: `t${i}`, done: false })), createdBy: 'minjun', updatedBy: 'minjun', updatedAt: '', createdAt: '' };
  const as = (await brain.assistArtifact(art, members)).value;
  assert.ok(as.newTasks.length >= 2 && as.newTasks.length <= 3);

  const slots = buildCandidateSlots(new Date('2026-11-09T10:00:00'));
  const av = async (t: string) => (await brain.parseAvailability(t, slots)).value;
  assert.deepEqual(await av('토요일 점심은 안 돼요 나머지는 다 괜찮아요'), ['slot-1', 'slot-2', 'slot-3', 'slot-5']);
  assert.deepEqual(await av('일요일 점심이 좋아요'), ['slot-2', 'slot-5']);
  assert.deepEqual(await av('다 돼요'), slots.map(s => s.id));
  assert.deepEqual(await av('토/일 저녁만 돼요'), ['slot-1', 'slot-3']);
  assert.deepEqual(await av('22일 일요일 괜찮아요'), ['slot-5']);
  assert.deepEqual(await av('음 잘 모르겠어요'), []);

  const bot = async (id: string, kind: string, text: string) => (await brain.botReply({ persona: user(id), senior: mom, recent: [], trigger: { kind, text } })).value;
  assert.match(await bot('jieun', 'share_card', '1984년 봄 불국사'), /엄마|사진/);
  assert.equal(typeof await bot('harin', 'text', '안녕'), 'string');
  assert.match(await bot('minjun', 'artifact', '모임'), /제가/);
  assert.ok((await bot('harin', 'share_card', '사진')).length > 0);
  assert.ok(Object.keys(BOT_SLOT_PREFS).length === 5);
});

test('senior chat & switching models', async () => {
  const c = (await brain.seniorChat([], '어제 무릎이 좀 시렸어', mom)).value;
  assert.equal(c.category, 'health');
  assert.ok(c.reply.length > 0 && c.quickReplies.length > 0);
  // P0-3: unavailable options are rejected
  const prevKey = process.env.OPENAI_API_KEY; delete process.env.OPENAI_API_KEY;
  assert.equal(brain.setActiveModel('gpt-terra').active, 'demo');
  process.env.OPENAI_API_KEY = 'sk-test';
  const ms = brain.setActiveModel('gpt-terra');
  assert.equal(ms.active, 'gpt-terra');
  // key removed later → heuristic with fallback=true
  delete process.env.OPENAI_API_KEY;
  const res = await brain.seniorChat([], '안녕', mom);
  assert.equal(res.fallback, true);
  assert.equal(res.model, '데모 브레인');
  if (prevKey) process.env.OPENAI_API_KEY = prevKey;
  brain.setActiveModel('demo');
});

test('LLM failure falls back to heuristic', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  process.env.TACHI_ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  const b = createBrain();
  b.setActiveModel('claude-sonnet');
  const r = await b.recallReply(memory, '불국사', mom);
  assert.equal(r.fallback, true);
  assert.equal(r.model, '데모 브레인');
  assert.ok(r.value.length > 0);
  delete process.env.ANTHROPIC_API_KEY;
});

// ── review round 1: F7 / F21 / F22 / F1 ──────────────────────────────────
const names2 = ['경주 불국사', '박영수', '김지은', '박민준', '1984년', '가족여행', '다보탑', '벚꽃', '그리움'];
const cls2 = async (text: string, pending: 'share_confirm' | 'trip_confirm' | 'itinerary' | null = null) =>
  (await brain.classifySeniorIntent(text, { knownNodeNames: names2, pending })).value;

test('F7 consent parsing: yes / no / not-consent', async () => {
  for (const y of ['응', '어 그래', '그래', '좋아', '네', '예', '그럼', '보내줘', '공유해줘', '그렇게 해', '좋지', '알았어', '네요', '응, 애들한테 보내줘', '좋아, 다시 가보고 싶네'])
    assert.equal((await cls2(y, 'share_confirm')).type, 'yes', y);
  for (const n of ['아니', '싫어', '나중에', '됐어', '안 할래', '하지 마', '나만 간직할게요', '나만 볼래', '비밀로 해줘'])
    assert.equal((await cls2(n, 'share_confirm')).type, 'no', n);
  assert.equal((await cls2('어제 무릎이 아팠어', 'share_confirm')).type, 'smalltalk');
  assert.equal((await cls2('어디였더라', 'share_confirm')).type, 'smalltalk');
  assert.equal((await cls2('불국사 기억나?', 'share_confirm')).type, 'recall');
  assert.equal((await cls2('오늘 혈압 132에 84였어', 'trip_confirm')).type, 'health_log');
  assert.equal((await cls2('네 그런데 오늘 날씨가 정말 좋아서 산책을 다녀왔어요', 'share_confirm')).type, 'smalltalk');
});

test('F22 itinerary intents', async () => {
  for (const t of ['가족에게 보내기', '여행 계획 애들한테 보내줘', '가족한테 보내줘', '여행 계획을 가족에게 보내줘'])
    assert.equal((await cls2(t, 'itinerary')).type, 'share_trip', t);
  for (const t of ['가족과 함께 가기', '애들이랑 같이 가자', '다 같이 가자', '가족 모임으로 만들어줘'])
    assert.equal((await cls2(t, 'itinerary')).type, 'make_gathering', t);
  assert.equal((await cls2('가족한테 보내줘')).type, 'ask_share');
});

test('F21 source attribution', async () => {
  const r1 = await brain.classifySeniorIntent('불국사 보여줘', { knownNodeNames: names2, pending: null });
  assert.equal(r1.source, 'rule'); assert.equal(r1.model, '규칙 기반'); assert.equal(r1.fallback, false);
  assert.equal((await brain.recallReply(memory, '불국사', mom)).source, 'heuristic');
  assert.equal((await brain.classifyFamilyIntent('모임 하자', user('jieun'))).source, 'rule');
  const ctx = { privateCategories: ['health'] } as unknown as FamilyContext;
  const ans = await brain.answerFamily('엄마 혈압 어때?', ctx);
  assert.equal(ans.source, 'rule'); assert.equal(ans.model, '규칙 기반');
});

test('F1 circuit breaker and live source', async () => {
  const saved = { k: process.env.ANTHROPIC_API_KEY, u: process.env.TACHI_ANTHROPIC_BASE_URL, t: process.env.TACHI_LLM_TIMEOUT_MS };
  const { resetCircuit } = await import('./llm');
  resetCircuit();
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  process.env.TACHI_ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  process.env.TACHI_LLM_TIMEOUT_MS = '500';
  const b = createBrain();
  b.setActiveModel('claude-sonnet');
  const r1 = await b.recallReply(memory, '불국사', mom);
  const r2 = await b.recallReply(memory, '불국사', mom);
  for (const r of [r1, r2]) { assert.equal(r.fallback, true); assert.equal(r.source, 'heuristic'); }
  // breaker now open: no network attempt, immediate heuristic
  const t0 = Date.now();
  const r3 = await b.recallReply(memory, '불국사', mom);
  assert.equal(r3.fallback, true); assert.equal(r3.source, 'heuristic'); assert.equal(r3.model, '데모 브레인');
  assert.ok(Date.now() - t0 < 100);
  // a working provider reports llm
  resetCircuit();
  const http = await import('node:http');
  const srv = http.createServer((_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ content: [{ type: 'text', text: '{"reply":"그때 정말 좋으셨죠."}' }] })); });
  await new Promise<void>(ok => srv.listen(0, '127.0.0.1', ok));
  process.env.TACHI_ANTHROPIC_BASE_URL = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const b2 = createBrain(); b2.setActiveModel('claude-sonnet');
  const ok = await b2.recallReply(memory, '불국사', mom);
  assert.equal(ok.source, 'llm'); assert.equal(ok.fallback, false);
  srv.close();
  resetCircuit();
  for (const [k, v] of [['ANTHROPIC_API_KEY', saved.k], ['TACHI_ANTHROPIC_BASE_URL', saved.u], ['TACHI_LLM_TIMEOUT_MS', saved.t]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

// ── round-2 additions ──────────────────────────────────────────────────────
import { assessBloodPressure } from './heuristics/health';
import { resetCircuit } from './llm';

const memoryFx = (): Memory => ({
  id: 'm1', ownerId: 'mom', title: '1984년 봄, 경주 불국사 가족여행', story: '다보탑 앞에서 사진을 찍었어요.', summary: '가족과 불국사에 갔어요.',
  year: 1984, era: '1980년대', season: '봄', place: '경주 불국사', placeId: 'gyeongju-bulguksa', people: [], emotions: ['즐거움'], tags: [],
  visibility: 'family', status: 'saved', createdAt: '2026-11-09T01:00:00.000Z',
});

async function withFakeProvider<T>(reply: (body: { system: string }) => string | Error, fn: (b: ReturnType<typeof createBrain>) => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test';
  resetCircuit();
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    const r = reply(JSON.parse(init!.body!));
    if (r instanceof Error) return new Response(r.message, { status: 500 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: r }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const b = createBrain();
    b.setActiveModel('claude-sonnet');
    return await fn(b);
  } finally {
    globalThis.fetch = realFetch; resetCircuit();
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  }
}

test('F19: valid JSON missing fields is not credited to the live model', async () => {
  await withFakeProvider(() => '{"unrelated": true}', async b => {
    const r = await b.recallReply(memoryFx(), '불국사', mom);
    assert.equal(r.source, 'heuristic'); assert.equal(r.fallback, true);
    const s = await b.shareSummary(memoryFx(), mom);
    assert.equal(s.source, 'heuristic'); assert.equal(s.fallback, true);
  });
  await withFakeProvider(() => '{"reply":"좋아요"}', async b => {
    const r = await b.recallReply(memoryFx(), '불국사', mom);
    assert.equal(r.source, 'llm'); assert.equal(r.fallback, false); assert.equal(r.value, '좋아요');
    // interview reply without a question mark is invalid → heuristic provenance
    const st = (await brain.startInterview({ memoryId: 'm1', photoUrl: '/x.jpg', senior: mom })).value.state;
    const t = await b.interviewTurn(st, '80년대쯤이야', mom);
    assert.equal(t.source, 'heuristic'); assert.equal(t.fallback, true);
  });
});

test('F4: preflight records health, opens breaker on failure; mock is instant', async () => {
  const demo = await brain.preflight('demo');
  assert.deepEqual(demo, { key: 'demo', ok: true, latencyMs: 0 });
  await withFakeProvider(() => 'OK', async b => {
    const r = await b.preflight();
    assert.equal(r.ok, true);
    const o = b.getModelState().options.find(x => x.key === 'claude-sonnet')!;
    assert.equal(o.healthy, true); assert.ok(typeof o.latencyMs === 'number');
  });
  await withFakeProvider(() => new Error('down'), async b => {
    const r = await b.preflight();
    assert.equal(r.ok, false);
    assert.equal(b.getModelState().options.find(x => x.key === 'claude-sonnet')!.healthy, false);
    // breaker open → next call answers instantly from heuristics
    const a = await b.recallReply(memoryFx(), '불국사', mom);
    assert.equal(a.fallback, true); assert.equal(a.source, 'heuristic');
  });
});

test('F11: blood pressure severity', () => {
  const lv = (systolic: number, diastolic: number) => assessBloodPressure({ systolic, diastolic }).level;
  assert.equal(lv(200, 120), 'crisis');
  assert.equal(lv(120, 120), 'invalid');
  assert.equal(lv(300, 100), 'invalid');
  assert.equal(lv(170, 95), 'high');
  assert.equal(lv(145, 85), 'elevated');
  assert.equal(lv(85, 70), 'low');
  assert.equal(lv(127, 80), 'normal');
});

test('F11: family answer warns on a crisis latest reading despite a normal 7-day history', async () => {
  const h = baseCtx().health!;
  const bp = [...h.bloodPressure.slice(0, -1), { ...h.bloodPressure[h.bloodPressure.length - 1], systolic: 200, diastolic: 120 }];
  const a = (await brain.answerFamily(step('health'), baseCtx({ health: { ...h, bloodPressure: bp } }))).value.text;
  assert.match(a, /200\/120/);
  assert.match(a, /바로.*연락/);
  assert.doesNotMatch(a, /안정적/);
});

test('F11/F16: bot copy is never evaluative about health and does not say 확정 for candidates', async () => {
  for (const id of ['jieun', 'minjun', 'suyeon', 'harin']) {
    const p = user(id);
    for (const text of ['혈압 200/120', '건강 기록이에요 혈압']) {
      for (const kind of ['health_card', 'text']) {
        const r = await brain.botReply({ persona: p, senior: mom, recent: [], trigger: { kind, text } });
        assert.doesNotMatch(r.value, /건강하|안심|안정적|괜찮아서|다행/);
      }
    }
    for (const text of ['일정 후보: 토요일 오전', '후보 시간이에요']) {
      const r = await brain.botReply({ persona: p, senior: mom, recent: [], trigger: { kind: 'schedule_result', text } });
      assert.doesNotMatch(r.value, /확정/);
    }
  }
});

test('F18: polarity-aware observations', async () => {
  const obs = async (t: string) => (await brain.seniorChat([], t, mom)).value;
  assert.deepEqual((await obs('아침 혈압약 먹었어')).observation, { medication: { taken: true, name: '혈압약', time: '아침' } });
  assert.deepEqual((await obs('약 챙겨 먹었어')).observation, { medication: { taken: true } });
  assert.deepEqual((await obs('약을 안 먹었어')).observation, { medication: { taken: false } });
  assert.equal((await obs('저녁 약 깜빡했어')).observation?.medication?.taken, false);
  assert.equal((await obs('점심에 관절약 못 먹었어')).observation?.medication?.name, '관절약');
  assert.equal((await obs('기분 좋네')).observation?.mood, '좋음');
  assert.equal((await obs('그저 그래')).observation?.mood, '보통');
  assert.equal((await obs('오늘 좀 외로워')).observation?.mood, '조금 우울');
  assert.equal((await obs('날씨 좋다')).observation, undefined);
  for (const t of ['약 안 먹었어', '약 먹었어', '기분 좋네']) assert.doesNotMatch((await obs(t)).reply, /기록|저장/);
});

test('F18: LLM observation is validated', async () => {
  await withFakeProvider(() => '{"reply":"그러셨군요","quickReplies":["응"],"category":"health","observation":{"medication":{"taken":"yes"},"mood":"엄청남"}}', async b => {
    const r = await b.seniorChat([], '약 안 먹었어', mom);
    assert.equal(r.source, 'llm');
    assert.deepEqual(r.value.observation, { medication: { taken: false } }); // invalid LLM fields dropped, heuristic polarity kept
  });
});

// ── QA fixes ────────────────────────────────────────────────────────────────
test('P0-2: general wellbeing answers from public data; refusals use correct particles', async () => {
  const a = (await brain.answerFamily('엄마 요즘 어때?', baseCtx({ privateCategories: ['daily'] }))).value;
  assert.match(a.text, /\d{3}\/\d{2}|기분/);
  assert.ok(!a.text.includes('비공개'));
  const priv = (await brain.answerFamily(step('private'), baseCtx({ privateCategories: ['daily'] }))).value;
  assert.match(priv.text, /일상 대화는/);
  assert.match(priv.text, /직접 여쭤/);
  const h = (await brain.answerFamily(step('health'), baseCtx({ health: undefined, privateCategories: ['health'] }))).value;
  assert.match(h.text, /건강 정보는/);
  assert.equal(questionCategory('엄마 오늘 어때?'), undefined);
  assert.equal(questionCategory('엄마 안부 좀 알려줘'), undefined);
});

test('P1-4: gathering classifier needs noun + proposal and no question markers', async () => {
  const fi = async (t: string) => (await brain.classifyFamilyIntent(t, user('jieun'))).value.type;
  for (const t of ['엄마 생신 선물 뭐가 좋을까?', '타치, 지난번 모임 사진 어디 있어?', '다음 주에 엄마랑 병원 같이 가자', '타치, 모임 어때?'])
    assert.notEqual(await fi(t), 'gathering', t);
  assert.equal(await fi('타치, 지난번 모임 사진 어디 있어?'), 'ask_tachi');
  assert.equal(await fi(step('gathering')), 'gathering');
  assert.equal(await fi(step('private')), 'ask_tachi');
  assert.equal(await fi(step('model')), 'ask_tachi');
});

test('P1-5: gathering place follows the proposal, mismatching memory ignored', async () => {
  const members = ['jieun', 'minjun', 'suyeon', 'mom'].map(user);
  const d = (await brain.draftGathering({ proposalText: '이번 엄마 생신에 다 같이 부산 가자!', proposer: user('minjun'), members, senior: mom, linkedMemory: memory })).value;
  assert.match(d.place, /부산/);
  assert.match(d.title, /부산/);
  assert.ok(!d.background.includes(memory.title));
});

test('P1-6/P1-7: invite greeting and share summary audience', async () => {
  const gh = (await brain.botReply({ persona: user('harin'), senior: mom, recent: [], trigger: { kind: 'system', text: '하린님이 초대되었어요' } })).value;
  assert.equal(gh, '할머니~ 저도 왔어요! 사진 보니까 너무 좋다ㅎㅎ');
  const gen = (await brain.botReply({ persona: user('suyeon'), senior: mom, recent: [], trigger: { kind: 'system', text: '수연님이 초대되었어요' } })).value;
  assert.ok(gen.includes('초대해 줘서') && !gen.includes('알겠습니다'));
  const sh = (await brain.shareSummary({ ...memory, people: [{ name: '박영수', relation: '남편' }] }, mom)).value;
  assert.match(sh.summary, /아버님/);
  assert.ok(!sh.summary.includes('남편분'));
});

test('P2: known node + photo word prefers recall over trip', async () => {
  const r = (await brain.classifySeniorIntent('가족여행 사진 보여줘', { knownNodeNames: ['가족여행', '경주 불국사'], pending: null })).value;
  assert.equal(r.type, 'recall');
});

// ── round-3 additions ──────────────────────────────────────────────────────
test('R3-F10: out-of-range BP is routed to verification, not small talk', async () => {
  const cls = async (t: string) => (await brain.classifySeniorIntent(t, { knownNodeNames: [] })).value;
  const a = await cls('혈압 240에 130이야') as { type: string; systolic: number; diastolic: number };
  assert.equal(a.type, 'health_log');
  assert.equal(assessBloodPressure(a).level, 'crisis');
  const b = await cls('혈압 260에 160이야') as { type: string; systolic: number; diastolic: number };
  assert.equal(b.type, 'health_log');
  assert.equal(assessBloodPressure(b).level, 'invalid');
});

test('R3-F10: reassuring live answer cannot override a 200/120 warning', async () => {
  const h = baseCtx().health!;
  const bp = [...h.bloodPressure.slice(0, -1), { ...h.bloodPressure[h.bloodPressure.length - 1], systolic: 200, diastolic: 120 }];
  await withFakeProvider(() => '{"text":"요즘 아주 안정적이에요. 걱정 없으세요. 약도 잘 챙기고 계세요."}', async b => {
    const r = await b.answerFamily(step('health'), baseCtx({ health: { ...h, bloodPressure: bp } }));
    assert.equal(r.source, 'llm');
    assert.match(r.value.text, /^가장 최근 혈압 200\/120/);
    assert.doesNotMatch(r.value.text, /안정|괜찮|걱정 없/);
    assert.match(r.value.text, /약도 잘 챙기고/);
  });
});

test('R3-F11: observations merge field by field, deterministic statement wins', async () => {
  await withFakeProvider(() => '{"reply":"그러셨군요","quickReplies":["응"],"category":"health","observation":{"medication":{"taken":true,"name":"혈압약"}}}', async b => {
    const r = await b.seniorChat([], '약 안 먹었어', mom);
    assert.equal(r.value.observation?.medication?.taken, false);
    assert.equal(r.value.observation?.medication?.name, undefined);
  });
  await withFakeProvider(() => '{"reply":"그러셨군요","quickReplies":["응"],"category":"health","observation":{"mood":"좋음"}}', async b => {
    const r = await b.seniorChat([], '약 안 먹었어', mom);
    assert.deepEqual(r.value.observation, { medication: { taken: false }, mood: '좋음' });
  });
  await withFakeProvider(() => '{"reply":"그러셨군요","quickReplies":["응"],"category":"health","observation":{"medication":{"taken":true,"name":"혈압약"}}}', async b => {
    const r = await b.seniorChat([], '오늘 날씨 좋다', mom);
    assert.equal(r.value.observation, undefined); // unsupported medication fact is not persisted
  });
  await withFakeProvider(() => '{"reply":"좋네요","quickReplies":["응"],"category":"health","observation":{"medication":{"taken":true,"name":"혈압약","time":"아침"}}}', async b => {
    const r = await b.seniorChat([], '약 먹었어', mom);
    assert.deepEqual(r.value.observation, { medication: { taken: true, name: '혈압약', time: '아침' } });
  });
});

test('R3-F13: missed-dose copy is prescription-neutral', async () => {
  const r = (await brain.seniorChat([], '약 안 먹었어', mom)).value.reply;
  assert.match(r, /처방받은 시간표대로/);
  assert.doesNotMatch(r, /생각나셨을 때/);
});
