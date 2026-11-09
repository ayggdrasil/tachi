// Shared server context (singleton). Filled by createApp() or the reset script.
import type { Server, Socket } from 'socket.io';
import type { Brain } from '../brain/contract';
import type { GraphStore } from '../graph/contract';
import type { Db } from '../db';
import type { ClientToServerEvents, ID, ServerToClientEvents } from '../../shared/types';

export interface SocketData { userId?: ID }
export type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type Sock = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface Ctx {
  io: IO;
  db: Db;
  graph: GraphStore;
  brain: Brain;
  dataDir: string;
  rootDir: string;
  /** natural typing pause before Tachi replies (ms, >= 700 in production) */
  paceMs: number;
  /** bumps on reset; delayed callbacks from an older generation are dropped */
  gen: number;
  /** userId -> socket ids that claimed that persona */
  claims: Map<ID, Set<string>>;
  /** socket ids that connected from the Director stage (embedded phones) */
  assisted: Set<string>;
  queues: Map<string, Promise<void>>;
  lanUrls: string[];
}

export const ctx = { gen: 0, claims: new Map(), assisted: new Set(), queues: new Map(), lanUrls: [], paceMs: 800 } as unknown as Ctx;
