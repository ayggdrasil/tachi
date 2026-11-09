// In-memory graph backend (fallback + mirror), optionally persisted to graph.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GraphDelta, GraphEdge, GraphNode, Memory } from '../../shared/types';
import type { Backend, EntityMatch, RelatedRow, TextMatch } from './backend';
import { edgeId, personId } from './delta';

const WEIGHT: Record<string, number> = { Place: 3, Person: 2, Event: 2, Era: 1, Topic: 1, Emotion: 0 };

export class MemoryBackend implements Backend {
  readonly engine = 'memory' as const;
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  constructor(private persistPath?: string) {}

  async init() {
    if (this.persistPath && existsSync(this.persistPath)) {
      try {
        const d = JSON.parse(readFileSync(this.persistPath, 'utf8')) as GraphDelta;
        d.nodes.forEach(n => this.nodes.set(n.id, n));
        d.edges.forEach(e => this.edges.set(e.id, e));
      } catch { /* corrupt file → start empty */ }
    }
  }
  private save() {
    if (!this.persistPath) return;
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      writeFileSync(this.persistPath, JSON.stringify({ nodes: [...this.nodes.values()], edges: [...this.edges.values()] }));
    } catch { /* non-fatal */ }
  }
  load(d: GraphDelta) {
    this.nodes = new Map(d.nodes.map(n => [n.id, n]));
    this.edges = new Map(d.edges.map(e => [e.id, e]));
  }
  async clear() { this.nodes.clear(); this.edges.clear(); this.save(); }

  async upsert(memory: Memory, delta: GraphDelta) {
    const mid = `memory:${memory.id}`;
    for (const [id, e] of this.edges) if (e.type !== 'FAMILY_OF' && (e.source === mid || e.target === mid)) this.edges.delete(id);
    for (const n of delta.nodes) {
      const prev = this.nodes.get(n.id);
      // keep an existing person relation if the new one is empty
      const props = n.label === 'Person' && prev?.props?.relation && !n.props?.relation ? { ...n.props, relation: prev.props.relation } : n.props;
      this.nodes.set(n.id, { ...n, props });
    }
    delta.edges.forEach(e => this.edges.set(e.id, e));
    this.prune();
    this.save();
  }
  /** Drop entity nodes that no longer connect to anything. */
  private prune() {
    const used = new Set<string>();
    for (const e of this.edges.values()) { used.add(e.source); used.add(e.target); }
    for (const [id, n] of this.nodes) if (n.label !== 'Memory' && !used.has(id)) this.nodes.delete(id);
  }

  async linkFamily(personName: string, relation: string, seniorName: string) {
    const a = personId(personName), b = personId(seniorName);
    if (!this.nodes.has(a)) this.nodes.set(a, { id: a, label: 'Person', name: personName, props: { relation } });
    if (!this.nodes.has(b)) this.nodes.set(b, { id: b, label: 'Person', name: seniorName, props: { relation: '본인' } });
    const id = edgeId('FAMILY_OF', a, b);
    this.edges.set(id, { id, type: 'FAMILY_OF', source: a, target: b, props: { relation } });
    this.save();
  }

  async entityMatches(keyword: string): Promise<EntityMatch[]> {
    const out: EntityMatch[] = [];
    for (const e of this.edges.values()) {
      if (e.type === 'FAMILY_OF') continue;
      const s = this.nodes.get(e.source), t = this.nodes.get(e.target);
      if (!s || !t) continue;
      const mem = s.label === 'Memory' ? s : t.label === 'Memory' ? t : undefined;
      const ent = mem === s ? t : s;
      if (!mem || ent.label === 'Memory') continue;
      const en = ent.name.toLowerCase(), kw = keyword.toLowerCase();
      if (ent.name.length >= 2 && (en.includes(kw) || kw.includes(en))) out.push({ node: ent, memoryId: String(mem.props?.memoryId), edge: e });
    }
    return out;
  }
  async textMatches(keyword: string): Promise<TextMatch[]> {
    const out: TextMatch[] = [];
    for (const n of this.nodes.values()) {
      if (n.label !== 'Memory') continue;
      const id = String(n.props?.memoryId);
      const kw = keyword.toLowerCase();
      if (String(n.props?.title ?? n.name).toLowerCase().includes(kw)) out.push({ memoryId: id, field: 'title' });
      else if (String(n.props?.story ?? '').toLowerCase().includes(kw)) out.push({ memoryId: id, field: 'story' });
    }
    return out;
  }
  async memoryNode(memoryId: string) { return this.nodes.get(`memory:${memoryId}`); }

  async related(memoryId: string): Promise<RelatedRow[]> {
    const mid = `memory:${memoryId}`;
    const mine = new Map<string, GraphNode>();
    for (const e of this.edges.values()) {
      if (e.type === 'FAMILY_OF') continue;
      const other = e.source === mid ? e.target : e.target === mid ? e.source : undefined;
      if (other && this.nodes.has(other)) mine.set(other, this.nodes.get(other)!);
    }
    const out: RelatedRow[] = [];
    for (const e of this.edges.values()) {
      if (e.type === 'FAMILY_OF') continue;
      for (const [a, b] of [[e.source, e.target], [e.target, e.source]] as const) {
        if (mine.has(a) && b.startsWith('memory:') && b !== mid) {
          const n = mine.get(a)!;
          out.push({ memoryId: b.slice('memory:'.length), via: n.name, weight: WEIGHT[n.label] ?? 0 });
        }
      }
    }
    return out;
  }

  async nodeNames() { return [...new Set([...this.nodes.values()].filter(n => n.label !== 'Memory').map(n => n.name))]; }
  async dump(): Promise<GraphDelta> { return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] }; }
  async stats() { return { nodes: this.nodes.size, edges: this.edges.size }; }
}
