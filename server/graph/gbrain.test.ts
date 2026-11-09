// GBrain mirror: mapping, MCP plumbing and Store wiring against a fake `gbrain serve --http`
// that enforces the behaviours observed on a real one (lowercased slugs, revision_required, declared link types,
// add_link needs both pages, soft delete keeps the slug).
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import type { Memory } from '../../shared/types';
import { LINK_TYPE, entityPage, memoryPage, parseRpcResponse, slugSegment } from './gbrain';
import { createGraphStore } from './index';

process.env.TACHI_GRAPH_ENGINE = 'memory';

const DECLARED = new Set(['partner_of', 'relates_to', 'mentions', 'discusses', 'owes_to', 'awaiting_reply_from', 'founded', 'works_at', 'invested_in', 'advises', 'sourced_from', 'derived_from', 'supersedes', 'redirects_to', 'attended', 'authored', 'attributed_to']);

const mem: Memory = {
  id: 'mem-AbC12xyz', ownerId: 'mom', photoUrl: '/uploads/secret-capability.jpg',
  title: '1984년 봄, 경주 불국사 가족여행', story: '다보탑 앞에서 사진을 찍는데 민준이가 도망가서 한참 웃었어요. 수박도 먹었지요.', summary: '가족과 불국사에 갔어요.',
  year: 1984, era: '1980년대', season: '봄', place: '경주 불국사', placeId: 'gyeongju-bulguksa',
  people: [{ name: '박영수', relation: '남편' }, { name: '김민준' }], event: '가족여행', emotions: ['즐거움'], tags: ['다보탑'],
  visibility: 'private', status: 'saved', createdAt: '2026-11-09T01:00:00.000Z',
};
const mem2: Memory = { ...mem, id: 'mem-sea', title: '1988년 여름, 해운대', story: '튜브 타고 바다에서 놀았어요.', summary: '해운대 피서.', place: '해운대', placeId: 'busan-haeundae', people: [], tags: [] };

// ── fake gbrain ──
interface Page { content: string; deleted: boolean }
const pages = new Map<string, Page>();
const links: { from: string; to: string; link_type: string; context?: string; link_source?: string }[] = [];
const calls: { tool: string; args: Record<string, unknown> }[] = [];
let down = false;
let server: http.Server;
let url = '';

function toolError(code: string, message: string) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: code, code, message }) }] }; }
function ok(body: unknown) { return { content: [{ type: 'text', text: JSON.stringify(body) }] }; }

/** Parameters each tool declares on gbrain 0.60 (subset we may send); a real server refuses anything else on writes. */
const PARAMS: Record<string, string[]> = {
  list_pages: ['type', 'tag', 'limit', 'offset', 'updated_after', 'updated_after_slug', 'sort', 'include_deleted', 'slug_prefix', 'where', 'source_id', 'source_ids'],
  get_page: ['slug', 'fuzzy', 'include_content', 'content_only', 'body', 'source_id', 'include_deleted'],
  put_page: ['source_id', 'expected_revision', 'force', 'request_id', 'content_origin', 'slug', 'content', 'allow_empty', 'allow_shrink', 'drop_timeline', 'wait_ms', 'reason'],
  delete_page: ['source_id', 'expected_revision', 'force', 'request_id', 'slug', 'purge'],
  add_link: ['request_id', 'from', 'to', 'link_type', 'context', 'link_source', 'valid_from', 'valid_until'],
  query: ['query', 'limit', 'offset', 'types', 'where', 'snippet_chars', 'return_unit', 'token_budget', 'fields', 'source_id', 'relational'],
};

function handle(tool: string, a: Record<string, unknown>) {
  const unknown = Object.keys(a).filter(k => !PARAMS[tool]?.includes(k));
  if (unknown.length) return toolError('invalid_params', `${unknown.length} unknown parameter not declared in the ${tool} tool schema`);
  const slug = typeof a.slug === 'string' ? a.slug.toLowerCase() : '';
  switch (tool) {
    case 'list_pages': {
      const pre = String(a.slug_prefix ?? '');
      return ok([...pages].filter(([s, p]) => !p.deleted && s.startsWith(pre)).slice(0, Number(a.limit ?? 50)).map(([s]) => ({ slug: s })));
    }
    case 'get_page': return pages.get(slug) && !pages.get(slug)!.deleted ? ok({ slug }) : toolError('page_not_found', 'Page not found.');
    case 'put_page':
      if (pages.has(slug) && !a.force) return toolError('revision_required', 'The page already exists; an expected revision is required.');
      pages.set(slug, { content: String(a.content), deleted: false });
      return ok({ slug, status: 'created_or_updated' });
    case 'delete_page': { const p = pages.get(slug); if (p) p.deleted = true; return ok({ slug, status: 'soft_deleted' }); }
    case 'add_link': {
      const from = String(a.from).toLowerCase(), to = String(a.to).toLowerCase();
      if (!DECLARED.has(String(a.link_type))) return toolError('invalid_params', `link type '${a.link_type}' is not declared`);
      for (const s of [from, to]) if (!pages.get(s) || pages.get(s)!.deleted) return toolError('page_not_found', `add_link to page "${s}" was not found`);
      if (!links.some(l => l.from === from && l.to === to && l.link_type === a.link_type)) links.push({ from, to, link_type: String(a.link_type), context: a.context as string, link_source: a.link_source as string });
      return ok({ status: 'ok' });
    }
    case 'query': {
      const words = String(a.query).split(/\s+/).filter(w => w.length > 1);
      const where = a.where as Record<string, string> | undefined;
      const rows = [...pages].filter(([, p]) => !p.deleted && (!where?.tachi_kind || p.content.includes(`tachi_kind: "${where.tachi_kind}"`)))
        .filter(([, p]) => words.some(w => p.content.includes(w))).map(([s]) => ({ slug: s, score: 1.5, evidence: 'keyword_exact' }));
      return ok([...rows, { slug: 'someone-else/memories/x', score: 9 }]);
    }
    default: return toolError('unknown_tool', tool);
  }
}

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      if (down) { res.writeHead(503).end(); return; }
      if (req.headers.authorization !== 'Bearer test-token') { res.writeHead(401).end(); return; }
      const msg = JSON.parse(body) as { id: number; params: { name: string; arguments: Record<string, unknown> } };
      calls.push({ tool: msg.params.name, args: msg.params.arguments });
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: handle(msg.params.name, msg.params.arguments) })}\n\n`);
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
});
after(() => { server.close(); });

function freshStore(opts: { token?: string } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'tachi-gbrain-'));
  const g = createGraphStore({ dataDir: dir, gbrain: { url, token: opts.token ?? 'test-token', prefix: 'tachi', timeoutMs: 1000 } });
  return { g, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// ── pure mapping ──
test('slug segments, link vocabulary and page content', () => {
  assert.equal(slugSegment('경주 불국사'), '경주-불국사');
  assert.equal(slugSegment('mem-AbC12xyz'), 'mem-abc12xyz');
  assert.equal(slugSegment('  (어머님) 친구!! '), '어머님-친구');
  assert.match(slugSegment('!!!'), /^x[0-9a-f]+$/);
  for (const t of Object.values(LINK_TYPE)) assert.ok(DECLARED.has(t), `${t} must be declared in gbrain-base-v2`);

  const page = memoryPage(mem);
  assert.match(page, /^---\ntitle: "1984년 봄, 경주 불국사 가족여행"\ntype: "note"\ntachi_kind: "memory"\ntachi_memory_id: "mem-AbC12xyz"\nyear: 1984\n/);
  assert.match(page, /people: \["박영수\(남편\)","김민준"\]/);
  assert.match(page, /# 1984년 봄, 경주 불국사 가족여행\n\n가족과 불국사에 갔어요\.\n\n다보탑 앞에서/);
  assert.match(page, /- 누구와: 박영수\(남편\), 김민준/);
  assert.ok(!page.includes('secret-capability'), 'photo capability URL never leaves Tachi');
  assert.ok(!/visibility|private/.test(page), 'visibility stays in Tachi (it would go stale in the mirror)');

  assert.match(entityPage({ id: 'person:박영수', label: 'Person', name: '박영수', props: { relation: '남편' } }), /type: "person"\ntachi_kind: "person"\nrelation: "남편"\n---\n# 박영수\n\n타치 기억 그래프의 인물 \(어머님의 남편\)\./);
});

test('MCP responses: SSE (multi-line data) and plain JSON', () => {
  assert.deepEqual(parseRpcResponse('event: message\ndata: {"jsonrpc":"2.0",\ndata: "id":3,"result":{}}\n\n', 3).id, 3);
  assert.deepEqual(parseRpcResponse('{"jsonrpc":"2.0","id":4,"result":{}}', 4).id, 4);
  assert.throws(() => parseRpcResponse('event: message\ndata: {"id":1}\n\n', 2), /unreadable/);
});

// ── Store wiring ──
test('write-through: memory page, entity pages, typed links, family link, idempotent re-upsert', async () => {
  const { g, done } = freshStore();
  await g.init();
  const delta = await g.upsertMemory(mem);
  await g.linkFamily('김지은', '딸', '김순자');
  await g.flushMirror();
  assert.equal(g.mirrorStatus()?.state, 'ok');

  const memSlug = 'tachi/memories/mem-abc12xyz';
  assert.ok(pages.has(memSlug));
  for (const n of delta.nodes.filter(x => x.label !== 'Memory')) {
    const kind = n.id.slice(0, n.id.indexOf(':'));
    assert.ok([...pages.keys()].some(s => s.startsWith(`tachi/${{ person: 'people', place: 'places', era: 'eras', event: 'events', emotion: 'emotions', topic: 'topics' }[kind]}/`)), `entity page for ${n.id}`);
  }
  assert.ok(pages.has('tachi/places/gyeongju-bulguksa'));
  assert.ok(links.some(l => l.from === 'tachi/people/박영수' && l.to === memSlug && l.link_type === 'attended' && l.context === 'APPEARS_IN'));
  assert.ok(links.some(l => l.from === memSlug && l.to === 'tachi/places/gyeongju-bulguksa' && l.link_type === 'mentions' && l.context === 'TAKEN_AT'));
  assert.ok(links.some(l => l.from === 'tachi/people/김지은' && l.to === 'tachi/people/김순자' && l.link_type === 'relates_to' && l.context === '딸'));
  assert.ok(links.every(l => l.link_source === 'tachi'));

  // re-upsert (photo rotation): memory page overwritten, entities not re-checked, no duplicate links
  const before = calls.length;
  const nLinks = links.length;
  await g.upsertMemory({ ...mem, photoUrl: '/uploads/rotated.jpg' });
  await g.flushMirror();
  const again = calls.slice(before);
  assert.equal(again.filter(c => c.tool === 'get_page').length, 0, 'entity existence is cached per process');
  assert.equal(again.filter(c => c.tool === 'put_page').length, 1);
  assert.equal(links.length, nLinks);
  done();
});

test('deep recall resolves GBrain hits through Tachi graph ids, filters foreign/invisible pages', async () => {
  const { g, done } = freshStore();
  await g.init();
  await g.upsertMemory(mem);
  await g.upsertMemory(mem2);
  await g.flushMirror();

  const hits = await g.deepRecall('수박 먹던 기억');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].memoryId, 'mem-AbC12xyz', 'original-case id, not the lowercased slug');
  assert.equal(hits[0].via, 'gbrain');
  assert.deepEqual(hits[0].matched, ['수박']);
  assert.equal(hits[0].path.nodes[0].label, 'Memory');
  assert.match(hits[0].cypher, /^gbrain query "수박 먹던 기억" where tachi_kind = memory → tachi\/memories\/mem-abc12xyz \(keyword_exact\)$/);

  assert.equal((await g.deepRecall('가족여행')).length, 2);
  assert.deepEqual((await g.deepRecall('가족여행', { visibleMemoryIds: ['mem-sea'] })).map(h => h.memoryId), ['mem-sea']);
  assert.equal((await g.deepRecall('바다에서')).at(0)?.memoryId, 'mem-sea');
  assert.deepEqual(await g.deepRecall('   '), []);
  done();
});

test('reset soft-deletes only the tachi/ subtree, then re-seeding recreates pages and links', async () => {
  pages.set('notes/keep-me', { content: 'unrelated', deleted: false });
  const { g, done } = freshStore();
  await g.init();
  await g.upsertMemory(mem);
  await g.clear();
  await g.upsertMemory(mem); // same slugs as before the reset: soft-deleted pages must come back
  await g.flushMirror();
  assert.equal(pages.get('notes/keep-me')?.deleted, false);
  assert.equal(pages.get('tachi/memories/mem-abc12xyz')?.deleted, false);
  assert.equal(pages.get('tachi/people/박영수')?.deleted, false, 'entity cache was reset with the brain');
  assert.equal(g.mirrorStatus()?.state, 'ok');
  done();
});

test('a down or unauthorized brain never breaks Tachi: graph keeps working, deep recall is [] and fast', async () => {
  const bad = freshStore({ token: 'wrong' });
  await bad.g.init();
  await bad.g.upsertMemory(mem);
  await bad.g.flushMirror();
  assert.equal(bad.g.mirrorStatus()?.state, 'error');
  assert.match(bad.g.mirrorStatus()?.lastError ?? '', /HTTP 401/);
  assert.equal((await bad.g.search(['불국사']))[0]?.memoryId, 'mem-AbC12xyz');
  bad.done();

  down = true;
  const { g, done } = freshStore();
  await g.init();
  await g.upsertMemory(mem);
  await g.flushMirror();
  assert.equal(g.mirrorStatus()?.state, 'error');
  const t = Date.now();
  assert.deepEqual(await g.deepRecall('수박'), []);
  assert.ok(Date.now() - t < 50, 'cool-down: no network call right after a failure');
  down = false;
  done();
});

test('without TACHI_GBRAIN_* the mirror is off', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tachi-nogb-'));
  const g = createGraphStore({ dataDir: dir, gbrain: false });
  await g.init();
  assert.equal(g.mirrorStatus(), null);
  assert.deepEqual(await g.deepRecall('수박'), []);
  await g.flushMirror();
  rmSync(dir, { recursive: true, force: true });
});
