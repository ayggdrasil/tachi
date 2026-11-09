// Demo reset: wipe sqlite + graph, reseed, keep persona claims.
import { seed } from '../db/seed';
import { ctx } from './ctx';
import { warn } from '../util/misc';

export async function resetDemo(): Promise<void> {
  ctx.gen++;
  ctx.queues.clear();
  ctx.db.wipe();
  try { await ctx.graph.clear(); } catch (e) { warn('graph clear failed:', e); }
  await seed();
  // personas still held by connected devices stay claimed
  for (const [userId, socks] of ctx.claims) {
    if (!socks.size) continue;
    const u = ctx.db.users.get(userId);
    if (u) ctx.db.users.put({ ...u, isBot: false });
  }
  ctx.io?.emit('reset');
}
