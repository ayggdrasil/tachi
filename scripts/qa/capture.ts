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
  await new Promise<void>(res => socket.emit('hello', { userId: DIRECTOR_ID }, () => res()));
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

  let i = 1;
  for (const step of DEMO_SCRIPT) {
    if (step.director === 'proactive') socket.emit('demo:proactive', {});
    else if (step.director === 'report') socket.emit('demo:report');
    else if (step.as) {
      socket.emit('demo:say', { userId: step.as, roomId: step.room === 'family' ? FAMILY_ROOM_ID : SENIOR_ROOM_ID, text: step.text, photoUrl: step.photo });
    }
    // schedule step needs bots to answer in side rooms
    const wait = step.id === 'schedule' ? 14000 : step.id === 'photo' ? 4500 : 6500;
    await sleep(wait);
    const n = String(i++).padStart(2, '0');
    await shot(senior, `${n}-senior-${step.id}`);
    await shot(family, `${n}-family-${step.id}`);
  }
  // extra screens
  const desk = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SCALE })).newPage();
  desk.on('pageerror', e => errors.push(`[desktop] pageerror ${e.message}`));
  await desk.goto(`${BASE}/family?as=jieun`); await sleep(2500); await shot(desk, '90-family-desktop');
  await desk.goto(`${BASE}/demo`); await sleep(4000); await shot(desk, '91-director');
  await desk.goto(`${BASE}/`); await sleep(1500); await shot(desk, '92-landing');
  await senior.locator('.sa-tabs button', { hasText: '추억' }).click().catch(() => {}); await sleep(1500); await shot(senior, '93-senior-album');
  await senior.locator('.sa-tabs button', { hasText: '설정' }).click().catch(() => {}); await sleep(1000); await shot(senior, '94-senior-privacy');

  await browser.close();
  socket.close();
  console.log(JSON.stringify({ out: OUT, errors }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
