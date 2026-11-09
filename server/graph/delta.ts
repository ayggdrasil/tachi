// Shared graph helpers: deterministic ids + Memory → nodes/edges.
import type { GraphDelta, GraphEdge, GraphNode, GraphNodeLabel, GraphRelType, Memory } from '../../shared/types';
import { placeById } from '../data/places';

export const memoryNodeId = (id: string) => `memory:${id}`;
export const personId = (name: string) => `person:${name}`;
export const edgeId = (type: GraphRelType, src: string, dst: string) => `${type}:${src}->${dst}`;

/** Entity tables, their relation to Memory and direction. */
export interface EntityDef { label: Exclude<GraphNodeLabel, 'Memory'>; rel: GraphRelType; memoryIsSource: boolean; alias: string }
export const ENTITY_DEFS: EntityDef[] = [
  { label: 'Person', rel: 'APPEARS_IN', memoryIsSource: false, alias: 'p' },
  { label: 'Place', rel: 'TAKEN_AT', memoryIsSource: true, alias: 'p' },
  { label: 'Era', rel: 'IN_ERA', memoryIsSource: true, alias: 'e' },
  { label: 'Event', rel: 'ABOUT', memoryIsSource: true, alias: 'e' },
  { label: 'Emotion', rel: 'EVOKES', memoryIsSource: true, alias: 'e' },
  { label: 'Topic', rel: 'MENTIONS', memoryIsSource: true, alias: 't' },
];
export const ENTITY_PRIORITY: Record<string, number> = { Place: 6, Person: 5, Event: 4, Topic: 3, Era: 2, Emotion: 1 };

export function memoryProps(m: Memory): Record<string, unknown> {
  return {
    memoryId: m.id, title: m.title, summary: m.summary, story: m.story, year: m.year ?? null, era: m.era ?? null, season: m.season ?? null,
    visibility: m.visibility, photoUrl: m.photoUrl ?? null, createdAt: m.createdAt,
  };
}

export function memoryToDelta(m: Memory): GraphDelta {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const mid = memoryNodeId(m.id);
  nodes.push({ id: mid, label: 'Memory', name: m.title, props: memoryProps(m) });
  const link = (type: GraphRelType, src: string, dst: string) => edges.push({ id: edgeId(type, src, dst), type, source: src, target: dst });
  for (const p of m.people) {
    const id = personId(p.name);
    nodes.push({ id, label: 'Person', name: p.name, props: { relation: p.relation ?? '' } });
    link('APPEARS_IN', id, mid);
  }
  if (m.place) {
    const gp = placeById(m.placeId);
    const id = `place:${m.placeId || m.place}`;
    nodes.push({ id, label: 'Place', name: m.place, props: { region: gp?.region ?? '', lat: gp?.lat ?? 0, lng: gp?.lng ?? 0 } });
    link('TAKEN_AT', mid, id);
  }
  if (m.year || m.era) {
    const id = `era:${m.year ?? m.era}`;
    nodes.push({ id, label: 'Era', name: m.year ? (/[가-힣]/.test(`${m.title}${m.era ?? ''}`) ? `${m.year}년` : `${m.year}`) : m.era!, props: { year: m.year ?? 0 } });
    link('IN_ERA', mid, id);
  }
  if (m.event) { const id = `event:${m.event}`; nodes.push({ id, label: 'Event', name: m.event }); link('ABOUT', mid, id); }
  for (const e of m.emotions) { const id = `emotion:${e}`; nodes.push({ id, label: 'Emotion', name: e }); link('EVOKES', mid, id); }
  for (const t of m.tags) { const id = `topic:${t}`; nodes.push({ id, label: 'Topic', name: t }); link('MENTIONS', mid, id); }
  return { nodes: dedupe(nodes), edges: dedupe(edges) };
}

function dedupe<T extends { id: string }>(xs: T[]): T[] {
  const seen = new Set<string>();
  return xs.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Human-readable Cypher shown under recall cards. */
export function cypherFor(label: string | undefined, keyword: string): string {
  const k = esc(keyword);
  switch (label) {
    case 'Place': return `MATCH (p:Place)<-[:TAKEN_AT]-(m:Memory) WHERE p.name CONTAINS '${k}' RETURN m`;
    case 'Person': return `MATCH (p:Person)-[:APPEARS_IN]->(m:Memory) WHERE p.name CONTAINS '${k}' RETURN m`;
    case 'Era': return `MATCH (e:Era)<-[:IN_ERA]-(m:Memory) WHERE e.name CONTAINS '${k}' RETURN m`;
    case 'Event': return `MATCH (e:Event)<-[:ABOUT]-(m:Memory) WHERE e.name CONTAINS '${k}' RETURN m`;
    case 'Emotion': return `MATCH (e:Emotion)<-[:EVOKES]-(m:Memory) WHERE e.name CONTAINS '${k}' RETURN m`;
    case 'Topic': return `MATCH (t:Topic)<-[:MENTIONS]-(m:Memory) WHERE t.name CONTAINS '${k}' RETURN m`;
    default: return `MATCH (m:Memory) WHERE m.title CONTAINS '${k}' OR m.story CONTAINS '${k}' RETURN m`;
  }
}
