// Graph store: Kùzu when available (mirrored in memory for resilience), in-memory + JSON fallback otherwise.
import { join } from 'node:path';
import type { GraphDelta, GraphEdge, GraphNode, GraphPath, Memory } from '../../shared/types';
import type { GraphSearchHit, GraphStore, MirrorStatus } from './contract';
import type { Backend } from './backend';
import { ENTITY_PRIORITY, cypherFor, memoryNodeId, memoryToDelta } from './delta';
import { GbrainMirror, gbrainOptionsFromEnv, type GbrainOptions } from './gbrain';
import { KuzuBackend } from './kuzu';
import { MemoryBackend } from './memory';

const EN_STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were', 'our', 'her', 'his', 'my', 'of', 'in', 'at', 'to', 'a', 'an', 'on']);
const PARTICLES = ['이랑', '하고', '에서', '으로', '에게', '한테', '이', '가', '은', '는', '을', '를', '에', '랑', '의', '도', '로', '와', '과'];
function variants(kw: string): string[] {
  const base = kw.trim().replace(/['’]s$/i, '').replace(/[,.!?;:]+$/, '');
  const set = new Set<string>();
  const add = (s: string) => { if (s.length >= 2) set.add(s); };
  add(base);
  for (const p of PARTICLES) if (base.length > p.length + 1 && base.endsWith(p)) { add(base.slice(0, -p.length)); break; }
  for (const part of base.split(/\s+/)) {
    if (EN_STOP.has(part.toLowerCase())) continue;
    add(part.replace(/[,.!?;:]+$/, ''));
    for (const p of PARTICLES) if (part.length > p.length + 1 && part.endsWith(p)) { add(part.slice(0, -p.length)); break; }
  }
  return [...set];
}

/** `gbrain`: mirror options, `false` to force it off; omitted → read TACHI_GBRAIN_URL / TACHI_GBRAIN_TOKEN. */
export function createGraphStore(opts: { dataDir: string; gbrain?: GbrainOptions | false }): GraphStore {
  const g = opts.gbrain === false ? undefined : (opts.gbrain ?? gbrainOptionsFromEnv());
  return new Store(opts.dataDir, g ? new GbrainMirror(g) : undefined);
}

class Store implements GraphStore {
  private primary!: Backend;           // kuzu when healthy
  private mirror: MemoryBackend;       // always kept in sync (and the fallback)
  private current!: Backend;
  private ready = false;
  constructor(private dataDir: string, private gbrain?: GbrainMirror) {
    this.mirror = new MemoryBackend(); // persisted only when it is the active engine (see init)
  }

  get engine(): 'kuzu' | 'memory' { return this.current?.engine ?? 'memory'; }

  async init() {
    if (this.ready) return;
    await this.initPrimary();
    if (this.gbrain) {
      console.log(`[graph] GBrain mirror on: ${this.gbrain.status().url} (pages under ${this.gbrain.prefix}/)`);
      void this.gbrain.start();
    }
  }

  private async initPrimary() {
    if (process.env.TACHI_GRAPH_ENGINE !== 'memory') {
      try {
        const k = new KuzuBackend(join(this.dataDir, 'graph.kuzu'));
        await k.init();
        this.primary = k; this.current = k;
        await this.hydrateMirror(k);
        this.ready = true;
        return;
      } catch (e) {
        console.warn(`[graph] Kùzu unavailable (${e instanceof Error ? e.message : e}); using in-memory graph.`);
      }
    }
    const m = new MemoryBackend(join(this.dataDir, 'graph.json'));
    await m.init();
    this.mirror = m; this.primary = m; this.current = m;
    this.ready = true;
  }

  private async hydrateMirror(k: KuzuBackend) {
    try { this.mirror.load(await k.dump()); } catch { /* mirror stays empty */ }
  }

  /** Run on the primary; on Kùzu failure, drop to the in-memory mirror and retry once. */
  private async b<T>(fn: (b: Backend) => Promise<T>): Promise<T> {
    try { return await fn(this.current); }
    catch (e) {
      if (this.current === this.mirror) throw e;
      console.warn(`[graph] Kùzu error, switching to in-memory graph: ${e instanceof Error ? e.message : e}`);
      this.current = this.mirror;
      return fn(this.current);
    }
  }

  /** Whole-operation mutation queue: clear/upsert/linkFamily never interleave their statements. */
  private mutChain: Promise<unknown> = Promise.resolve();
  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutChain.then(fn, fn);
    this.mutChain = next.catch(() => undefined);
    return next;
  }

  clear(): Promise<void> { return this.mutate(() => this.clearNow()); }

  private async clearNow() {
    void this.gbrain?.clear(); // queued ahead of the re-seed's writes
    await this.mirror.clear();
    if (this.primary !== this.mirror) { try { await this.primary.clear(); } catch (e) { console.warn('[graph] clear failed', e); this.current = this.mirror; } }
  }

  upsertMemory(memory: Memory): Promise<GraphDelta> { return this.mutate(() => this.upsertNow(memory)); }

  private async upsertNow(memory: Memory): Promise<GraphDelta> {
    const delta = memoryToDelta(memory);
    await this.mirror.upsert(memory, delta);
    if (this.primary !== this.mirror) {
      try { await this.primary.upsert(memory, delta); } catch (e) { console.warn('[graph] Kùzu upsert failed, using in-memory graph:', e instanceof Error ? e.message : e); this.current = this.mirror; }
    }
    void this.gbrain?.upsertMemory(memory, delta); // fire-and-forget: the mirror queues and never throws
    return delta;
  }

  linkFamily(personName: string, relation: string, seniorName: string): Promise<void> { return this.mutate(() => this.linkNow(personName, relation, seniorName)); }

  private async linkNow(personName: string, relation: string, seniorName: string) {
    void this.gbrain?.linkFamily(personName, relation, seniorName);
    await this.mirror.linkFamily(personName, relation, seniorName);
    if (this.primary !== this.mirror) { try { await this.primary.linkFamily(personName, relation, seniorName); } catch { this.current = this.mirror; } }
  }

  async search(keywords: string[], opts: { visibleMemoryIds?: string[]; limit?: number } = {}): Promise<GraphSearchHit[]> {
    const visible = opts.visibleMemoryIds ? new Set(opts.visibleMemoryIds) : undefined;
    const kws = [...new Set(keywords.flatMap(variants))];
    if (!kws.length) return [];
    interface Acc { score: number; matched: Set<string>; seenNodes: Set<string>; best?: { node: GraphNode; edge: GraphEdge; kw: string; pri: number }; textKw?: string }
    const acc = new Map<string, Acc>();
    const get = (id: string) => { let a = acc.get(id); if (!a) { a = { score: 0, matched: new Set(), seenNodes: new Set() }; acc.set(id, a); } return a; };
    for (const kw of kws) {
      const ents = await this.b(b => b.entityMatches(kw));
      for (const m of ents) {
        if (visible && !visible.has(m.memoryId)) continue;
        const a = get(m.memoryId);
        if (a.seenNodes.has(m.node.id)) continue;
        a.seenNodes.add(m.node.id);
        a.score += 3; a.matched.add(m.node.name);
        const pri = ENTITY_PRIORITY[m.node.label] ?? 0;
        if (!a.best || pri > a.best.pri) a.best = { node: m.node, edge: m.edge, kw, pri };
      }
      const texts = await this.b(b => b.textMatches(kw));
      for (const t of texts) {
        if (visible && !visible.has(t.memoryId)) continue;
        const a = get(t.memoryId);
        a.score += t.field === 'title' ? 2 : 1;
        a.matched.add(kw); a.textKw ??= kw;
      }
    }
    const hits: (GraphSearchHit & { created: string })[] = [];
    for (const [memoryId, a] of acc) {
      const mem = await this.b(b => b.memoryNode(memoryId));
      if (!mem) continue;
      const path: GraphPath = a.best ? { nodes: [a.best.node, mem], edges: [a.best.edge] } : { nodes: [mem], edges: [] };
      hits.push({
        memoryId, score: a.score, matched: [...a.matched], path,
        cypher: a.best ? cypherFor(a.best.node.label, a.best.kw) : cypherFor(undefined, a.textKw ?? kws[0]),
        created: String(mem.props?.createdAt ?? ''),
      });
    }
    hits.sort((x, y) => y.score - x.score || y.created.localeCompare(x.created));
    return hits.slice(0, opts.limit ?? 5).map(({ created: _c, ...h }) => h);
  }

  async nodeNames() { return this.b(b => b.nodeNames()); }

  async subgraph(memoryIds?: string[]): Promise<GraphDelta> {
    const d = await this.b(b => b.dump());
    if (!memoryIds) return d;
    const mids = new Set(memoryIds.map(memoryNodeId));
    const edges = d.edges.filter(e => e.type !== 'FAMILY_OF' && (mids.has(e.source) || mids.has(e.target)));
    const ids = new Set<string>(mids);
    edges.forEach(e => { ids.add(e.source); ids.add(e.target); });
    const fam = d.edges.filter(e => e.type === 'FAMILY_OF' && ids.has(e.source) && ids.has(e.target));
    const nodes = d.nodes.filter(n => ids.has(n.id) && (n.label !== 'Memory' || mids.has(n.id)));
    const keep = new Set(nodes.map(n => n.id));
    return { nodes, edges: [...edges, ...fam].filter(e => keep.has(e.source) && keep.has(e.target)) };
  }

  async related(memoryId: string, limit = 3) {
    const rows = await this.b(b => b.related(memoryId));
    const best = new Map<string, { via: string; weight: number; count: number }>();
    for (const r of rows) {
      const p = best.get(r.memoryId);
      if (!p) best.set(r.memoryId, { via: r.via, weight: r.weight, count: 1 });
      else { p.count++; if (r.weight > p.weight) { p.via = r.via; p.weight = r.weight; } }
    }
    return [...best.entries()].sort((a, b) => b[1].weight + b[1].count - (a[1].weight + a[1].count)).slice(0, limit).map(([memoryId, v]) => ({ memoryId, via: v.via }));
  }

  async stats() {
    const s = await this.b(b => b.stats());
    return { ...s, engine: this.engine };
  }

  // ── GBrain mirror ──

  async deepRecall(query: string, opts: { visibleMemoryIds?: string[]; limit?: number } = {}): Promise<GraphSearchHit[]> {
    const gb = this.gbrain;
    const q = query.trim();
    if (!gb || !q) return [];
    const limit = opts.limit ?? 3;
    const rows = await gb.query(q, Math.max(limit * 2, 5));
    if (!rows.length) return [];
    // GBrain lowercases slugs, so hits are resolved through this graph's own Memory nodes (never trusted as ids)
    const d = await this.b(b => b.dump());
    const bySlug = new Map<string, GraphNode>();
    for (const n of d.nodes) if (n.label === 'Memory') bySlug.set(gb.memorySlug(String(n.props?.memoryId ?? n.id.slice('memory:'.length))), n);
    const visible = opts.visibleMemoryIds ? new Set(opts.visibleMemoryIds) : undefined;
    const words = [...new Set(variants(q))];
    const hits: GraphSearchHit[] = [];
    for (const r of rows) {
      const node = bySlug.get(r.slug);
      const memoryId = node ? String(node.props?.memoryId ?? node.id.slice('memory:'.length)) : undefined;
      if (!node || !memoryId || (visible && !visible.has(memoryId)) || hits.some(h => h.memoryId === memoryId)) continue;
      const text = [node.name, node.props?.summary, node.props?.story].filter(x => typeof x === 'string').join(' ');
      hits.push({
        memoryId, score: r.score, via: 'gbrain',
        matched: words.filter(w => text.includes(w)),   // empty for a purely semantic hit
        path: { nodes: [node], edges: [] },
        cypher: `gbrain query ${JSON.stringify(q)} where tachi_kind = memory → ${r.slug}${r.evidence ? ` (${r.evidence})` : ''}`,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  async backfillMirror(memories: Memory[], seniorName: string): Promise<void> {
    const gb = this.gbrain;
    if (!gb || !memories.length) return;
    try { if (!(await gb.isEmpty())) return; } catch (e) { console.warn(`[graph] GBrain backfill skipped: ${e instanceof Error ? e.message : e}`); return; }
    console.log(`[graph] GBrain mirror is empty: copying ${memories.length} memories`);
    for (const m of memories) {
      void gb.upsertMemory(m, memoryToDelta(m));
      for (const p of m.people) if (p.relation) void gb.linkFamily(p.name, p.relation, seniorName);
    }
  }

  flushMirror(): Promise<void> { return this.gbrain?.flush() ?? Promise.resolve(); }

  mirrorStatus(): MirrorStatus | null { return this.gbrain?.status() ?? null; }
}
