import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOT_SLOT_PREFS, DEMO_SCRIPT_EN, USERS_EN, buildCandidateSlots } from '../../shared/constants';
import type { HealthSummary, Memory, PrivacySettings, SessionLog } from '../../shared/types';
import { createBrain } from './index';
import { resetCircuit } from './llm';
import type { FamilyContext, InterviewState, SeniorAgentInput } from './contract';

process.env.TACHI_DEFAULT_MODEL = 'demo';
const brain = createBrain();
brain.setActiveModel('demo');
brain.setLocale('en');
const mom = USERS_EN.find(u => u.id === 'mom')!;
const user = (id: string) => USERS_EN.find(u => u.id === id)!;
const step = (id: string) => DEMO_SCRIPT_EN.find(s => s.id === id)!.text!;

test('default locale is English', () => {
  assert.equal(createBrain().getLocale(), process.env.TACHI_LOCALE === 'ko' ? 'ko' : 'en');
  assert.equal(brain.getLocale(), 'en');
});

async function runInterview() {
  const start = await brain.startInterview({ memoryId: 'm1', photoUrl: '/x.jpg', senior: mom });
  assert.equal(start.fallback, false);
  assert.match(start.value.reply, /About when was this photo taken\?/);
  let st: InterviewState = start.value.state;
  const t1 = await brain.interviewTurn(st, step('a-when'), mom);
  assert.equal(t1.value.done, false);
  assert.ok(t1.value.state.filled.when && t1.value.state.filled.where);
  assert.match(t1.value.reply, /Spring 1984 at Bulguksa Temple, Gyeongju/);
  assert.match(t1.value.reply, /Who was with you\?/);
  st = t1.value.state;
  const t2 = await brain.interviewTurn(st, step('a-who'), mom);
  assert.equal(t2.value.done, false);
  assert.match(t2.value.reply, /Youngsu, Jieun and Minjun/);
  assert.match(t2.value.reply, /remember most/);
  st = t2.value.state;
  const t3 = await brain.interviewTurn(st, step('a-story'), mom);
  assert.equal(t3.value.done, true);
  assert.match(t3.value.reply, /precious story/);
  return t3.value.state;
}

test('EN demo interview + extraction (full DEMO_SCRIPT_EN senior flow)', async () => {
  const ex = (await brain.extractMemory(await runInterview(), mom)).value;
  assert.equal(ex.title, 'Spring 1984, family trip to Bulguksa Temple in Gyeongju');
  assert.equal(ex.year, 1984);
  assert.equal(ex.era, '1980s');
  assert.equal(ex.season, 'spring');
  assert.equal(ex.place, 'Bulguksa Temple, Gyeongju');
  assert.equal(ex.placeId, 'gyeongju-bulguksa');
  assert.deepEqual(ex.people, [{ name: 'Youngsu Park', relation: 'husband' }, { name: 'Jieun Kim', relation: 'daughter' }, { name: 'Minjun Park', relation: 'son' }]);
  assert.equal(ex.event, 'family trip');
  assert.ok(ex.emotions.includes('joy') && ex.emotions.includes('nostalgia'));
  assert.ok(ex.tags.includes('Dabotap Pagoda') && ex.tags.includes('cherry blossoms'));
  assert.match(ex.story, /It was spring 1984/);
  assert.match(ex.story, /laughed so hard/);
});

test('EN year / season / event parsing', async () => {
  const ext = async (a: string) => {
    const s = (await brain.startInterview({ memoryId: 'x', photoUrl: '/x.jpg', senior: mom })).value.state;
    return (await brain.extractMemory({ ...s, answers: [{ slot: 'when', text: a }] }, mom)).value;
  };
  assert.equal((await ext("It was '84, in the fall, at Haeundae Beach in Busan for my graduation")).year, 1984);
  assert.equal((await ext("It was '84, in the fall, at Haeundae Beach in Busan for my graduation")).season, 'autumn');
  assert.equal((await ext("It was '84, in the fall, at Haeundae Beach in Busan for my graduation")).place, 'Haeundae Beach, Busan');
  assert.equal((await ext("It was '84, in the fall, at Haeundae Beach in Busan for my graduation")).event, 'graduation');
  const e80 = await ext('Sometime in the 80s, a school trip to Seokguram');
  assert.deepEqual([e80.year, e80.era, e80.event, e80.placeId], [undefined, '1980s', 'school trip', 'gyeongju-seokguram']);
  assert.equal((await ext('the eighties, a picnic near Sinchon in the summer')).era, '1980s');
  assert.equal((await ext('Our honeymoon in 1975, winter')).season, 'winter');
  assert.equal((await ext('Our honeymoon in 1975, winter')).event, 'honeymoon');
  assert.equal((await ext('We sat under the cherry blossoms')).season, 'spring');
  assert.equal((await ext('A birthday party at Myeongdong Cathedral')).placeId, 'seoul-myeongdong-cathedral');
});

const memory: Memory = {
  id: 'm1', ownerId: 'mom', title: 'Spring 1984, family trip to Bulguksa Temple in Gyeongju', story: 'It was spring 1984. Minjun kept running away while we took a photo in front of Dabotap Pagoda, and we laughed so hard.',
  summary: 'A family trip to Bulguksa Temple in Gyeongju.', year: 1984, era: '1980s', season: 'spring', place: 'Bulguksa Temple, Gyeongju', placeId: 'gyeongju-bulguksa',
  people: [{ name: 'Youngsu Park', relation: 'husband' }, { name: 'Jieun Kim', relation: 'daughter' }, { name: 'Minjun Park', relation: 'son' }],
  event: 'family trip', emotions: ['joy', 'nostalgia'], tags: ['Dabotap Pagoda', 'cherry blossoms'], visibility: 'family', status: 'saved', createdAt: new Date().toISOString(),
};
const names = ['Bulguksa Temple, Gyeongju', 'Youngsu Park', 'Jieun Kim', 'Minjun Park', '1984', 'family trip', 'Dabotap Pagoda', 'cherry blossoms', 'nostalgia'];
const cls = async (text: string, pending: 'share_confirm' | 'trip_confirm' | 'itinerary' | null = null) => (await brain.classifySeniorIntent(text, { knownNodeNames: names, pending })).value;

test('EN senior intents for every DEMO_SCRIPT_EN line', async () => {
  assert.deepEqual(await cls(step('share'), 'share_confirm'), { type: 'yes' });
  assert.deepEqual(await cls(step('share')), { type: 'ask_share' });
  assert.deepEqual(await cls(step('recall')), { type: 'recall', keywords: ['Bulguksa'] });
  assert.deepEqual(await cls(step('trip'), 'trip_confirm'), { type: 'yes' });
  assert.equal((await cls(step('trip'))).type, 'trip');
  assert.deepEqual(await cls(step('together'), 'itinerary'), { type: 'make_gathering' });
  assert.equal((await cls('Not now, keep it private', 'share_confirm')).type, 'no');
  assert.deepEqual(await cls('Blood pressure was 132 over 84 today'), { type: 'health_log', systolic: 132, diastolic: 84, note: 'Blood pressure was 132 over 84 today' });
  assert.equal(((await cls('my BP is 132/84')) as { systolic: number }).systolic, 132);
  assert.equal((await cls('Show me the Dabotap Pagoda photo')).type, 'recall');
  assert.equal((await cls('The weather is lovely today')).type, 'smalltalk');
  assert.equal((await cls('Shall we go on a trip?')).type, 'trip');
  assert.equal((await cls('family trip photos please')).type, 'recall');
});

test('EN consent and itinerary intents', async () => {
  for (const y of ['yes', 'Yeah', 'sure', 'okay', 'Send it', 'sounds good', 'of course', 'Yes, send it to the kids.', "Sounds good, I'd love to go back."]) assert.equal((await cls(y, 'share_confirm')).type, 'yes', y);
  for (const n of ['no', 'not now', 'Keep it private', 'just for me', "No, don't share it", 'maybe later', 'no thanks']) assert.equal((await cls(n, 'share_confirm')).type, 'no', n);
  assert.equal((await cls('My knee hurt yesterday', 'share_confirm')).type, 'smalltalk');
  assert.equal((await cls('Yes but the weather was so lovely today that I went for a long walk', 'share_confirm')).type, 'smalltalk');
  assert.equal((await cls('Do you remember Bulguksa?', 'share_confirm')).type, 'recall');
  for (const t of ['Send to family', 'Send the plan to the kids', 'share the itinerary with the family']) assert.equal((await cls(t, 'itinerary')).type, 'share_trip', t);
  for (const t of ['Go with family', "Let's all go together", 'make it a family gathering']) assert.equal((await cls(t, 'itinerary')).type, 'make_gathering', t);
  assert.equal((await cls('Send it to the family')).type, 'ask_share');
});

test('EN family intents', async () => {
  const fi = async (t: string) => (await brain.classifyFamilyIntent(t, user('jieun'))).value.type;
  assert.equal(await fi(step('health')), 'ask_tachi');
  assert.equal(await fi(step('private')), 'ask_tachi');
  assert.equal(await fi(step('model')), 'ask_tachi');
  assert.equal(await fi(step('gathering')), 'gathering');
  assert.equal(await fi(step('schedule')), 'schedule');
  assert.equal(await fi('Tachi, please schedule a time for everyone'), 'schedule');
  assert.equal(await fi('What should we get Mom for her birthday?'), 'ask_tachi');
  assert.equal(await fi('Where is the photo from the last gathering?'), 'none');
  assert.equal(await fi('What are we having for dinner tonight'), 'none');
  assert.equal(await fi('How is Mom sleeping lately?'), 'ask_tachi');
  const g = (await brain.classifyFamilyIntent("Let's all get together for Dad's memorial", user('minjun'))).value;
  assert.equal(g.type, 'gathering');
});

test('EN recall, share, trip, itinerary', async () => {
  const r = (await brain.recallReply(memory, 'Bulguksa', mom)).value;
  assert.match(r, /1984 Bulguksa Temple, Gyeongju/);
  assert.match(r, /Youngsu, Jieun and Minjun/);
  const s = (await brain.shareSummary({ ...memory, people: [{ name: 'Youngsu Park', relation: 'husband' }] }, mom)).value;
  assert.match(s.summary, /^Mom shared a story with us today: Spring 1984/);
  assert.match(s.summary, /Dad/);
  const t = (await brain.suggestTrip(memory, mom)).value;
  assert.equal(t.destination, 'Gyeongju');
  assert.match(t.reason, /2 hours by KTX/);
  assert.match(t.reason, /Dabotap Pagoda/);
  assert.ok(t.highlights.length >= 3);
  const it = (await brain.planItinerary({ tripId: 't1', ...t }, mom)).value;
  assert.equal(it.days.length, 2);
  for (const d of it.days) assert.ok(d.stops.length >= 4 && d.stops.length <= 6);
  assert.match(it.days[0].stops[0].title, /^Depart/);
  assert.match(it.days[0].stops[1].title, /^Arrive at/);
  assert.equal(it.days[0].stops[0].travel, 'KTX 2h 10m');
  assert.ok(it.tips.some(x => /usual schedule/.test(x)));
  assert.ok(!/[가-힣]/.test(JSON.stringify(it)));
  const b = (await brain.planItinerary({ tripId: 't2', ...t, destination: 'Sokcho' }, mom)).value;
  assert.equal(b.days.length, 2);
  assert.match(b.days[0].stops[0].title, /^Depart/);
});

test('EN proactive messages', async () => {
  const hae: Memory = { ...memory, id: 'm0', title: '1988 Haeundae', year: 1988, place: 'Haeundae Beach, Busan' };
  const m = (await brain.proactiveMessage({ kind: 'morning', memory: hae, senior: mom, now: new Date() })).value;
  assert.match(m.text, /^Good morning, Soonja\. I was just thinking about your 1988 Haeundae Beach, Busan photo\. Did you sleep well last night\?$/);
  assert.ok(m.quickReplies.includes('Let me tell you about that photo'));
  for (const k of ['morning', 'memory', 'evening', 'ask_photo'] as const) {
    const v = (await brain.proactiveMessage({ kind: k, memory: hae, senior: mom, now: new Date() })).value;
    assert.ok((v.text.match(/\?/g) ?? []).length <= 1, k);
    assert.ok(!/[가-힣]/.test(v.text));
  }
  assert.match((await brain.proactiveMessage({ kind: 'evening', senior: mom, now: new Date() })).value.text, /evening medicine/);
});

test('EN report privacy masking', async () => {
  const privacy: PrivacySettings = { health: 'family', memory: 'family', daily: 'private', mood: 'family', trip: 'family' };
  const d = new Date(); d.setHours(9, 2, 0, 0);
  const d2 = new Date(); d2.setHours(14, 10, 0, 0);
  const sessions: SessionLog[] = [
    { id: 's1', startedAt: d.toISOString(), kind: 'proactive', title: 'Morning check-in', category: 'daily', summary: 'She slept well', reported: false },
    { id: 's2', startedAt: d2.toISOString(), kind: 'senior', title: 'Old photo story', category: 'memory', summary: 'We talked about the Bulguksa photo', reported: false },
  ];
  const rep = (await brain.composeReport({ sessions, privacy, moodToday: 'good', senior: mom, now: new Date() })).value;
  assert.equal(rep.sessions[0].time, '09:02');
  assert.equal(rep.sessions[0].isPrivate, true);
  assert.equal(rep.sessions[0].summary, 'This conversation is private');
  assert.ok(!JSON.stringify(rep).includes('She slept well'));
  assert.equal(rep.sessions[1].isPrivate, false);
  assert.match(rep.highlight!, /09:02, 14:10/);
  assert.match(rep.dateLabel, /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+$/);
});

const health: HealthSummary = {
  updatedAt: new Date().toISOString(),
  bloodPressure: [128, 132, 126, 135, 130, 128, 132].map((s, i) => ({ date: `2026-11-0${i + 2}`, systolic: s, diastolic: 80 + (i % 3) })),
  medications: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, name: 'Blood pressure pill', time: '아침' as const, taken: i !== 3 })),
  sleepHours: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, hours: 6.5 })),
  steps: Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, count: 3000 + i * 100 })),
  mood: [{ date: '2026-11-08', label: 'good' }], notes: [],
};
const baseCtx = (over: Partial<FamilyContext> = {}): FamilyContext => ({
  senior: mom, asker: user('jieun'),
  privacy: { health: 'family', memory: 'family', daily: 'private', mood: 'family', trip: 'family' }, privateCategories: ['daily'],
  health, moodToday: 'good', memories: [{ id: 'm1', title: memory.title, summary: memory.summary, year: 1984, place: memory.place, people: memory.people, emotions: memory.emotions }],
  recentSessions: [], trips: [], ...over,
});

test('EN family Q&A: health numbers, private daily refusal', async () => {
  const a = (await brain.answerFamily(step('health'), baseCtx())).value;
  assert.equal(a.showHealthCard, true);
  assert.match(a.text, /Your mom's average blood pressure over the past 7 days is 130\/81/);
  assert.match(a.text, /6 of 7 days/);
  assert.match(a.text, /Thu, Nov 5/);
  const priv = (await brain.answerFamily(step('private'), baseCtx())).value;
  assert.equal(priv.showHealthCard, false);
  assert.match(priv.text, /set her daily chat to private/);
  assert.match(priv.text, /ask her directly/);
  const ph = (await brain.answerFamily(step('health'), baseCtx({ health: undefined, privateCategories: ['health', 'daily'] }))).value;
  assert.match(ph.text, /health information to private/);
  assert.ok(!/\d{3}\/\d{2}/.test(ph.text));
  const gr = (await brain.answerFamily("Grandma's blood pressure lately?", baseCtx({ asker: user('harin') }))).value;
  assert.match(gr.text, /Grandma's average/);
  const w = (await brain.answerFamily('How has Mom been lately?', baseCtx())).value;
  assert.match(w.text, /\d{3}\/\d{2}|feeling/);
  const m = (await brain.answerFamily(step('model'), baseCtx())).value;
  assert.match(m.text, /feeling "good"/);
  // crisis reading leads with the warning
  const bp = [...health.bloodPressure.slice(0, -1), { ...health.bloodPressure[6], systolic: 200, diastolic: 120 }];
  const c = (await brain.answerFamily(step('health'), baseCtx({ health: { ...health, bloodPressure: bp } }))).value.text;
  assert.match(c, /^Her latest blood pressure of 200\/120 is very high/);
  assert.match(c, /right away/);
});

test('EN gathering draft, assist, availability, bots', async () => {
  const members = ['jieun', 'minjun', 'suyeon', 'mom'].map(user);
  const d = (await brain.draftGathering({ proposalText: step('gathering'), proposer: user('minjun'), members, senior: mom, linkedMemory: memory })).value;
  assert.equal(d.title, "Mom's Birthday · Gyeongju Family Trip");
  assert.equal(d.tasks.find(t => /KTX/.test(t.text))?.assigneeId, 'minjun');
  assert.equal(d.tasks.find(t => /lodging/.test(t.text))?.assigneeId, 'suyeon');
  assert.equal(d.tasks.find(t => /cake/.test(t.text))?.assigneeId, 'jieun');
  const n = (await brain.draftGathering({ proposalText: 'Go with family', proposer: user('minjun'), members, senior: mom, linkedTrip: { title: 'Revisiting Gyeongju: a two-day trip', destination: 'Gyeongju' } })).value;
  assert.equal(n.title, 'Gyeongju Family Trip');
  assert.doesNotMatch(JSON.stringify(n), /birthday|cake|flower/i);
  const art = { id: 'a', roomId: 'r', kind: 'gathering' as const, ...d, dateStatus: 'undecided' as const, tasks: d.tasks.map((t, i) => ({ ...t, id: `t${i}`, done: false })), createdBy: 'minjun', updatedBy: 'minjun', updatedAt: '', createdAt: '' };
  const as = (await brain.assistArtifact(art, members)).value;
  assert.ok(as.newTasks.length >= 2 && as.newTasks.length <= 3);

  const slots = buildCandidateSlots(new Date('2026-11-09T10:00:00'));
  const av = async (t: string) => (await brain.parseAvailability(t, slots)).value;
  const all = slots.map(s => s.id);
  assert.deepEqual(await av('Sunday lunch works'), ['slot-2', 'slot-5']);
  assert.deepEqual(await av("Saturday lunch doesn't work, the rest are fine"), ['slot-1', 'slot-2', 'slot-3', 'slot-5']);
  assert.deepEqual(await av('Saturday or Sunday evening only'), ['slot-1', 'slot-3']);
  assert.deepEqual(await av('Sunday the 22nd is fine'), ['slot-5']);
  assert.deepEqual(await av("I can't do Saturday"), ['slot-2', 'slot-3', 'slot-5']);
  assert.deepEqual(await av('Hmm, I am not sure'), []);
  assert.deepEqual(await av('I just had lunch'), []);
  for (const t of ['Any time', 'anytime works', 'All work for me', 'Everything works']) assert.deepEqual(await av(t), all, t);
  for (const t of ['None work', 'None of them work for me']) assert.deepEqual(await av(t), [], t);

  const bot = async (id: string, kind: string, text: string) => (await brain.botReply({ persona: user(id), senior: mom, recent: [], trigger: { kind, text } })).value;
  assert.match(await bot('jieun', 'share_card', 'Spring 1984 Bulguksa'), /Mom|photo/);
  assert.match(await bot('minjun', 'artifact', 'gathering'), /I'll/);
  assert.equal(await bot('harin', 'system', 'Harin was invited to the room'), "Grandma~ I'm here too! Looking at the photos makes me so happy lol");
  assert.match(await bot('suyeon', 'system', 'Suyeon was invited to the room'), /Thanks for inviting/);
  for (const id of ['jieun', 'minjun', 'suyeon', 'harin']) {
    for (const kind of ['text', 'system', 'share_card', 'memory_card', 'artifact', 'schedule_result', 'report', 'health_card', 'itinerary']) {
      const v = await bot(id, kind, kind === 'system' ? 'someone was invited' : 'hello there');
      assert.ok(!/[가-힣]/.test(v), `${id}/${kind}: ${v}`);
    }
    for (const text of ['Blood pressure 200/120', 'Health record, blood pressure']) for (const kind of ['health_card', 'text']) assert.doesNotMatch(await bot(id, kind, text), /healthy|stable|relieved|no need to worry|glad/i);
    for (const text of ['Candidate times: Saturday morning', 'Those are the candidates']) assert.doesNotMatch(await bot(id, 'schedule_result', text), /confirm/i);
  }
  assert.ok(Object.keys(BOT_SLOT_PREFS).length === 5);
});

test('EN senior chat observations', async () => {
  const obs = async (t: string) => (await brain.seniorChat([], t, mom)).value;
  assert.deepEqual((await obs('I took my blood pressure medicine this morning')).observation, { medication: { taken: true, name: 'blood pressure medicine', time: '아침' } });
  assert.deepEqual((await obs("I didn't take my pills")).observation, { medication: { taken: false } });
  assert.equal((await obs('I forgot my evening pills')).observation?.medication?.taken, false);
  assert.equal((await obs('Should I take my pills now?')).observation, undefined);
  assert.equal((await obs('I feel great today')).observation?.mood, '좋음');
  assert.equal((await obs("It's so-so today")).observation?.mood, '보통');
  assert.equal((await obs("I'm feeling a bit lonely")).observation?.mood, '조금 우울');
  assert.equal((await obs('The weather is nice')).observation, undefined);
  const k = await obs('My knee hurts a little');
  assert.equal(k.category, 'health');
  for (const t of ["I didn't take my pills", 'I took my pills', 'I feel great today']) assert.doesNotMatch((await obs(t)).reply, /record|saved|noted/i);
  assert.match((await obs("I didn't take my pills")).reply, /schedule your doctor gave you/);
});

// ── seniorAgentTurn with a stubbed provider ──────────────────────────────────
async function withProvider<T>(reply: string | Error | ((body: { system: string; messages: { content: unknown }[] }) => string), fn: (b: ReturnType<typeof createBrain>, seen: { body?: Record<string, unknown> }) => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const saved = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test';
  resetCircuit();
  const seen: { body?: Record<string, unknown> } = {};
  globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
    seen.body = JSON.parse(init!.body!);
    const r = typeof reply === 'function' ? reply(seen.body as never) : reply;
    if (r instanceof Error) return new Response(r.message, { status: 500 });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: r }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const b = createBrain();
    b.setActiveModel('claude-sonnet');
    b.setLocale('en');
    return await fn(b, seen);
  } finally {
    globalThis.fetch = realFetch; resetCircuit();
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = saved;
  }
}

const agentInput = (over: Partial<SeniorAgentInput> = {}): SeniorAgentInput => ({
  locale: 'en', senior: mom, history: [{ role: 'user', text: 'Last summer we went to Haeundae Beach with Jieun.' }, { role: 'assistant', text: 'How lovely. Who else was there?' }],
  message: 'Just Jieun and me. We ate grilled clams and watched the sunset, it was so peaceful.',
  memories: [{ id: 'm1', title: memory.title, summary: memory.summary, story: memory.story, year: 1984, season: 'spring', place: memory.place, people: memory.people, event: 'family trip', emotions: memory.emotions, visibility: 'family' }],
  allMemoryTitles: [{ id: 'm1', title: memory.title }], now: new Date('2026-11-09T10:00:00'), ...over,
});

test('seniorAgentTurn: not live -> heuristic fallback; isLive reflects provider state', async () => {
  assert.equal(brain.isLive(), false);
  const r = await brain.seniorAgentTurn(agentInput());
  assert.deepEqual(r.value, { reply: '', quickReplies: [], actions: [] });
  assert.equal(r.fallback, true); assert.equal(r.source, 'heuristic');
  await withProvider('{}', async b => {
    assert.equal(b.isLive(), true);
    const { openCircuit } = await import('./llm');
    openCircuit('anthropic', 'test');
    assert.equal(b.isLive(), false);
  });
});

test('seniorAgentTurn: save_memory is normalized and the place is resolved', async () => {
  const json = JSON.stringify({
    reply: "What a peaceful day. I'll keep it safe as a memory.", quick_replies: ['Thank you'],
    actions: [{ type: 'save_memory', memory: { title: 'Summer at Haeundae Beach', story: 'Jieun and I ate grilled clams at Haeundae Beach and watched the sunset.', summary: 'A peaceful sunset with Jieun.', year: 2025, season: 'Summer', place: 'Haeundae Beach', people: [{ name: 'Jieun Kim', relation: 'daughter' }], emotions: ['peace', 'bogus'] } }],
  });
  await withProvider(json, async (b, seen) => {
    const r = await b.seniorAgentTurn(agentInput());
    assert.equal(r.source, 'llm'); assert.equal(r.fallback, false);
    assert.match(r.value.reply, /peaceful/);
    assert.deepEqual(r.value.quickReplies, []);
    assert.equal(r.value.actions.length, 1);
    const a = r.value.actions[0];
    assert.equal(a.type, 'save_memory');
    if (a.type !== 'save_memory') return;
    assert.equal(a.memory.placeId, 'busan-haeundae');
    assert.equal(a.memory.place, 'Haeundae Beach');
    assert.equal(a.memory.season, 'summer');
    assert.equal(a.memory.year, 2025);
    assert.equal(a.memory.era, '2020s');
    assert.deepEqual(a.memory.emotions, ['peace']);
    assert.deepEqual(a.memory.people, [{ name: 'Jieun Kim', relation: 'daughter' }]);
    assert.ok(a.memory.tags.length >= 0 && a.memory.title === 'Summer at Haeundae Beach');
    // request shape: json prompt carries the memories, history is passed as turns, effort low, >= 2048 tokens
    const body = seen.body as { system: string; max_tokens: number; output_config: unknown; messages: { role: string }[] };
    assert.match(body.system, /id=m1/);
    assert.match(body.system, /"save_memory"/);
    assert.deepEqual(body.output_config, { effort: 'low' });
    assert.ok(body.max_tokens >= 2048);
    assert.equal(body.messages.at(-1)!.role, 'user');
  });
});

test('seniorAgentTurn: gaps in save_memory are filled from heuristics', async () => {
  const json = JSON.stringify({ reply: 'Thank you for sharing that.', quick_replies: [], actions: [{ type: 'save_memory', memory: { title: '', story: '' } }] });
  await withProvider(json, async b => {
    const r = await b.seniorAgentTurn(agentInput());
    const a = r.value.actions[0];
    assert.ok(a.type === 'save_memory');
    if (a.type !== 'save_memory') return;
    assert.ok(a.memory.title.length > 0 && a.memory.story.length > 0 && a.memory.summary.length > 0);
    assert.equal(a.memory.placeId, 'busan-haeundae');
    assert.ok(a.memory.people.some(p => p.name === 'Jieun Kim'));
  });
});

test('seniorAgentTurn: unknown memory ids are dropped, known kept', async () => {
  const json = JSON.stringify({
    reply: 'Here it is.', quick_replies: ['Show me', 'x', 'y', 'z'],
    actions: [{ type: 'show_memory', memory_id: 'does-not-exist' }, { type: 'share_memory', memory_id: 'ghost' }, { type: 'show_memory', memory_id: 'm1' }, { type: 'accept_trip' },
      { type: 'log_health', systolic: 500, diastolic: 10 }, { type: 'bogus' }],
  });
  await withProvider(json, async b => {
    const r = await b.seniorAgentTurn(agentInput({ message: 'Show me the Bulguksa trip' }));
    assert.deepEqual(r.value.actions, [{ type: 'show_memory', memoryId: 'm1' }]);
    assert.equal(r.value.quickReplies.length, 3);
    const r2 = await b.seniorAgentTurn(agentInput({ pending: 'trip_confirm', message: 'Yes, I would love to go' }));
    assert.ok(r2.value.actions.some(a => a.type === 'accept_trip'));
  });
  await withProvider(JSON.stringify({ reply: 'Thank you.', actions: [{ type: 'log_health', systolic: 132, diastolic: 84, medication: { taken: true, name: 'invented pill', time: 'morning' }, mood: 'good' }] }), async b => {
    const r = await b.seniorAgentTurn(agentInput({ message: 'My blood pressure was 132 over 84 today' }));
    // ungrounded medication / mood from the model are not accepted
    assert.deepEqual(r.value.actions, [{ type: 'log_health', systolic: 132, diastolic: 84 }]);
  });
});

test('seniorAgentTurn: invalid JSON / failures fall back to the heuristic result', async () => {
  for (const reply of ['this is not json at all', '{"actions":[]}', new Error('down')]) {
    await withProvider(reply, async b => {
      const r = await b.seniorAgentTurn(agentInput());
      assert.deepEqual(r.value, { reply: '', quickReplies: [], actions: [] });
      assert.equal(r.fallback, true); assert.equal(r.source, 'heuristic');
    });
  }
});

test('LLM prompts follow the active locale', async () => {
  await withProvider('{"reply":"Yes, I remember."}', async (b, seen) => {
    const r = await b.recallReply(memory, 'Bulguksa', mom);
    assert.equal(r.source, 'llm');
    assert.match((seen.body as { system: string }).system, /English/);
    b.setLocale('ko');
    await b.recallReply(memory, 'Bulguksa', mom);
    assert.match((seen.body as { system: string }).system, /타치/);
    b.setLocale('en');
  });
});

test('trip suggestion for a place with few nearby highlights terminates (used to spin forever and freeze the server)', async () => {
  const { suggestTripEn } = await import('./heuristics/compose.en');
  const { suggestTrip } = await import('./heuristics/compose');
  const m = { id: 'm', ownerId: 'mom', title: 't', story: 's', summary: 's', people: [], emotions: [], tags: [], visibility: 'private', status: 'saved', createdAt: '' } as unknown as Parameters<typeof suggestTripEn>[0];
  for (const place of ['Namdaemun Market, Seoul', '남대문시장, 서울', 'nowhere in particular']) {
    const en = suggestTripEn({ ...m, place });
    const ko = suggestTrip({ ...m, place });
    assert.ok(en.highlights.length >= 1 && en.highlights.length <= 4, `en highlights for ${place}`);
    assert.ok(ko.highlights.length >= 1 && ko.highlights.length <= 4, `ko highlights for ${place}`);
  }
});
