// GBrain mirror (optional): a write-through copy of the memory graph in a GBrain brain, plus a "deep recall" read path.
// Kùzu / the in-memory graph stays the primary store (live graph, Cypher proof). Enabled only when TACHI_GBRAIN_URL and
// TACHI_GBRAIN_TOKEN are set. Nothing here may block or fail a Tachi flow: writes are queued fire-and-forget, reads
// time out quickly and return [] on any error.
//
// Privacy: Tachi stays the gatekeeper. Pages carry no visibility flag and no photo URL (photo URLs are capability
// URLs that get rotated when a memory goes private), and only the Tachi server holds the token. Every read is
// re-filtered against Tachi's own memories (and visibleMemoryIds) before anything reaches a person.
import type { GraphDelta, GraphEdge, GraphNode, GraphRelType, Memory } from '../../shared/types';
import type { MirrorStatus } from './contract';

export interface GbrainOptions {
  /** Full MCP endpoint, e.g. http://127.0.0.1:3131/mcp */
  url: string;
  token: string;
  /** Every page Tachi writes lives under `<prefix>/` (default 'tachi'); reset deletes only that subtree. */
  prefix?: string;
  /** Deadline for deep-recall reads (ms). Writes use a longer fixed deadline. */
  timeoutMs?: number;
}

export function gbrainOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): GbrainOptions | undefined {
  const url = env.TACHI_GBRAIN_URL?.trim();
  const token = env.TACHI_GBRAIN_TOKEN?.trim();
  if (!url || !token) return undefined;
  const t = Number(env.TACHI_GBRAIN_TIMEOUT_MS);
  return { url, token, prefix: env.TACHI_GBRAIN_PREFIX?.trim() || 'tachi', timeoutMs: Number.isFinite(t) && t > 0 ? t : 3000 };
}

export class GbrainError extends Error {
  override name = 'GbrainError';
  constructor(readonly code: string, message: string) { super(message); }
}

interface RpcMessage {
  id?: number;
  result?: { isError?: boolean; content?: { type: string; text?: string }[] };
  error?: { code: number; message: string };
}

/** JSON-RPC message with `id` from a JSON body or an SSE stream (`event: message` / `data: …`, multi-line data joined). */
export function parseRpcResponse(raw: string, id: number): RpcMessage {
  const bodies: string[] = [];
  if (raw.trimStart().startsWith('{')) bodies.push(raw);
  else {
    for (const block of raw.split(/\r?\n\r?\n/)) {
      const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, ''));
      if (data.length) bodies.push(data.join('\n'));
    }
  }
  for (const b of bodies.reverse()) {
    try { const m = JSON.parse(b) as RpcMessage; if (m && m.id === id) return m; } catch { /* not JSON */ }
  }
  throw new GbrainError('bad_response', 'gbrain: unreadable MCP response');
}

/** Minimal MCP client for `gbrain serve --http` (stateless streamable HTTP): one `tools/call` per request. */
export class GbrainClient {
  private seq = 0;
  constructor(private url: string, private token: string) {}

  async call<T = unknown>(tool: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
    const id = ++this.seq;
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: tool, arguments: args } }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new GbrainError(timedOut ? 'timeout' : 'unreachable', `gbrain ${tool}: ${timedOut ? `no answer within ${timeoutMs}ms` : (e instanceof Error ? e.message : String(e))}`);
    }
    const raw = await res.text();
    if (!res.ok) throw new GbrainError(res.status === 401 || res.status === 403 ? 'unauthorized' : `http_${res.status}`, `gbrain ${tool}: HTTP ${res.status}`);
    const msg = parseRpcResponse(raw, id);
    if (msg.error) throw new GbrainError(`rpc_${msg.error.code}`, `gbrain ${tool}: ${msg.error.message}`);
    const text = msg.result?.content?.find(c => c.type === 'text')?.text ?? '';
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* plain text result */ }
    if (msg.result?.isError) {
      const b = (body && typeof body === 'object' ? body : {}) as { code?: string; error?: string; message?: string };
      throw new GbrainError(b.code ?? b.error ?? 'tool_error', `gbrain ${tool}: ${b.message ?? text.slice(0, 200)}`);
    }
    return body as T;
  }
}

// ── mapping: Tachi graph → GBrain pages + typed links ───────────────────────

/** One slug segment GBrain accepts (letters/numbers in any script, then . _ -). GBrain lowercases slugs itself. */
export function slugSegment(s: string): string {
  const seg = s.normalize('NFC').toLowerCase().trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/-{2,}/g, '-')
    .replace(/^[^\p{L}\p{N}]+/u, '').replace(/[-._]+$/, '');
  return seg ? seg.slice(0, 80) : `x${fnv(s)}`;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

/** Tachi node-id prefix → GBrain folder, page type and a Korean label for the page body. */
const ENTITY: Record<string, { dir: string; type: string; kind: string }> = {
  person: { dir: 'people', type: 'person', kind: '인물' },
  place: { dir: 'places', type: 'concept', kind: '장소' },
  era: { dir: 'eras', type: 'concept', kind: '시대' },
  event: { dir: 'events', type: 'concept', kind: '일' },
  emotion: { dir: 'emotions', type: 'concept', kind: '감정' },
  topic: { dir: 'topics', type: 'concept', kind: '주제' },
};

/**
 * Tachi relation → a link type GBrain's default pack (gbrain-base-v2) declares; undeclared types are refused.
 * The Tachi relation name travels in the link's `context`, so nothing is lost.
 */
export const LINK_TYPE: Record<GraphRelType, string> = {
  APPEARS_IN: 'attended',   // Person → Memory
  TAKEN_AT: 'mentions',     // Memory → Place
  IN_ERA: 'mentions',       // Memory → Era
  ABOUT: 'mentions',        // Memory → Event
  EVOKES: 'mentions',       // Memory → Emotion
  MENTIONS: 'mentions',     // Memory → Topic
  FAMILY_OF: 'relates_to',  // Person → Person (relation in context)
};

const yaml = (v: unknown) => JSON.stringify(v); // JSON scalars/arrays are valid YAML flow values

function frontmatter(fields: [string, unknown][]): string {
  const lines = fields
    .filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `${k}: ${yaml(v)}`);
  return `---\n${lines.join('\n')}\n---\n`;
}

/** The memory as a GBrain page. No photo URL, no visibility (see the privacy note at the top). */
export function memoryPage(m: Memory): string {
  const people = m.people.map(p => (p.relation ? `${p.name}(${p.relation})` : p.name));
  const when = [m.year ? `${m.year}년` : m.era, m.season].filter(Boolean).join(' ');
  const facts = [
    when && `- 언제: ${when}`,
    m.place && `- 어디서: ${m.place}`,
    people.length && `- 누구와: ${people.join(', ')}`,
    m.event && `- 무슨 일: ${m.event}`,
    m.emotions.length && `- 감정: ${m.emotions.join(', ')}`,
    m.tags.length && `- 키워드: ${m.tags.join(', ')}`,
  ].filter(Boolean);
  return frontmatter([
    ['title', m.title], ['type', 'note'], ['tachi_kind', 'memory'], ['tachi_memory_id', m.id],
    ['year', m.year], ['era', m.era], ['season', m.season], ['place', m.place], ['event', m.event],
    ['people', people], ['emotions', m.emotions], ['tags', m.tags], ['created_at', m.createdAt],
  ]) + `# ${m.title}\n\n${[m.summary, m.story].filter(Boolean).join('\n\n')}\n${facts.length ? `\n${facts.join('\n')}\n` : ''}`;
}

export function entityPage(n: GraphNode): string {
  const prefix = n.id.slice(0, n.id.indexOf(':'));
  const spec = ENTITY[prefix] ?? ENTITY.topic;
  const relation = typeof n.props?.relation === 'string' && n.props.relation ? n.props.relation : undefined;
  return frontmatter([['title', n.name], ['type', spec.type], ['tachi_kind', prefix], ['relation', relation]])
    + `# ${n.name}\n\n타치 기억 그래프의 ${spec.kind}${relation ? ` (어머님의 ${relation})` : ''}.\n`;
}

// ── the mirror ──────────────────────────────────────────────────────────────

export interface DeepRow { slug: string; score: number; evidence: string }

const WRITE_TIMEOUT_MS = 10_000;
const READ_COOLDOWN_MS = 30_000;  // after a failure, deep recall stays off this long so the senior never waits on a dead brain
const WARN_EVERY_MS = 60_000;

export class GbrainMirror {
  readonly prefix: string;
  private client: GbrainClient;
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private ensured = new Set<string>();
  private st: { state: MirrorStatus['state']; lastError?: string; lastOkAt?: string } = { state: 'starting' };
  private failedAt = 0;
  private warnedAt = 0;

  constructor(private opts: GbrainOptions, client?: GbrainClient) {
    this.prefix = (opts.prefix ?? 'tachi').split('/').filter(Boolean).map(slugSegment).join('/') || 'tachi';
    this.client = client ?? new GbrainClient(opts.url, opts.token);
  }

  memorySlug(memoryId: string): string { return `${this.prefix}/memories/${slugSegment(memoryId)}`; }

  /** 'memory:m1' → <prefix>/memories/m1, 'person:박영수' → <prefix>/people/박영수, … */
  nodeSlug(nodeId: string): string {
    const i = nodeId.indexOf(':');
    const kind = nodeId.slice(0, i);
    const key = nodeId.slice(i + 1);
    if (kind === 'memory') return this.memorySlug(key);
    return `${this.prefix}/${(ENTITY[kind] ?? ENTITY.topic).dir}/${slugSegment(key)}`;
  }

  status(): MirrorStatus {
    return { engine: 'gbrain', url: this.opts.url, prefix: this.prefix, pending: this.pending, ...this.st };
  }

  /** Connectivity + auth probe (queued, so it reports before the first write runs). */
  start(): Promise<void> {
    return this.enqueue('probe', async () => { await this.client.call('list_pages', { slug_prefix: `${this.prefix}/`, limit: 1 }, WRITE_TIMEOUT_MS); });
  }

  /** Resolves once every write queued so far has been attempted. */
  flush(): Promise<void> { return this.chain; }

  upsertMemory(m: Memory, delta: GraphDelta): Promise<void> {
    return this.enqueue('upsert', async () => {
      const slug = this.memorySlug(m.id);
      await this.client.call('put_page', { slug, content: memoryPage(m), force: true, reason: 'tachi: memory saved' }, WRITE_TIMEOUT_MS);
      this.ensured.add(slug);
      for (const n of delta.nodes) if (n.label !== 'Memory') await this.ensureEntity(n);
      for (const e of delta.edges) await this.link(e);
    });
  }

  linkFamily(personName: string, relation: string, seniorName: string): Promise<void> {
    return this.enqueue('family', async () => {
      const a: GraphNode = { id: `person:${personName}`, label: 'Person', name: personName, props: { relation } };
      const b: GraphNode = { id: `person:${seniorName}`, label: 'Person', name: seniorName };
      await this.ensureEntity(a);
      await this.ensureEntity(b);
      await this.link({ id: '', type: 'FAMILY_OF', source: a.id, target: b.id, props: { relation } });
    });
  }

  /** Soft-delete every page under <prefix>/ (GBrain keeps them restorable for 72h). */
  clear(): Promise<void> {
    return this.enqueue('clear', async () => {
      this.ensured.clear();
      for (let round = 0; round < 100; round++) {
        const rows = await this.client.call<{ slug?: string }[]>('list_pages', { slug_prefix: `${this.prefix}/`, limit: 100 }, WRITE_TIMEOUT_MS);
        const slugs = (Array.isArray(rows) ? rows : []).map(r => r.slug).filter((s): s is string => typeof s === 'string' && s.startsWith(`${this.prefix}/`));
        if (!slugs.length) return;
        for (const slug of slugs) await this.client.call('delete_page', { slug, force: true }, WRITE_TIMEOUT_MS); // (delete_page takes no `reason`; unknown params are refused)
      }
    });
  }

  /** True when no Tachi memory page exists yet (used to backfill an existing database once). */
  async isEmpty(): Promise<boolean> {
    const rows = await this.client.call<unknown[]>('list_pages', { slug_prefix: `${this.prefix}/memories/`, limit: 1 }, WRITE_TIMEOUT_MS);
    return !Array.isArray(rows) || rows.length === 0;
  }

  /** Hybrid search over memory pages only. Never throws: [] on error, timeout or while cooling down after a failure. */
  async query(text: string, limit: number): Promise<DeepRow[]> {
    if (this.st.state === 'error' && Date.now() - this.failedAt < READ_COOLDOWN_MS) return [];
    try {
      const rows = await this.client.call<unknown>('query', { query: text, limit, where: { tachi_kind: 'memory' }, fields: 'lean' }, this.opts.timeoutMs ?? 3000);
      this.ok();
      const mine = `${this.prefix}/memories/`;
      return (Array.isArray(rows) ? rows : [])
        .filter((r): r is { slug: string; score?: unknown; evidence?: unknown } => !!r && typeof (r as { slug?: unknown }).slug === 'string' && (r as { slug: string }).slug.startsWith(mine))
        .map(r => ({ slug: r.slug, score: Number(r.score) || 0, evidence: typeof r.evidence === 'string' ? r.evidence : '' }));
    } catch (e) {
      this.fail('query', e);
      return [];
    }
  }

  // ── internals ──

  private async ensureEntity(n: GraphNode): Promise<void> {
    const slug = this.nodeSlug(n.id);
    if (this.ensured.has(slug)) return;
    try {
      await this.client.call('get_page', { slug, body: 'none' }, WRITE_TIMEOUT_MS);
    } catch (e) {
      if (!(e instanceof GbrainError && e.code === 'page_not_found')) throw e;
      // force: a soft-deleted page (after a demo reset) still holds the slug
      await this.client.call('put_page', { slug, content: entityPage(n), force: true, reason: 'tachi: graph entity' }, WRITE_TIMEOUT_MS);
    }
    this.ensured.add(slug);
  }

  private async link(e: GraphEdge): Promise<void> {
    const context = e.type === 'FAMILY_OF' ? String(e.props?.relation || '가족') : e.type;
    await this.client.call('add_link', {
      from: this.nodeSlug(e.source), to: this.nodeSlug(e.target), link_type: LINK_TYPE[e.type], link_source: 'tachi', context,
    }, WRITE_TIMEOUT_MS);
  }

  private enqueue(label: string, fn: () => Promise<void>): Promise<void> {
    this.pending++;
    const run = async () => {
      try { await fn(); this.ok(); } catch (e) { this.fail(label, e); } finally { this.pending--; }
    };
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private ok() {
    this.st = { state: 'ok', lastOkAt: new Date().toISOString() };
  }

  private fail(label: string, e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    this.st = { ...this.st, state: 'error', lastError: msg };
    this.failedAt = Date.now();
    if (Date.now() - this.warnedAt > WARN_EVERY_MS) {
      this.warnedAt = Date.now();
      console.warn(`[graph] gbrain mirror ${label} failed (Kùzu graph unaffected): ${msg}`);
    }
  }
}
