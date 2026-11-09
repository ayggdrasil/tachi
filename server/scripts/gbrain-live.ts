// Live check for the optional GBrain mirror against a REAL `gbrain serve --http` (not part of `npm test`).
//   TACHI_GBRAIN_URL=http://127.0.0.1:3131/mcp TACHI_GBRAIN_TOKEN=gbrain_... npx tsx server/scripts/gbrain-live.ts
// Boots Tachi in a temp data dir with a throwaway page prefix, checks the seed was mirrored (pages + typed links),
// runs a graph recall and a GBrain deep recall as the senior, then soft-deletes everything it wrote.
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, RecallCardPayload, ServerToClientEvents } from '../../shared/types';
import { GbrainClient } from '../graph/gbrain';
import { createApp } from '../orchestrator/app';

const url = process.env.TACHI_GBRAIN_URL;
const token = process.env.TACHI_GBRAIN_TOKEN;
if (!url || !token) { console.error('Set TACHI_GBRAIN_URL and TACHI_GBRAIN_TOKEN first.'); process.exit(2); }
const prefix = `tachi-livecheck-${Date.now().toString(36)}`;
process.env.TACHI_GBRAIN_PREFIX = prefix;

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const gb = new GbrainClient(url, token);

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-gbrain-live-'));
const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 30, quiet: true, locale: 'ko' }); // Korean seed: the phrases below
const port = await listen(0);
await ctx.graph.flushMirror();
console.log(`gbrain live check: ${url}  prefix=${prefix}/  graph=${ctx.graph.engine}  model=${ctx.brain.getModelState().active}`);
check(ctx.graph.mirrorStatus()?.state === 'ok', `mirror healthy (${ctx.graph.mirrorStatus()?.lastError ?? 'ok'})`);

const listed = await gb.call<{ slug: string }[]>('list_pages', { slug_prefix: `${prefix}/memories/`, limit: 20 }, 10000);
check(listed.length === 3, `3 seeded memories mirrored as pages (${listed.map(p => p.slug).join(', ')})`);
const backlinks = await gb.call<{ link_type?: string }[]>('traverse_graph', { slug: `${prefix}/memories/mem-haeundae-1988`, depth: 1 }, 10000);
check(Array.isArray(backlinks) && backlinks.some(l => l.link_type === 'attended') && backlinks.some(l => l.link_type === 'mentions'), 'typed links attended + mentions exist');

const sock = connect(`http://localhost:${port}`, { transports: ['websocket'], forceNew: true }) as Socket<ServerToClientEvents, ClientToServerEvents>;
const msgs: Message[] = [];
sock.on('message:new', m => msgs.push(m));
await new Promise<void>(r => sock.on('connect', () => r()));
await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: 'mom' }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));

async function recall(text: string): Promise<RecallCardPayload | undefined> {
  const t0 = Date.now();
  const seen = msgs.length; // only replies to THIS message
  sock.emit('message:send', { roomId: SENIOR_ROOM_ID, text });
  while (Date.now() - t0 < 20000) {
    const m = msgs.slice(seen).find(x => x.roomId === SENIOR_ROOM_ID && x.senderId === 'tachi' && (x.kind === 'recall_card' || /못 들었어요/.test(x.text ?? '')));
    if (m) { console.log(`        ${text} → ${Date.now() - t0}ms`); return m.kind === 'recall_card' ? m.payload as RecallCardPayload : undefined; }
    await sleep(80);
  }
  return undefined;
}

const g = await recall('해운대 기억나?');
check(g?.memoryId === 'mem-haeundae-1988' && g.via === 'graph' && !!g.cypher?.startsWith('MATCH'), `graph recall stays on Kùzu (${g?.via}, ${g?.cypher})`);
const d = await recall('차가운 바다 기억나?');
check(d?.memoryId === 'mem-haeundae-1988' && d.via === 'gbrain', `free-text recall found by GBrain (${d?.via}: ${d?.cypher})`);

sock.close();
await ctx.graph.clear();
await ctx.graph.flushMirror();
const left = await gb.call<unknown[]>('list_pages', { slug_prefix: `${prefix}/`, limit: 5 }, 10000);
check(Array.isArray(left) && left.length === 0, 'cleanup: every page under the throwaway prefix soft-deleted');
await close();
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(failures ? `\n${failures} check(s) failed` : '\nGBRAIN LIVE OK');
process.exit(failures ? 1 : 0);
