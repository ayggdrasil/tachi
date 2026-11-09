// Memory graph contract. FROZEN — Agent B implements `createGraphStore()` in server/graph/index.ts
// (Kùzu embedded graph DB at data/graph.kuzu, with an in-memory fallback if Kùzu fails to load).
import type { GraphDelta, GraphPath, Memory } from '../../shared/types';

export interface GraphSearchHit {
  memoryId: string;
  score: number;
  matched: string[];             // node names / keywords that matched
  path: GraphPath;               // shortest explanation path from the matched node(s) to the Memory node
  cypher: string;                // the Cypher query (or equivalent) used — displayed small in the UI
  /** Which engine found it: the primary graph (default) or the optional GBrain deep-recall mirror. */
  via?: 'graph' | 'gbrain';
}

/** Health of the optional GBrain mirror (null from mirrorStatus() when it is not configured). */
export interface MirrorStatus {
  engine: 'gbrain';
  url: string;
  prefix: string;
  state: 'starting' | 'ok' | 'error';
  pending: number;               // queued writes not yet attempted
  lastError?: string;
  lastOkAt?: string;
}

export interface GraphStore {
  /** 'kuzu' when the real graph DB is in use, 'memory' for the fallback. */
  readonly engine: 'kuzu' | 'memory';
  init(): Promise<void>;
  /** Drop everything (used by demo reset before re-seeding). */
  clear(): Promise<void>;
  /** Insert/update a memory and its entity nodes + edges. Returns the nodes/edges created or touched. */
  upsertMemory(memory: Memory): Promise<GraphDelta>;
  /** Link family members (Person→Person FAMILY_OF {relation}). Idempotent. */
  linkFamily(personName: string, relation: string, seniorName: string): Promise<void>;
  /** Keyword search across node names (Place/Person/Era/Event/Emotion/Topic), memory titles & stories. */
  search(keywords: string[], opts?: { visibleMemoryIds?: string[]; limit?: number }): Promise<GraphSearchHit[]>;
  /** All node names (for intent keyword spotting). */
  nodeNames(): Promise<string[]>;
  /** Subgraph around the given memories (all if omitted). */
  subgraph(memoryIds?: string[]): Promise<GraphDelta>;
  /** Memories related to a memory through shared nodes (for proactive prompts / alternatives). */
  related(memoryId: string, limit?: number): Promise<{ memoryId: string; via: string }[]>;
  stats(): Promise<{ nodes: number; edges: number; engine: string }>;

  // ── optional GBrain mirror (TACHI_GBRAIN_URL + TACHI_GBRAIN_TOKEN). Every method is a no-op without it. ──
  // Writes above are mirrored automatically (queued, never blocking). Kùzu stays the source for search().
  /** Free-text recall over the mirror (hybrid/semantic search); hits are re-resolved against this graph. [] when off or failing. */
  deepRecall(query: string, opts?: { visibleMemoryIds?: string[]; limit?: number }): Promise<GraphSearchHit[]>;
  /** Copy existing memories into an empty mirror once (first boot with GBrain on an existing database). */
  backfillMirror(memories: Memory[], seniorName: string): Promise<void>;
  /** Resolves when every queued mirror write has been attempted. */
  flushMirror(): Promise<void>;
  mirrorStatus(): MirrorStatus | null;
}
