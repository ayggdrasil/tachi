// Socket.IO wiring: hello/claims/presence, event handlers, privacy/model/demo controls.
import { DIRECTOR_ID } from '../../shared/constants';
import type { Memory, ProactiveKind, Visibility } from '../../shared/types';
import { ctx, type IO, type Sock } from './ctx';
import { buildBootstrap } from './bootstrap';
import {
  applyMemoryVisibility, emitPresence, getPrivacy, patchDemo, resyncFamilyViewers, roomChannel, runWithGen, seesAll,
  setDemoClock, userChannel,
} from './core';
import { handleAction, handleIncoming } from './messages';
import { assistArtifact, artifactTask, updateArtifact } from './artifacts';
import { createRoom, inviteContact } from './rooms';
import { fireProactive, postReport } from './proactive';
import { forceClosePoll } from './scheduling';
import { resetDemo } from './reset';
import { sleep, warn } from '../util/misc';

const BUSY = '데모를 다시 준비하는 중이에요. 잠시 후 다시 해 주세요.';

/** Run a handler body under the current demo generation; refuses while reseeding. */
const safe = (name: string, fn: () => unknown | Promise<unknown>, sock?: Sock) => {
  if (ctx.resetting) { sock?.emit('toast', { text: BUSY }); return; }
  runWithGen(ctx.gen, () => Promise.resolve().then(fn)).catch(e => {
    warn(`${name} failed:`, e);
    sock?.emit('toast', { text: '요청을 처리하지 못했어요. 다시 시도해 주세요.' });
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
  sock.emit('toast', { text: '디렉터만 쓸 수 있는 기능이에요.' });
  return false;
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
            ack({ error: `알 수 없는 사용자예요: ${String(userId)}` });
            return;
          }
          const dirKey = process.env.TACHI_DIRECTOR_KEY;
          if (userId === DIRECTOR_ID && dirKey && p.key !== dirKey) {
            ack({ error: '디렉터 키가 필요해요.' });
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
          ack({ error: '연결하지 못했어요. 다시 시도해 주세요.' });
        }
      });
    });

    const uid = () => sock.data.userId;

    sock.on('message:send', p => {
      const u = uid();
      if (u && p) safe('message:send', () => handleIncoming(u, p.roomId, { text: p.text, photoUrl: p.photoUrl }), sock);
    });
    sock.on('action', p => { const u = uid(); if (u && p) safe('action', () => handleAction(u, p), sock); });
    sock.on('typing', p => { const u = uid(); if (u && p?.roomId) sock.to(roomChannel(p.roomId)).emit('typing', { roomId: p.roomId, userId: u }); });

    sock.on('room:create', (p, ack) => {
      const u = uid();
      if (typeof ack !== 'function') return;
      if (!u || u === DIRECTOR_ID || ctx.resetting) { ack({ error: '방을 만들 수 없어요.' }); return; }
      try { ack(createRoom(u, p?.title, p?.memberIds)); } catch (e) { warn('room:create', e); ack({ error: '방을 만들지 못했어요.' }); }
    });
    sock.on('room:invite', p => {
      const u = uid();
      const room = p && ctx.db.rooms.get(p.roomId);
      if (u && room && (u === DIRECTOR_ID || room.memberIds.includes(u))) safe('room:invite', () => inviteContact(p.roomId, p.contactId), sock);
    });

    sock.on('artifact:update', p => { const u = uid(); if (u && p) safe('artifact:update', () => updateArtifact(u, p.artifactId, p.patch), sock); });
    sock.on('artifact:task', p => { const u = uid(); if (u && p) safe('artifact:task', () => artifactTask(u, p), sock); });
    sock.on('artifact:assist', p => { const u = uid(); if (u && p) safe('artifact:assist', () => assistArtifact(u, p.artifactId), sock); });

    sock.on('privacy:set', p => {
      const u = uid();
      if (!u || !p || !(seesAll(u))) return;
      safe('privacy:set', () => {
        const priv = { ...getPrivacy() };
        if (!(p.category in priv) || (p.visibility !== 'family' && p.visibility !== 'private')) return;
        priv[p.category] = p.visibility;
        ctx.db.kv.set('privacy', priv);
        resyncFamilyViewers(); // privacy:update + health to everyone, projected re-hello for family clients
      }, sock);
    });
    sock.on('memory:visibility', p => { const u = uid(); if (u && p) safe('memory:visibility', () => setMemoryVisibility(u, p.memoryId, p.visibility), sock); });

    sock.on('model:set', p => {
      safe('model:set', () => {
        const state = ctx.brain.setActiveModel(p.key);
        ctx.db.kv.set('model', state.active);
        io.emit('model:update', state);
      }, sock);
    });

    sock.on('demo:proactive', p => { if (requireDirector(sock)) safe('demo:proactive', () => fireProactive((p?.kind as ProactiveKind | undefined) ?? undefined), sock); });
    sock.on('demo:report', () => { if (requireDirector(sock)) safe('demo:report', () => postReport(false), sock); });
    sock.on('demo:reset', () => { if (requireDirector(sock)) safe('demo:reset', () => resetDemo(), sock); });
    sock.on('demo:bots', p => { if (requireDirector(sock)) safe('demo:bots', () => { patchDemo({ botsEnabled: !!p?.enabled }); }, sock); });
    sock.on('demo:clock', p => {
      if (requireDirector(sock)) safe('demo:clock', () => { if (!setDemoClock(p?.time ?? null)) sock.emit('toast', { text: '시간 형식이 올바르지 않아요 (HH:MM).' }); }, sock);
    });
    sock.on('demo:closePoll', () => {
      if (!requireDirector(sock)) return;
      safe('demo:closePoll', async () => {
        if (!(await forceClosePoll())) sock.emit('toast', { text: '진행 중인 일정 조율이 없어요.' });
      }, sock);
    });
    sock.on('demo:say', p => {
      if (!p || !requireDirector(sock)) return;
      safe('demo:say', () => handleIncoming(p.userId, p.roomId, { text: p.text, photoUrl: p.photoUrl }), sock);
    });

    sock.on('disconnect', () => { release(sock); ctx.assisted.delete(sock.id); });
  });
}

