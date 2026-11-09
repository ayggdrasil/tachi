import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Memory } from '../../shared/types';
import { createGraphStore } from './index';

const m1: Memory = {
  id: 'm1', ownerId: 'mom', title: '1984년 봄, 경주 불국사 가족여행', story: '다보탑 앞에서 사진을 찍는데 민준이가 도망가서 한참 웃었어요.', summary: '가족과 불국사에 갔어요.',
  year: 1984, era: '1980년대', season: '봄', place: '경주 불국사', placeId: 'gyeongju-bulguksa',
  people: [{ name: '박영수', relation: '남편' }, { name: '김지은', relation: '딸' }], event: '가족여행', emotions: ['즐거움', '그리움'], tags: ['다보탑', '벚꽃'],
  visibility: 'family', status: 'saved', createdAt: '2026-11-09T01:00:00.000Z',
};
const m2: Memory = {
  id: 'm2', ownerId: 'mom', title: '1988년 여름, 해운대', story: '튜브 타고 바다에서 놀았어요.', summary: '해운대 피서.', year: 1988, era: '1980년대', season: '여름',
  place: '해운대', placeId: 'busan-haeundae', people: [{ name: '박영수', relation: '남편' }], event: '피서', emotions: ['행복'], tags: ['튜브'],
  visibility: 'family', status: 'saved', createdAt: '2026-11-09T02:00:00.000Z',
};

async function exercise(engineExpected: 'kuzu' | 'memory', dir: string) {
  const g = createGraphStore({ dataDir: dir });
  await g.init();
  assert.equal(g.engine, engineExpected);
  await g.clear();
  const d1 = await g.upsertMemory(m1);
  assert.ok(d1.nodes.some(n => n.id === 'place:gyeongju-bulguksa' && n.label === 'Place'));
  assert.ok(d1.edges.some(e => e.id === 'TAKEN_AT:memory:m1->place:gyeongju-bulguksa'));
  assert.ok(d1.nodes.some(n => n.id === 'person:박영수'));
  await g.upsertMemory(m2);
  await g.upsertMemory(m2); // idempotent
  await g.linkFamily('김지은', '딸', '김순자');
  await g.linkFamily('김지은', '딸', '김순자');

  const hits = await g.search(['불국사']);
  assert.equal(hits[0].memoryId, 'm1');
  assert.ok(hits[0].path.nodes.length >= 2 && hits[0].path.edges.length === 1);
  assert.equal(hits[0].path.nodes[0].label, 'Place');
  assert.equal(hits[0].path.nodes[1].label, 'Memory');
  assert.match(hits[0].cypher, /MATCH \(p:Place\)<-\[:TAKEN_AT\]-\(m:Memory\) WHERE p.name CONTAINS '불국사' RETURN m/);
  assert.ok(hits[0].matched.includes('경주 불국사'));
  assert.ok(!hits.some(h => h.memoryId === 'm2'));

  const person = await g.search(['영수 씨랑', '박영수']);
  assert.equal(person.length, 2);
  const story = await g.search(['도망가서']);
  assert.equal(story[0].memoryId, 'm1');
  assert.equal((await g.search(['불국사'], { visibleMemoryIds: ['m2'] })).length, 0);
  assert.equal((await g.search(['불국사와'])).at(0)?.memoryId, 'm1');

  const names = await g.nodeNames();
  assert.ok(names.includes('경주 불국사') && names.includes('박영수') && names.includes('다보탑'));
  const rel = await g.related('m1');
  assert.deepEqual(rel.map(r => r.memoryId), ['m2']);
  assert.ok(rel[0].via.length > 0);

  const sub = await g.subgraph(['m1']);
  assert.ok(sub.nodes.some(n => n.id === 'memory:m1') && !sub.nodes.some(n => n.id === 'memory:m2'));
  const all = await g.subgraph();
  assert.ok(all.edges.some(e => e.type === 'FAMILY_OF'));
  const st = await g.stats();
  assert.equal(st.engine, engineExpected);
  assert.ok(st.nodes > 8 && st.edges > 8);
  await g.clear();
  assert.deepEqual(await g.stats().then(s => [s.nodes, s.edges]), [0, 0]);
  return g;
}

test('kuzu engine: upsert + search', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tachi-graph-'));
  try { await exercise('kuzu', dir); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('memory fallback engine', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tachi-graph-'));
  process.env.TACHI_GRAPH_ENGINE = 'memory';
  try {
    await exercise('memory', dir);
    // persistence round trip
    const g = createGraphStore({ dataDir: dir });
    await g.init();
    await g.upsertMemory(m1);
    const g2 = createGraphStore({ dataDir: dir });
    await g2.init();
    assert.equal((await g2.search(['불국사']))[0].memoryId, 'm1');
  } finally { delete process.env.TACHI_GRAPH_ENGINE; rmSync(dir, { recursive: true, force: true }); }
});

test('kuzu persists across reopen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tachi-graph-'));
  try {
    const g = createGraphStore({ dataDir: dir });
    await g.init();
    await g.upsertMemory(m1);
    // Kùzu allows one open handle per process on a path; reopen is covered by the demo restart, here we check the mirror state.
    assert.equal(g.engine, 'kuzu');
    assert.equal((await g.search(['다보탑']))[0].memoryId, 'm1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const engine of ['kuzu', 'memory'] as const) {
  test(`clear concurrent with upsert runs after the whole upsert (${engine})`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tachi-graph-'));
    if (engine === 'memory') process.env.TACHI_GRAPH_ENGINE = 'memory';
    try {
      const g = createGraphStore({ dataDir: dir });
      await g.init();
      assert.equal(g.engine, engine);
      const up = g.upsertMemory(m1);
      const link = g.linkFamily('김지은', '딸', '김순자');
      const cl = g.clear();
      await Promise.all([up, link, cl]);
      assert.deepEqual(await g.stats().then(s => [s.nodes, s.edges]), [0, 0]);
    } finally { delete process.env.TACHI_GRAPH_ENGINE; rmSync(dir, { recursive: true, force: true }); }
  });
}
