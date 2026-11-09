// Demo reset: wipe sqlite + graph, reseed, keep persona claims.
import { seed } from '../db/seed';
import { ctx } from './ctx';
import { runWithGen, syncClock } from './core';
import { warn } from '../util/misc';

export async function resetDemo(): Promise<void> {
  if (ctx.resetting) return;
  ctx.resetting = true;
  ctx.gen++; // every in-flight flow of the old generation is now stale: its writes and emits are dropped
  ctx.queues.clear();
  const gen = ctx.gen;
  try {
    await runWithGen(gen, async () => {
      syncClock(0);
      ctx.db.wipe();
      try { await ctx.graph.clear(); } catch (e) { warn('graph clear failed:', e); }
      await seed();
      // personas still held by connected devices stay claimed
      for (const [userId, socks] of ctx.claims) {
        if (!socks.size) continue;
        const u = ctx.db.users.get(userId);
        if (u) ctx.db.users.put({ ...u, isBot: false });
      }
    });
  } finally {
    ctx.resetting = false;
  }
  ctx.io?.emit('reset');
}
