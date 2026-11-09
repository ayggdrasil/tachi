// Tachi design verification harness (audit round 1).
// Visits every UI state, runs the impeccable detector injected into the live page (so states the
// CLI cannot reach — album, privacy, panels, dialogs — are covered), and measures contrast,
// placeholder contrast, touch targets (fine + coarse pointer), 320px overflow, focus behaviour of
// sheets/popovers, toast containers and text-size-preference scaling.
//
// Read-only: it never runs a Director step, never confirms a reset, never sends a message.
//
// Prereqs (run from a scratch dir, NOT the repo, so nothing gets injected into web/index.html):
//   cd /tmp && npx -y impeccable@4.8.1 live-server --background      # serves /detect.js on :8400
//   NODE_PATH=$(npm root -g) node /home/user/tachi/docs/design/tools/verify-design.cjs [stateRegex]
//   (cd /tmp && npx -y impeccable@4.8.1 live-server stop --keep-inject) when done.
// Env: TACHI_URL (default http://localhost:4100), DETECT_URL (default http://localhost:8400/detect.js),
//      AUDIT_OUT (default /tmp/tachi-audit/) for screenshots + report.json.
// Exit code 0 = zero detector findings (incl. advisories) and zero hard failures; 1 otherwise.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.TACHI_URL || 'http://localhost:4100';
const DETECT = process.env.DETECT_URL || 'http://localhost:8400/detect.js';
const OUT = process.env.AUDIT_OUT || '/tmp/tachi-audit/';
fs.mkdirSync(OUT + 'shots', { recursive: true });

const tab = n => async p => { await p.click(`nav.sa-tabs button:nth-child(${n})`); await p.waitForTimeout(800); };
const momTab = id => async p => { await p.click('button[aria-label="어머니 소식"]'); await p.waitForTimeout(500); if (id) { await p.click(`#mp-tab-${id}`); await p.waitForTimeout(700); } };
const art = async p => { const h = await p.$('.cd-art-head'); if (h) { await h.click(); await p.waitForTimeout(900); } };

// [name, path, [w,h], action?]
const STATES = [
  ['senior-chat-light', '/senior?as=mom&embed=1&theme=light', [390, 844]],
  ['senior-chat-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844]],
  ['senior-standalone-1440', '/senior?as=mom&theme=light', [1440, 900]],
  ['senior-album', '/senior?as=mom&embed=1&theme=light', [390, 844], tab(2)],
  ['senior-album-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844], tab(2)],
  ['senior-sheet', '/senior?as=mom&embed=1&theme=light', [390, 844], async p => { await tab(2)(p); await p.click('.sa-grid .mt'); await p.waitForTimeout(700); }],
  ['senior-privacy', '/senior?as=mom&embed=1&theme=light', [390, 844], tab(3)],
  ['senior-privacy-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844], tab(3)],
  ['senior-320', '/senior?as=mom&embed=1&theme=light', [320, 640]],
  ['senior-320x256', '/senior?as=mom&theme=light', [320, 256]],
  ['senior-landscape', '/senior?as=mom&theme=light', [844, 390]],
  ['family-embed-light', '/family?as=jieun&embed=1&theme=light', [390, 844]],
  ['family-embed-dark', '/family?as=jieun&embed=1&theme=dark', [390, 844]],
  ['family-embed-mom-memory', '/family?as=jieun&embed=1&theme=light', [390, 844], momTab()],
  ['family-embed-mom-health', '/family?as=jieun&embed=1&theme=light', [390, 844], momTab('health')],
  ['family-embed-mom-report', '/family?as=jieun&embed=1&theme=light', [390, 844], momTab('report')],
  ['family-embed-artifact', '/family?as=jieun&embed=1&theme=light', [390, 844], art],
  ['family-list-390', '/family?as=jieun&theme=light', [390, 844]],
  ['family-320', '/family?as=jieun&embed=1&theme=light', [320, 640]],
  ['family-desktop-light', '/family?as=jieun&theme=light', [1440, 900]],
  ['family-desktop-dark', '/family?as=jieun&theme=dark', [1440, 900]],
  ['family-desktop-mom', '/family?as=jieun&theme=light', [1440, 900], momTab()],
  ['family-desktop-health', '/family?as=jieun&theme=light', [1440, 900], momTab('health')],
  ['family-desktop-artifact', '/family?as=jieun&theme=light', [1440, 900], art],
  ['family-desktop-invite', '/family?as=jieun&theme=light', [1440, 900], async p => { await p.click('button[aria-label="초대"]'); await p.waitForTimeout(700); }],
  ['family-desktop-newroom', '/family?as=jieun&theme=light', [1440, 900], async p => { await p.click('.fam-new'); await p.waitForTimeout(700); }],
  ['family-zoom200', '/family?as=jieun&theme=light', [640, 450]],
  ['demo-light', '/demo?key=demo42&theme=light', [1440, 900]],
  ['demo-dark', '/demo?key=demo42&theme=dark', [1440, 900]],
  ['demo-graph', '/demo?key=demo42&theme=light', [1440, 900], async p => { await p.click('.dc-toggles button:nth-child(2)'); await p.waitForTimeout(1500); }],
  ['demo-graph-dark', '/demo?key=demo42&theme=dark', [1440, 900], async p => { await p.click('.dc-toggles button:nth-child(2)'); await p.waitForTimeout(1500); }],
  ['landing-390', '/?theme=light', [390, 844]],
  ['landing-390-dark', '/?theme=dark', [390, 844]],
  ['landing-1440', '/?theme=light', [1440, 900]],
  ['landing-320', '/?theme=light', [320, 640]],
];

function measure() {
  const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const bgOf = el => { const layers = []; let op = 1, n = el; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); const c = parse(cs.backgroundColor); if (c && c.a > 0) layers.push(c); op *= parseFloat(cs.opacity || '1'); if (c && c.a >= 1) break; n = n.parentElement; } let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base); return { bg: base, op }; };
  const desc = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const out = { contrast: [], placeholders: [], targets: [], small: [], overflow: null, h1: 0, toasts: 0 };
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || el.closest('svg')) return;
    if (![...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) return;
    if (el.closest('button:disabled, [aria-disabled="true"]')) return;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) return;
    const { bg, op } = bgOf(el); const r = ratio(blend({ ...fg, a: fg.a * op }, bg), bg);
    const size = parseFloat(cs.fontSize), w = parseInt(cs.fontWeight, 10);
    const need = size >= 24 || (size >= 18.66 && w >= 700) ? 3 : 4.5;
    if (r < need) out.contrast.push(`${desc(el)} ${r.toFixed(2)}:1 (need ${need})`);
    if (el.closest('.senior') && size < 17) out.small.push(`${desc(el)} ${size}px`);
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (!visible(el)) return; const pc = parse(getComputedStyle(el, '::placeholder').color); if (!pc) return;
    const { bg } = bgOf(el); const r = ratio(blend(pc, bg), bg); if (r < 4.5) out.placeholders.push(`${desc(el)} "${el.placeholder}" ${r.toFixed(2)}:1`);
  });
  document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=tab], [role=radio], [role=switch]').forEach(el => {
    if (!visible(el)) return; const r = el.getBoundingClientRect();
    const inline = getComputedStyle(el).display === 'inline' || el.matches('.cd-link, .dc-link');
    if (!inline && (r.width < 44 || r.height < 44)) out.targets.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)} [${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}]`);
  });
  const de = document.documentElement;
  out.overflow = de.scrollWidth > de.clientWidth + 1 ? `${de.scrollWidth}>${de.clientWidth}` : null;
  out.h1 = [...document.querySelectorAll('h1')].length;
  out.toasts = document.querySelectorAll('.toasts').length;
  const t = document.querySelector('.fam-head-title'); out.titleTruncated = t ? t.scrollWidth > t.clientWidth : null;
  const ml = document.querySelector('.ml'); out.threadHeight = ml ? ml.clientHeight : null;
  return out;
}

async function detector(p) {
  try {
    await p.evaluate(() => { window.__IMPECCABLE_CONFIG__ = { autoScan: false }; });
    await p.addScriptTag({ url: DETECT });
    await p.waitForFunction(() => typeof window.impeccableDetectAsync === 'function', null, { timeout: 20000 });
    const f = await p.evaluate(async () => await window.impeccableDetectAsync());
    const out = []; (f || []).forEach(g => (g.findings || []).forEach(x => out.push(`${x.type}${x.advisory ? ' (advisory)' : ''}: ${(x.detail || '').slice(0, 140)} [${g.selector}]`)));
    return out;
  } catch (e) { return [`DETECTOR_UNAVAILABLE: ${String(e).slice(0, 120)} — is the live-server running on :8400?`]; }
}

async function behaviour(b) {
  const res = {};
  const page = async (url, vp, opts = {}) => { const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, ...opts }); const p = await ctx.newPage(); await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); return { ctx, p }; };
  const active = p => p.evaluate(() => { const a = document.activeElement; return a ? (a.closest('[role="dialog"], .sa-sheet, .fam-sheet, .cp-pop') ? 'inside' : a.tagName.toLowerCase() + '.' + a.className) : 'none'; });
  // Senior memory sheet: focus moves in, Tab stays in, Escape closes, focus returns.
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]); await tab(2)(p); await p.focus('.sa-grid .mt'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const opened = await active(p); let escaped = false; for (let i = 0; i < 10; i++) { await p.keyboard.press('Tab'); if ((await active(p)) !== 'inside') escaped = true; }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300); const closed = (await p.$('.sa-sheet')) === null;
    const back = await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('mt'));
    res.seniorSheet = { focusMovedIn: opened === 'inside', tabTrapped: !escaped, escapeCloses: closed, focusReturned: back }; await ctx.close(); }
  // Family narrow panel sheet.
  { const { ctx, p } = await page('/family?as=jieun&embed=1', [390, 844]); await p.focus('button[aria-label="어머니 소식"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const opened = await active(p); let escaped = false; for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); if ((await active(p)) !== 'inside') escaped = true; }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.familySheet = { role: await p.evaluate(() => document.querySelector('.fam-sheet')?.getAttribute('role') ?? 'closed'), focusMovedIn: opened === 'inside', tabTrapped: !escaped, escapeCloses: (await p.$('.fam-sheet')) === null }; await ctx.close(); }
  // Composer sample popover: Escape closes.
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]); const btn = await p.$('.cp-sample-btn');
    if (btn) { await btn.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(300); res.samplePopEscape = (await p.$('.cp-pop')) === null; } await ctx.close(); }
  // Family "더 보기" menu: Escape closes.
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.focus('button[aria-label="더 보기"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.moreMenuEscape = (await p.$('.fam-more-menu')) === null; await ctx.close(); }
  // Coarse-pointer touch targets (phones).
  for (const [name, url] of [['senior', '/senior?as=mom&embed=1'], ['family', '/family?as=jieun&embed=1'], ['familyMom', '/family?as=jieun&embed=1#mom']]) {
    const { ctx, p } = await page(url.replace('#mom', ''), [390, 844], { hasTouch: true, isMobile: true });
    if (url.endsWith('#mom')) await momTab()(p);
    const m = await p.evaluate(measure); res[`coarseTargets_${name}`] = [...new Set(m.targets)]; await ctx.close(); }
  // Text-size preference (browser default 32px): body text must scale.
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await cdp.send('Page.enable'); await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32 } });
    await p.goto(BASE + '/senior?as=mom&embed=1', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
    res.textPreference = await p.evaluate(() => ({ seniorBody: getComputedStyle(document.querySelector('.senior')).fontSize, scales: parseFloat(getComputedStyle(document.querySelector('.senior')).fontSize) >= 39 })); await ctx.close(); }
  // Speak button must not inflate line height: consecutive line tops differ by the line-height.
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]);
    res.speakLineRhythm = await p.evaluate(() => { const t = [...document.querySelectorAll('.ml-tachi')].pop(); if (!t || !t.firstChild) return null; const r = document.createRange(); r.selectNodeContents(t.firstChild); const tops = [...new Set([...r.getClientRects()].map(x => Math.round(x.top)))]; const lh = parseFloat(getComputedStyle(t).lineHeight); const gaps = tops.slice(1).map((v, i) => v - tops[i]); return { gaps, lineHeight: lh, ok: gaps.every(g => Math.abs(g - lh) <= 2) }; }); await ctx.close(); }
  return res;
}

(async () => {
  const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
  const b = await chromium.launch();
  const report = { states: {}, behaviour: null };
  let detTotal = 0, hard = 0;
  for (const [name, url, vp, act] of STATES) {
    if (only && !only.test(name)) continue;
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] } }); const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500);
    if (act) await act(p);
    await p.screenshot({ path: `${OUT}shots/${name}.png` });
    const m = await p.evaluate(measure); const det = await detector(p);
    report.states[name] = { url, vp, ...m, detector: det, errors };
    detTotal += det.length;
    const fails = m.contrast.length + m.placeholders.length + (m.overflow ? 1 : 0) + (m.titleTruncated ? 1 : 0) + errors.length + (name.startsWith('senior') && m.toasts > 1 ? 1 : 0);
    hard += fails;
    console.log(`${name.padEnd(26)} detector=${det.length} contrast=${m.contrast.length} placeholder=${m.placeholders.length} overflow=${m.overflow || '-'} titleTrunc=${m.titleTruncated ?? '-'} thread=${m.threadHeight ?? '-'} h1=${m.h1} seniorSmall=${m.small.length}`);
    det.forEach(d => console.log('    · ' + d));
    await ctx.close();
  }
  if (!only) { report.behaviour = await behaviour(b); console.log('behaviour', JSON.stringify(report.behaviour, null, 1)); }
  fs.writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
  await b.close();
  console.log(`\nTOTAL detector findings: ${detTotal} · hard failures: ${hard} · report: ${OUT}report.json`);
  process.exit(detTotal === 0 && hard === 0 ? 0 : 1);
})();
