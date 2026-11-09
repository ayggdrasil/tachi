// P0 regression: ticker dedupe, director auth, model:set gating, lan directorUrl.
//   npx tsx server/scripts/p0.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, ServerToClientEvents } from '../../shared/types';
import { createApp } from '../orchestrator/app';
import { setDemoClock } from '../orchestrator/core';
import { tick } from '../orchestrator/proactive';
import { setWallClock } from '../util/misc';

type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;
let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const open = async (url: string) => { const s = connect(url, { transports: ['websocket'], forceNew: true }) as Sock; await new Promise<void>(r => s.on('connect', () => r())); return s; };
const hello = (s: Sock, userId: string, key?: string) => new Promise<Bootstrap | { error: string }>(res => s.emit('hello', { userId, key }, b => res(b)));

async function main() {
  const wall = new Date(); wall.setHours(9, 0, 0, 0);
  setWallClock(() => wall.getTime());
  process.env.TACHI_DIRECTOR_KEY = 'k3y';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-p0-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 10, quiet: true });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  const reports = () => ctx.db.messages.byRoom(FAMILY_ROOM_ID, 500).filter(m => m.kind === 'report').length;
  const proactives = () => ctx.db.messages.byRoom(SENIOR_ROOM_ID, 500).filter(m => m.meta?.proactive).length;

  // auth
  const bad = await open(url);
  check('error' in (await hello(bad, 'director')), 'director hello without key is rejected');
  const before = ctx.brain.getModelState().active;
  bad.emit('model:set', { key: 'gpt-luna' as never }); await sleep(150);
  check(ctx.brain.getModelState().active === before, 'anonymous model:set leaves active unchanged');
  const lan = await fetch(`${url}/api/lan`).then(r => r.json()) as { directorUrl?: string };
  check(!!lan.directorUrl && lan.directorUrl.includes('key=k3y'), '/api/lan gives directorUrl to loopback');
  const g = await fetch(`${url}/api/graph?as=director`).then(r => r.text());
  check(!g.includes('mem-wedding-1976'), '/api/graph?as=director without key stays family-visible');

  // P0-1 report dedupe: clock 21:00 -> demo:report -> tick => exactly 1 report
  const dir = await open(url);
  check(!('error' in (await hello(dir, 'director', 'k3y'))), 'director hello with key works');
  const r0 = reports();
  setDemoClock('21:00');
  dir.emit('demo:report'); await sleep(400);
  dir.disconnect(); await sleep(150);
  await tick(); await sleep(200);
  check(reports() - r0 === 1, `exactly 1 report after clock 21:00 + demo:report + tick (got ${reports() - r0})`);

  // 14:01 with director connected: no spontaneous proactive
  const dir2 = await open(url); await hello(dir2, 'director', 'k3y');
  const p0 = proactives();
  setDemoClock('14:01'); // backwards after 21:00 only adds a minute; still must not fire
  await tick(); await sleep(200);
  check(proactives() === p0, 'no proactive while a director is connected');
  dir2.disconnect(); bad.disconnect();
  await close();
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
