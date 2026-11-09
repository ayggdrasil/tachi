// Drives the full DEMO_SCRIPT against a running server and captures phone-sized screenshots of the
// senior app and the family app after every step (+ director console). Used by QA, the GPT review loop
// and the design loop.  Usage: BASE=http://localhost:4100 OUT=docs/reviews/shots npx tsx scripts/qa/capture.ts
import { createRequire } from 'node:module';
import type { Page } from 'playwright';
// Playwright is resolved via CommonJS so a globally installed copy (NODE_PATH) works too: `npm i -D playwright` otherwise.
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';
import { DEMO_SCRIPT, DIRECTOR_ID, FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';

const BASE = process.env.BASE ?? 'http://localhost:4100';
const OUT = process.env.OUT ?? 'docs/reviews/shots';
const SCALE = Number(process.env.SCALE ?? 1);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const socket = io(BASE, { transports: ['websocket'] });
  await new Promise<void>((res, rej) => { socket.on('connect', () => res()); socket.on('connect_error', rej); });
  await new Promise<void>(res => socket.emit('hello', { userId: DIRECTOR_ID, key: process.env.TACHI_DIRECTOR_KEY }, () => res()));
  socket.emit('demo:reset');
  await sleep(2500);

  const browser = await chromium.launch();
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE, hasTouch: true };
  const senior = await (await browser.newContext(phone)).newPage();
  const family = await (await browser.newContext(phone)).newPage();
  const errors: string[] = [];
  for (const [p, label] of [[senior, 'senior'], [family, 'family']] as const) {
    p.on('pageerror', e => errors.push(`[${label}] pageerror ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') errors.push(`[${label}] console ${m.text()}`); });
  }
  await senior.goto(`${BASE}/senior?as=mom&embed=1`);
  await family.goto(`${BASE}/family?as=jieun&embed=1`);
  await sleep(2500);
  await shot(senior, '00-senior-start');
  await shot(family, '00-family-start');

  // Mirror the Director: set the virtual clock, run the step, wait for its completion message, then dwell.
  const seen: { roomId: string; kind: string; senderId: string; at: number }[] = [];
  socket.on('message:new', (m: any) => seen.push({ roomId: m.roomId, kind: m.kind, senderId: m.senderId, at: Date.now() }));
  const waitFor = async (step: typeof DEMO_SCRIPT[number], since: number) => {
    if (!step.waitFor) { await sleep(4000); return true; }
    const room = step.waitFor.room === 'family' ? FAMILY_ROOM_ID : SENIOR_ROOM_ID;
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      if (seen.some(x => x.at >= since && x.roomId === room && x.kind === step.waitFor!.kind && (!step.waitFor!.from || x.senderId === step.waitFor!.from))) return true;
      await sleep(150);
    }
    return false;
  };
  const timings: Record<string, number> = {};
  let i = 1;
  for (const step of DEMO_SCRIPT) {
    if (step.clock) socket.emit('demo:clock', { time: step.clock });
    await sleep(150);
    const since = Date.now();
    if (step.director === 'proactive') socket.emit('demo:proactive', { kind: step.kind });
    else if (step.director === 'report') socket.emit('demo:report');
    else if (step.director === 'invite') socket.emit('demo:invite', { roomId: FAMILY_ROOM_ID, contactId: step.contactId! });
    else if (step.director === 'model') {
      // switch only if that model is available (server ignores unavailable keys), then ask the question
      if (step.modelKey) socket.emit('model:set', { key: step.modelKey });
      await sleep(400);
      socket.emit('demo:say', { userId: step.as!, roomId: FAMILY_ROOM_ID, text: step.text });
    } else if (step.as) {
      socket.emit('demo:say', { userId: step.as, roomId: step.room === 'family' ? FAMILY_ROOM_ID : SENIOR_ROOM_ID, text: step.text, photoUrl: step.photo });
    }
    const ok = await waitFor(step, since);
    timings[step.id] = Math.round((Date.now() - since) / 100) / 10;
    if (!ok) errors.push(`step ${step.id} did not complete (waitFor ${step.waitFor?.kind})`);
    await sleep(2200);
    // Above-the-fold assertion: the step's primary action must be fully visible on the phone without scrolling.
    if (step.id === 'a-story' || step.id === 'trip') {
      const btn = senior.locator('[data-primary-action]').last();
      const box = await btn.boundingBox().catch(() => null);
      const vh = senior.viewportSize()?.height ?? 844;
      if (!box || box.y < 0 || box.y + box.height > vh - 200) errors.push(`step ${step.id}: primary action not visible above the composer (${box ? Math.round(box.y) + '..' + Math.round(box.y + box.height) : 'missing'})`);
    }
    const n = String(i++).padStart(2, '0');
    await shot(senior, `${n}-senior-${step.id}`);
    await shot(family, `${n}-family-${step.id}`);
  }
  console.log('step seconds', JSON.stringify(timings));
  // extra screens
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE })).newPage();
  desk.on('pageerror', e => errors.push(`[desktop] pageerror ${e.message}`));
  await desk.goto(`${BASE}/family?as=jieun`); await sleep(2500); await shot(desk, '90-family-desktop');
  await desk.goto(`${BASE}/demo?key=${process.env.TACHI_DIRECTOR_KEY ?? ''}`); await sleep(4000); await shot(desk, '91-director');
  await desk.goto(`${BASE}/`); await sleep(1500); await shot(desk, '92-landing');
  await senior.locator('.sa-tabs button', { hasText: '추억' }).click().catch(() => {}); await sleep(1500); await shot(senior, '93-senior-album');
  await senior.locator('.sa-tabs button', { hasText: '설정' }).click().catch(() => {}); await sleep(1000); await shot(senior, '94-senior-privacy');

  await browser.close();
  socket.close();
  console.log(JSON.stringify({ out: OUT, errors }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
