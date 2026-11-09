// Kùzu embedded graph backend (Cypher).
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GraphDelta, GraphEdge, GraphNode, GraphNodeLabel, GraphRelType, Memory } from '../../shared/types';
import type { Backend, EntityMatch, RelatedRow, TextMatch } from './backend';
import { ENTITY_DEFS, edgeId, memoryNodeId, personId } from './delta';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const SCHEMA = [
  'CREATE NODE TABLE IF NOT EXISTS Memory(id STRING, name STRING, title STRING, summary STRING, story STRING, year INT64, era STRING, season STRING, visibility STRING, photoUrl STRING, createdAt STRING, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Person(id STRING, name STRING, relation STRING, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Place(id STRING, name STRING, region STRING, lat DOUBLE, lng DOUBLE, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Era(id STRING, name STRING, year INT64, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Event(id STRING, name STRING, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Emotion(id STRING, name STRING, PRIMARY KEY(id))',
  'CREATE NODE TABLE IF NOT EXISTS Topic(id STRING, name STRING, PRIMARY KEY(id))',
  'CREATE REL TABLE IF NOT EXISTS APPEARS_IN(FROM Person TO Memory)',
  'CREATE REL TABLE IF NOT EXISTS TAKEN_AT(FROM Memory TO Place)',
  'CREATE REL TABLE IF NOT EXISTS IN_ERA(FROM Memory TO Era)',
  'CREATE REL TABLE IF NOT EXISTS ABOUT(FROM Memory TO Event)',
  'CREATE REL TABLE IF NOT EXISTS EVOKES(FROM Memory TO Emotion)',
  'CREATE REL TABLE IF NOT EXISTS MENTIONS(FROM Memory TO Topic)',
  'CREATE REL TABLE IF NOT EXISTS FAMILY_OF(FROM Person TO Person, relation STRING)',
];

const EXTRA_COLS: Record<string, string[]> = { Person: ['relation'], Place: ['region', 'lat', 'lng'], Era: ['year'] };
const ENTITY_LABELS: GraphNodeLabel[] = ['Person', 'Place', 'Era', 'Event', 'Emotion', 'Topic'];
const REL_TYPES: GraphRelType[] = ['APPEARS_IN', 'TAKEN_AT', 'IN_ERA', 'ABOUT', 'EVOKES', 'MENTIONS', 'FAMILY_OF'];
const WEIGHT: Record<string, number> = { Place: 3, Person: 2, Event: 2, Era: 1, Topic: 1 };

const dbCache = new Map<string, Any>();

export class KuzuBackend implements Backend {
  readonly engine = 'kuzu' as const;
  private db: Any;
  private conn: Any;
  private chain: Promise<unknown> = Promise.resolve();
  constructor(private dbPath: string) {}

  async init() {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    const mod: Any = await import('kuzu');
    const kuzu = mod.default ?? mod;
    this.db = dbCache.get(this.dbPath) ?? new kuzu.Database(this.dbPath);
    dbCache.set(this.dbPath, this.db);
    this.conn = new kuzu.Connection(this.db);
    for (const q of SCHEMA) await this.exec(q);
  }

  /** Serialize every statement on the single connection. */
  private exec(cypher: string, params?: Record<string, unknown>): Promise<Any[]> {
    const run = async () => {
      let res: Any;
      if (params) { const ps = await this.conn.prepare(cypher); if (!ps.isSuccess()) throw new Error(ps.getErrorMessage()); res = await this.conn.execute(ps, params); }
      else res = await this.conn.query(cypher);
      const r = Array.isArray(res) ? res[res.length - 1] : res;
      return r.getAll();
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next as Promise<Any[]>;
  }

  async clear() { await this.exec('MATCH (n) DETACH DELETE n'); }

  async upsert(m: Memory, delta: GraphDelta) {
    const mid = memoryNodeId(m.id);
    // remove old edges of this memory, then re-create
    for (const t of ['TAKEN_AT', 'IN_ERA', 'ABOUT', 'EVOKES', 'MENTIONS']) await this.exec(`MATCH (m:Memory {id:$id})-[r:${t}]->() DELETE r`, { id: mid });
    await this.exec('MATCH ()-[r:APPEARS_IN]->(m:Memory {id:$id}) DELETE r', { id: mid });
    for (const n of delta.nodes) {
      const p = n.props ?? {};
      switch (n.label) {
        case 'Memory':
          await this.exec('MERGE (x:Memory {id:$id}) SET x.name=$name, x.title=$title, x.summary=$summary, x.story=$story, x.year=$year, x.era=$era, x.season=$season, x.visibility=$vis, x.photoUrl=$photo, x.createdAt=$created', {
            id: n.id, name: n.name, title: String(p.title ?? n.name), summary: String(p.summary ?? ''), story: String(p.story ?? ''), year: Number(p.year ?? 0),
            era: String(p.era ?? ''), season: String(p.season ?? ''), vis: String(p.visibility ?? 'family'), photo: String(p.photoUrl ?? ''), created: String(p.createdAt ?? ''),
          });
          break;
        case 'Person':
          await this.exec('MERGE (x:Person {id:$id}) ON CREATE SET x.name=$name, x.relation=$rel', { id: n.id, name: n.name, rel: String(p.relation ?? '') });
          if (p.relation) await this.exec('MATCH (x:Person {id:$id}) SET x.relation=$rel', { id: n.id, rel: String(p.relation) });
          break;
        case 'Place':
          await this.exec('MERGE (x:Place {id:$id}) SET x.name=$name, x.region=$region, x.lat=$lat, x.lng=$lng', { id: n.id, name: n.name, region: String(p.region ?? ''), lat: Number(p.lat ?? 0), lng: Number(p.lng ?? 0) });
          break;
        case 'Era':
          await this.exec('MERGE (x:Era {id:$id}) SET x.name=$name, x.year=$year', { id: n.id, name: n.name, year: Number(p.year ?? 0) });
          break;
        default:
          await this.exec(`MERGE (x:${n.label} {id:$id}) SET x.name=$name`, { id: n.id, name: n.name });
      }
    }
    const label = new Map(delta.nodes.map(n => [n.id, n.label]));
    for (const e of delta.edges) {
      await this.exec(`MATCH (a:${label.get(e.source)} {id:$a}), (b:${label.get(e.target)} {id:$b}) MERGE (a)-[:${e.type}]->(b)`, { a: e.source, b: e.target });
    }
    // prune orphaned entities (no edges left)
    for (const d of ENTITY_DEFS) {
      const pat = d.memoryIsSource ? `(n)<-[:${d.rel}]-()` : `(n)-[:${d.rel}]->()`;
      const orphans = await this.exec(`MATCH (n:${d.label}) WHERE NOT EXISTS { MATCH ${pat} } ${d.label === 'Person' ? 'AND NOT EXISTS { MATCH (n)-[:FAMILY_OF]-() }' : ''} RETURN n.id AS id`).catch(() => []);
      for (const o of orphans) await this.exec(`MATCH (n:${d.label} {id:$id}) DELETE n`, { id: o.id });
    }
  }

  async linkFamily(personName: string, relation: string, seniorName: string) {
    const a = personId(personName), b = personId(seniorName);
    await this.exec('MERGE (x:Person {id:$id}) ON CREATE SET x.name=$name, x.relation=$rel', { id: a, name: personName, rel: relation });
    await this.exec('MERGE (x:Person {id:$id}) ON CREATE SET x.name=$name, x.relation=$rel', { id: b, name: seniorName, rel: '본인' });
    await this.exec('MATCH (a:Person {id:$a}), (b:Person {id:$b}) MERGE (a)-[r:FAMILY_OF]->(b) SET r.relation=$rel', { a, b, rel: relation });
  }

  private entityNode(label: GraphNodeLabel, row: Record<string, Any>): GraphNode {
    const props: Record<string, unknown> = {};
    for (const c of EXTRA_COLS[label] ?? []) props[c] = row[`x_${c}`];
    return { id: row.x_id, label, name: row.x_name, props };
  }
  private selectCols(label: string): string {
    return ['id', 'name', ...(EXTRA_COLS[label] ?? [])].map(c => `n.${c} AS x_${c}`).join(', ');
  }

  async entityMatches(keyword: string): Promise<EntityMatch[]> {
    const out: EntityMatch[] = [];
    for (const d of ENTITY_DEFS) {
      const pat = d.memoryIsSource ? `(m:Memory)-[:${d.rel}]->(n:${d.label})` : `(n:${d.label})-[:${d.rel}]->(m:Memory)`;
      const rows = await this.exec(`MATCH ${pat} WHERE size(n.name) >= 2 AND (n.name CONTAINS $kw OR $kw CONTAINS n.name) RETURN ${this.selectCols(d.label)}, m.id AS mid`, { kw: keyword });
      for (const r of rows) {
        const node = this.entityNode(d.label, r);
        const src = d.memoryIsSource ? r.mid : node.id, dst = d.memoryIsSource ? node.id : r.mid;
        out.push({ node, memoryId: String(r.mid).slice('memory:'.length), edge: { id: edgeId(d.rel, src, dst), type: d.rel, source: src, target: dst } });
      }
    }
    return out;
  }

  async textMatches(keyword: string): Promise<TextMatch[]> {
    const rows = await this.exec('MATCH (m:Memory) RETURN m.id AS id, m.title AS title, m.story AS story');
    const out: TextMatch[] = [];
    for (const r of rows) {
      const memoryId = String(r.id).slice('memory:'.length);
      if (String(r.title).includes(keyword)) out.push({ memoryId, field: 'title' });
      else if (String(r.story).includes(keyword)) out.push({ memoryId, field: 'story' });
    }
    return out;
  }

  private memoryFromRow(r: Record<string, Any>): GraphNode {
    return {
      id: r.id, label: 'Memory', name: r.title,
      props: { memoryId: String(r.id).slice('memory:'.length), title: r.title, summary: r.summary, story: r.story, year: r.year || null, era: r.era || null, season: r.season || null, visibility: r.visibility, photoUrl: r.photoUrl || null, createdAt: r.createdAt },
    };
  }
  private static MEM_COLS = 'm.id AS id, m.title AS title, m.summary AS summary, m.story AS story, m.year AS year, m.era AS era, m.season AS season, m.visibility AS visibility, m.photoUrl AS photoUrl, m.createdAt AS createdAt';

  async memoryNode(memoryId: string) {
    const rows = await this.exec(`MATCH (m:Memory {id:$id}) RETURN ${KuzuBackend.MEM_COLS}`, { id: memoryNodeId(memoryId) });
    return rows[0] ? this.memoryFromRow(rows[0]) : undefined;
  }

  async related(memoryId: string): Promise<RelatedRow[]> {
    const out: RelatedRow[] = [];
    const mid = memoryNodeId(memoryId);
    for (const d of ENTITY_DEFS) {
      if (d.label === 'Emotion') continue;
      const a = d.memoryIsSource ? `(m:Memory {id:$id})-[:${d.rel}]->(n:${d.label})<-[:${d.rel}]-(o:Memory)` : `(m:Memory {id:$id})<-[:${d.rel}]-(n:${d.label})-[:${d.rel}]->(o:Memory)`;
      const rows = await this.exec(`MATCH ${a} WHERE o.id <> $id RETURN o.id AS oid, n.name AS via`, { id: mid });
      for (const r of rows) out.push({ memoryId: String(r.oid).slice('memory:'.length), via: r.via, weight: WEIGHT[d.label] ?? 0 });
    }
    return out;
  }

  async nodeNames() {
    const names = new Set<string>();
    for (const l of ENTITY_LABELS) for (const r of await this.exec(`MATCH (n:${l}) RETURN n.name AS name`)) names.add(r.name);
    return [...names];
  }

  async dump(): Promise<GraphDelta> {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    for (const r of await this.exec(`MATCH (m:Memory) RETURN ${KuzuBackend.MEM_COLS}`)) { const n = this.memoryFromRow(r); nodes.set(n.id, n); }
    for (const d of ENTITY_DEFS) {
      const pat = d.memoryIsSource ? `(m:Memory)-[:${d.rel}]->(n:${d.label})` : `(n:${d.label})-[:${d.rel}]->(m:Memory)`;
      for (const r of await this.exec(`MATCH ${pat} RETURN ${this.selectCols(d.label)}, m.id AS mid`)) {
        const n = this.entityNode(d.label, r);
        nodes.set(n.id, n);
        const src = d.memoryIsSource ? r.mid : n.id, dst = d.memoryIsSource ? n.id : r.mid;
        edges.push({ id: edgeId(d.rel, src, dst), type: d.rel, source: src, target: dst });
      }
    }
    for (const r of await this.exec('MATCH (a:Person)-[r:FAMILY_OF]->(b:Person) RETURN a.id AS aid, a.name AS an, a.relation AS ar, b.id AS bid, b.name AS bn, b.relation AS br, r.relation AS rel')) {
      nodes.set(r.aid, { id: r.aid, label: 'Person', name: r.an, props: { relation: r.ar } });
      nodes.set(r.bid, { id: r.bid, label: 'Person', name: r.bn, props: { relation: r.br } });
      edges.push({ id: edgeId('FAMILY_OF', r.aid, r.bid), type: 'FAMILY_OF', source: r.aid, target: r.bid, props: { relation: r.rel } });
    }
    return { nodes: [...nodes.values()], edges };
  }

  async stats() {
    let nodes = 0, edges = 0;
    for (const l of ['Memory', ...ENTITY_LABELS]) nodes += Number((await this.exec(`MATCH (n:${l}) RETURN count(*) AS c`))[0]?.c ?? 0);
    for (const t of REL_TYPES) {
      const [from, to] = t === 'APPEARS_IN' ? ['Person', 'Memory'] : t === 'FAMILY_OF' ? ['Person', 'Person'] : ['Memory', { TAKEN_AT: 'Place', IN_ERA: 'Era', ABOUT: 'Event', EVOKES: 'Emotion', MENTIONS: 'Topic' }[t]!];
      edges += Number((await this.exec(`MATCH (:${from})-[r:${t}]->(:${to}) RETURN count(*) AS c`))[0]?.c ?? 0);
    }
    return { nodes, edges };
  }
}
