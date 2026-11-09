import type { GraphDelta, GraphEdge, GraphNode, Memory } from '../../shared/types';

export interface EntityMatch { node: GraphNode; memoryId: string; edge: GraphEdge }
export interface TextMatch { memoryId: string; field: 'title' | 'story' }
export interface RelatedRow { memoryId: string; via: string; weight: number }

/** Low-level storage; search scoring & path assembly live in the store wrapper. */
export interface Backend {
  readonly engine: 'kuzu' | 'memory';
  init(): Promise<void>;
  clear(): Promise<void>;
  upsert(memory: Memory, delta: GraphDelta): Promise<void>;
  linkFamily(personName: string, relation: string, seniorName: string): Promise<void>;
  entityMatches(keyword: string): Promise<EntityMatch[]>;
  textMatches(keyword: string): Promise<TextMatch[]>;
  memoryNode(memoryId: string): Promise<GraphNode | undefined>;
  related(memoryId: string): Promise<RelatedRow[]>;
  nodeNames(): Promise<string[]>;
  /** Whole graph (nodes with full props + edges); filtering happens in the wrapper. */
  dump(): Promise<GraphDelta>;
  stats(): Promise<{ nodes: number; edges: number }>;
}
