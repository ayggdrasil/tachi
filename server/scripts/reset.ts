// Standalone reset: `npm run reset` wipes data/tachi.db + the graph and reseeds.
import '../util/env';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGraphStore } from '../graph/index';
import { openDb } from '../db';
import { ctx } from '../orchestrator/ctx';
import { resetDemo } from '../orchestrator/reset';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(root, 'data');
Object.assign(ctx, { db: openDb(dataDir), graph: createGraphStore({ dataDir }), dataDir, rootDir: root, io: undefined });
await ctx.graph.init();
const t = Date.now();
await resetDemo();
console.log(`[tachi] reset done in ${Date.now() - t}ms`);
ctx.db.close();
process.exit(0);
