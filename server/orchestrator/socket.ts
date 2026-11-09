// Socket.IO wiring: hello/claims/presence, event handlers, privacy/model/demo controls.
import { DIRECTOR_ID, SENIOR_ID } from '../../shared/constants';
import type { Memory, ModelKey, ProactiveKind, Visibility } from '../../shared/types';
import { ctx, type IO, type Sock } from './ctx';
import { buildBootstrap } from './bootstrap';
import {
  applyMemoryVisibility, emitPresence, enqueue, getPrivacy, patchDemo, resyncFamilyViewers, rotateHiddenPhotos, roomChannel, runWithGen, seesAll,
  setDemoClock, userChannel,
} from './core';
import { handleAction, handleIncoming } from './messages';
import { assistArtifact, artifactTask, updateArtifact } from './artifacts';
import { createRoom, inviteContact } from './rooms';
import { getOrCreateDm } from './dm';
import { getLocale, isLocale } from './locale';
import { st } from '../i18n';
import { fireProactive, postReport } from './proactive';
import { forceClosePoll } from './scheduling';
import { executeTask, normalizeTasks, runFollowUps, setTaskStatus } from './tasks';
import { emitArtifact } from './artifacts';
import { nowIso } from '../util/misc';
import { resetDemo } from './reset';
import { connectApiKey } from './llmKeys';
import { sleep, warn } from '../util/misc';

const busy = (): string => st('err.busy');

/** Run a handler body under the current demo generation; refuses while reseeding. */
const safe = (name: string, fn: () => unknown | Promise<unknown>, sock?: Sock) => {
  if (ctx.resetting) { sock?.emit('toast', { text: busy() }); return; }
  runWithGen(ctx.gen, () => Promise.resolve().then(fn)).catch(e => {
    warn(`${name} failed:`, e);
    sock?.emit('toast', { text: st('err.retry') });
  });
};

function claim(sock: Sock, userId: string): void {
  if (userId === DIRECTOR_ID) return;
  const set = ctx.claims.get(userId) ?? new Set<string>();
  set.add(sock.id);
  ctx.claims.set(userId, set);
  const u = ctx.db.users.get(userId);
  if (u && u.isBot) {
    const updated = { ...u, isBot: false };
    ctx.db.users.put(updated);
    ctx.io.emit('user:upsert', updated);
  }
  emitPresence();
}

function release(sock: Sock): void {
  const userId = sock.data.userId;
  if (!userId) return;
  const set = ctx.claims.get(userId);
  if (set) {
    set.delete(sock.id);
    if (!set.size) {
      ctx.claims.delete(userId);
      const u = ctx.db.users.get(userId);
      if (u && !u.isBot) {
        const updated = { ...u, isBot: true };
        ctx.db.users.put(updated);
        ctx.io.emit('user:upsert', updated);
      }
    }
  }
  sock.data.userId = undefined;
  emitPresence();
}

function setMemoryVisibility(userId: string, memoryId: string, visibility: Visibility): void {
  const m: Memory | undefined = ctx.db.memories.get(memoryId);
  if (!m || m.ownerId !== userId || (visibility !== 'family' && visibility !== 'private') || m.visibility === visibility) return;
  applyMemoryVisibility(memoryId, visibility); // senior/director updated live; family clients re-hello for a projected bootstrap + graph
}

/** Director-only demo commands. */
function requireDirector(sock: Sock): boolean {
  if (sock.data.userId === DIRECTOR_ID) return true;
  sock.emit('toast', { text: st('err.directorOnly') });
  return false;
}

/** Ping the model's provider (not awaited by callers); publishes healthy/latency via model:update and warns the Director when it fails. */
export async function preflightModel(key?: ModelKey): Promise<void> {
  const gen = ctx.gen;
  try {
    const ms = ctx.brain.getModelState();
    const target = key ?? ms.active;
    const opt = ms.options.find(o => o.key === target);
    if (!opt || opt.provider === 'mock' || !opt.available) return;
    const r = await ctx.brain.preflight(target);
    if (gen !== ctx.gen) return;
    const after = ctx.brain.getModelState();
    ctx.io.emit('model:update', after);
    if (!r.ok && after.active === target) {
      warn(`preflight failed for ${target}: ${r.error ?? '?'}`);
      ctx.io.to(userChannel(DIRECTOR_ID)).emit('toast', { text: st('toast.modelDown') });
    }
  } catch (e) { warn('preflight crashed:', e); }
}

export function attachSocketHandlers(io: IO): void {
  io.on('connection', (rawSock: Sock) => {
    // every handler runs under the demo generation that was current when the event arrived
    const sock = rawSock;
    const origOn = sock.on.bind(sock) as (ev: string, fn: (...a: unknown[]) => void) => unknown;
    (sock as unknown as { on: unknown }).on = (ev: string, fn: (...a: unknown[]) => void) =>
      origOn(ev, (...a: unknown[]) => runWithGen(ctx.gen, () => fn(...a)));

    sock.on('hello', (p, ack) => {
      if (typeof ack !== 'function') return;
      runWithGen(ctx.gen, async () => {
        try {
          for (let i = 0; ctx.resetting && i < 100; i++) await sleep(50);
          const userId = p?.userId;
          if (typeof userId !== 'string' || (userId !== DIRECTOR_ID && (!ctx.db.users.get(userId) || userId === 'tachi'))) {
            ack({ error: st('err.unknownUser', { id: String(userId) }) });
            return;
          }
          const dirKey = process.env.TACHI_DIRECTOR_KEY;
          if (userId === DIRECTOR_ID && dirKey && p.key !== dirKey) {
            ack({ error: st('err.directorKey') });
            return;
          }
          // optional owner credential for the senior persona (demo default: unset = open)
          const seniorKey = process.env.TACHI_SENIOR_KEY;
          if (userId === SENIOR_ID && seniorKey && p.key !== seniorKey && !(dirKey && p.key === dirKey)) {
            warn('hello refused: senior key missing/wrong');
            ack({ error: st('err.seniorKey') });
            return;
          }
          if (sock.data.userId && sock.data.userId !== userId) release(sock);
          for (const r of [...sock.rooms]) if (r !== sock.id) void sock.leave(r);
          sock.data.userId = userId;
          void sock.join(userChannel(userId));
          for (const r of ctx.db.rooms.all()) if (userId === DIRECTOR_ID || r.memberIds.includes(userId)) void sock.join(roomChannel(r.id));
          if (p.assisted) ctx.assisted.add(sock.id); else ctx.assisted.delete(sock.id);
          claim(sock, userId);
          ack(await buildBootstrap(userId));
        } catch (e) {
          warn('hello failed:', e);
          ack({ error: st('err.connect') });
        }
      });
    });

    const uid = () => sock.data.userId;

    sock.on('message:send', p => {
      const u = uid();
      if (u && p) safe('message:send', () => handleIncoming(u, p.roomId, { text: p.text, photoUrl: p.photoUrl }), sock);
    });
    sock.on('action', (p, ack) => {
      const reply = (r: { ok: boolean; error?: string; message?: string }) => { if (typeof ack === 'function') ack(r); };
      const u = uid();
      if (!u || !p) { reply({ ok: false, error: st('err.connectFirst') }); return; }
      if (ctx.resetting) { sock.emit('toast', { text: busy() }); reply({ ok: false, error: busy() }); return; }
      runWithGen(ctx.gen, () => handleAction(u, p)).then(reply).catch(e => {
        warn('action failed:', e);
        sock.emit('toast', { text: st('err.retry') });
        reply({ ok: false, error: st('err.generic') });
      });
    });
    sock.on('typing', p => { const u = uid(); if (u && p?.roomId) sock.to(roomChannel(p.roomId)).emit('typing', { roomId: p.roomId, userId: u }); });

    sock.on('room:create', (p, ack) => {
      const u = uid();
      if (typeof ack !== 'function') return;
      if (!u || u === DIRECTOR_ID || ctx.resetting) { ack({ error: st('room.cannotCreate') }); return; }
      try { ack(createRoom(u, p?.title, p?.memberIds)); } catch (e) { warn('room:create', e); ack({ error: st('room.createFailed') }); }
    });
    sock.on('room:dm', (p, ack) => {
      const u = uid();
      if (typeof ack !== 'function') return;
      if (!u || u === DIRECTOR_ID || ctx.resetting || typeof p?.userId !== 'string') { ack({ error: st('dm.unavailable') }); return; }
      try { ack(getOrCreateDm(u, p.userId)); } catch (e) { warn('room:dm', e); ack({ error: st('dm.unavailable') }); }
    });
    sock.on('locale:set', p => {
      const u = uid();
      if (!u || !isLocale(p?.locale)) return;
      if (!(u === DIRECTOR_ID || u === SENIOR_ID)) { sock.emit('toast', { text: st('err.localeOwnerOnly') }); return; }
      const next = p.locale;
      if (next === getLocale()) return; // nothing to switch (never wipe the demo for a no-op)
      safe('locale:set', () => resetDemo(next), sock); // re-seeds everything in the new language, then emits 'reset'
    });
    sock.on('room:invite', p => {
      const u = uid();
      const room = p && ctx.db.rooms.get(p.roomId);
      if (u && room && (u === DIRECTOR_ID || room.memberIds.includes(u))) safe('room:invite', () => inviteContact(p.roomId, p.contactId, u), sock);
    });

    sock.on('artifact:update', p => { const u = uid(); if (u && p) safe('artifact:update', () => updateArtifact(u, p.artifactId, p.patch), sock); });
    sock.on('artifact:task', p => { const u = uid(); if (u && p) safe('artifact:task', () => artifactTask(u, p), sock); });
    sock.on('artifact:assist', p => { const u = uid(); if (u && p) safe('artifact:assist', () => assistArtifact(u, p.artifactId), sock); });
    sock.on('artifact:task:execute', (p, ack) => {
      const reply = (r: { ok: boolean; error?: string; message?: string }) => { if (typeof ack === 'function') ack(r); };
      const u = uid();
      if (!u || !p || typeof p.artifactId !== 'string' || typeof p.taskId !== 'string') { reply({ ok: false, error: st('err.badRequest') }); return; }
      if (ctx.resetting) { sock.emit('toast', { text: busy() }); reply({ ok: false, error: busy() }); return; }
      const room = ctx.db.rooms.get(ctx.db.artifacts.get(p.artifactId)?.roomId ?? '');
      const run = () => executeTask(u, p.artifactId, p.taskId, p.kind);
      // serialize with the artifact's room so Tachi's lines keep their order
      const job = room ? new Promise<{ ok: boolean; error?: string; message?: string }>(res => { void enqueue(room.id, async () => { res(await run()); }).then(() => res({ ok: false, error: st('err.cancelledReset') })); }) : runWithGen(ctx.gen, run);
      job.then(r => { if (!r.ok && r.message) sock.emit('toast', { text: r.message }); reply(r); }).catch(e => {
        warn('artifact:task:execute failed:', e);
        sock.emit('toast', { text: st('err.retry') });
        reply({ ok: false, error: st('err.generic') });
      });
    });
    sock.on('artifact:task:status', p => {
      const u = uid();
      if (!u || !p) return;
      safe('artifact:task:status', () => {
        const a = ctx.db.artifacts.get(p.artifactId);
        const room = a && ctx.db.rooms.get(a.roomId);
        const t = a?.tasks.find(x => x.id === p.taskId);
        if (!a || !room || !t || !(u === DIRECTOR_ID || room.memberIds.includes(u))) return;
        if (!['todo', 'in_progress', 'done', 'blocked'].includes(p.status)) return;
        setTaskStatus(t, p.status, u === DIRECTOR_ID ? 'tachi' : u);
        a.updatedBy = u === DIRECTOR_ID ? 'director' : u;
        a.updatedAt = nowIso();
        ctx.db.artifacts.put(normalizeTasks(a));
        emitArtifact(a);
      }, sock);
    });

    sock.on('privacy:set', p => {
      const u = uid();
      if (!u || !p || !(seesAll(u))) return;
      safe('privacy:set', () => {
        const priv = { ...getPrivacy() };
        if (!(p.category in priv) || (p.visibility !== 'family' && p.visibility !== 'private')) return;
        priv[p.category] = p.visibility;
        ctx.db.kv.set('privacy', priv);
        if (p.category === 'memory' && p.visibility === 'private') rotateHiddenPhotos();
        resyncFamilyViewers(); // privacy:update + health to everyone, projected re-hello for family clients
      }, sock);
    });
    sock.on('memory:visibility', p => { const u = uid(); if (u && p) safe('memory:visibility', () => setMemoryVisibility(u, p.memoryId, p.visibility), sock); });

    sock.on('model:set', p => {
      if (!requireDirector(sock)) return;
      safe('model:set', () => {
        const wanted = ctx.brain.getModelState().options.find(o => o.key === p?.key);
        if (!wanted || !wanted.available) { sock.emit('toast', { text: st('toast.modelUnavailable') }); return; }
        const state = ctx.brain.setActiveModel(p.key);
        ctx.db.kv.set('model', state.active);
        io.emit('model:update', state);
        void preflightModel(p.key); // never blocks the switch
      }, sock);
    });

    sock.on('model:apikey', (p, ack) => {
      const done = typeof ack === 'function' ? ack : () => {};
      if (!requireDirector(sock)) { done({ ok: false, error: 'forbidden' }); return; }
      // tested against the provider before it is kept; memory only unless remember (then the server's .env too). Never logged or sent to clients.
      connectApiKey(p?.provider, p?.key, { remember: !!p?.remember })
        .then(done)
        .catch(e => { warn('model:apikey failed:', e); done({ ok: false, error: 'other' }); });
    });

    sock.on('demo:invite', p => {
      if (!p || !requireDirector(sock)) return;
      safe('demo:invite', () => inviteContact(p.roomId, p.contactId, DIRECTOR_ID), sock);
    });
    sock.on('demo:proactive', p => { if (requireDirector(sock)) safe('demo:proactive', () => fireProactive((p?.kind as ProactiveKind | undefined) ?? undefined), sock); });
    sock.on('demo:report', () => { if (requireDirector(sock)) safe('demo:report', () => postReport(false), sock); });
    sock.on('demo:reset', () => { if (requireDirector(sock)) safe('demo:reset', () => resetDemo(), sock); });
    sock.on('demo:bots', p => { if (requireDirector(sock)) safe('demo:bots', () => { patchDemo({ botsEnabled: !!p?.enabled }); }, sock); });
    sock.on('demo:clock', p => {
      if (requireDirector(sock)) safe('demo:clock', () => { if (!setDemoClock(p?.time ?? null)) sock.emit('toast', { text: st('toast.badClock') }); }, sock);
    });
    sock.on('demo:closePoll', () => {
      if (!requireDirector(sock)) return;
      safe('demo:closePoll', async () => {
        if (!(await forceClosePoll())) sock.emit('toast', { text: st('toast.noPoll') });
      }, sock);
    });
    sock.on('demo:followups', () => {
      if (!requireDirector(sock)) return;
      safe('demo:followups', async () => {
        const n = await runFollowUps();
        sock.emit('toast', { text: n ? st('task.followups.done', { n, s: n === 1 ? '' : 's' }) : st('task.followups.none') });
      }, sock);
    });
    sock.on('demo:say', p => {
      if (!p || !requireDirector(sock)) return;
      safe('demo:say', () => handleIncoming(p.userId, p.roomId, { text: p.text, photoUrl: p.photoUrl }), sock);
    });

    sock.on('disconnect', () => { release(sock); ctx.assisted.delete(sock.id); });
  });
}

