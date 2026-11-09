// Round-2 extension of docs/design/tools/verify-design.cjs: new surfaces + stress variants + keyboard flows.
// Read-only except the Segmented keyboard probe, which toggles privacy 'daily' twice (restored, verified).
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.TACHI_URL || 'http://localhost:4100';
const DETECT = process.env.DETECT_URL || 'http://localhost:8400/detect.js';
const OUT = process.env.AUDIT_OUT || __dirname + '/out2/';
fs.mkdirSync(OUT + 'shots', { recursive: true });

const tab = n => async p => { await p.click(`nav.sa-tabs button:nth-child(${n})`); await p.waitForTimeout(800); };
const momTab = id => async p => { await p.click('button[aria-label="어머니 소식"]'); await p.waitForTimeout(500); if (id) { await p.click(`#mp-tab-${id}`); await p.waitForTimeout(700); } };
const art = async p => { const h = await p.$('.cd-art-head'); if (h) { await h.click(); await p.waitForTimeout(900); } };
const click = sel => async p => { await p.click(sel); await p.waitForTimeout(700); };
const side = async p => { await p.click('h2.fam-sec:has-text("타치와 1:1") + ul .fam-room'); await p.waitForTimeout(900); };
const memDetail = async p => { await momTab()(p); await p.click('.mp-list .mt'); await p.waitForTimeout(800); };
const graphOn = async p => { await p.click('.dc-toggles button:nth-child(2)'); await p.waitForTimeout(1500); };
const T200 = { fontSize: 32 };
const SPACING = { textSpacing: true };

const STATES = [
  ['senior-help', '/senior?as=mom&embed=1&theme=light', [390, 844], click('button[aria-label="도움말"]')],
  ['senior-help-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844], click('button[aria-label="도움말"]')],
  ['senior-help-320x256', '/senior?as=mom&theme=light', [320, 256], click('button[aria-label="도움말"]')],
  ['senior-sheet-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844], async p => { await tab(2)(p); await p.click('.sa-grid .mt'); await p.waitForTimeout(700); }],
  ['senior-sheet-landscape', '/senior?as=mom&theme=light', [844, 390], async p => { await tab(2)(p); await p.click('.sa-grid .mt'); await p.waitForTimeout(700); }],
  ['senior-samples', '/senior?as=mom&embed=1&theme=light', [390, 844], click('.cp-sample-btn')],
  ['senior-text200-chat', '/senior?as=mom&embed=1&theme=light', [390, 844], null, T200],
  ['senior-text200-album', '/senior?as=mom&embed=1&theme=light', [390, 844], tab(2), T200],
  ['senior-text200-privacy', '/senior?as=mom&embed=1&theme=light', [390, 844], tab(3), T200],
  ['senior-spacing-chat', '/senior?as=mom&embed=1&theme=light', [390, 844], null, SPACING],
  ['senior-320x568', '/senior?as=mom&theme=light', [320, 568]],
  ['senior-568x320', '/senior?as=mom&theme=light', [568, 320]],
  ['senior-privacy-320', '/senior?as=mom&theme=light', [320, 640], tab(3)],
  ['family-text200-embed', '/family?as=jieun&embed=1&theme=light', [390, 844], null, T200],
  ['family-text200-desktop', '/family?as=jieun&theme=light', [1280, 800], null, T200],
  ['family-spacing-embed', '/family?as=jieun&embed=1&theme=light', [390, 844], null, SPACING],
  ['family-320x256', '/family?as=jieun&embed=1&theme=light', [320, 256]],
  ['family-landscape', '/family?as=jieun&embed=1&theme=light', [844, 390]],
  ['family-embed-artifact-dark', '/family?as=jieun&embed=1&theme=dark', [390, 844], art],
  ['family-embed-mom-memory-dark', '/family?as=jieun&embed=1&theme=dark', [390, 844], momTab()],
  ['family-embed-mom-health-dark', '/family?as=jieun&embed=1&theme=dark', [390, 844], momTab('health')],
  ['family-embed-memory-detail', '/family?as=jieun&embed=1&theme=light', [390, 844], memDetail],
  ['family-desktop-memory-detail', '/family?as=jieun&theme=light', [1440, 900], memDetail],
  ['family-390-invite', '/family?as=jieun&embed=1&theme=light', [390, 844], click('button[aria-label="초대"]')],
  ['family-390-newroom', '/family?as=jieun&theme=light', [390, 844], click('.fam-new')],
  ['family-390-more', '/family?as=jieun&embed=1&theme=light', [390, 844], click('button[aria-label="더 보기"]')],
  ['family-desktop-more', '/family?as=jieun&theme=light', [1440, 900], click('button[aria-label="더 보기"]')],
  ['family-desktop-persona', '/family?as=jieun&theme=light', [1440, 900], click('.fam-persona-btn')],
  ['family-desktop-side', '/family?as=minjun&theme=light', [1440, 900], side],
  ['family-1024-artifact', '/family?as=jieun&theme=light', [1024, 768], art],
  ['family-desktop-artifact-dark', '/family?as=jieun&theme=dark', [1440, 900], art],
  ['demo-1280-graph', '/demo?key=demo42&theme=light', [1280, 800], graphOn],
  ['demo-1024-graph', '/demo?key=demo42&theme=light', [1024, 768], graphOn],
  ['demo-1024-graph-dark', '/demo?key=demo42&theme=dark', [1024, 768], graphOn],
  ['demo-1440-side', '/demo?key=demo42&theme=light', [1440, 900], click('.dc-toggles button:nth-child(1)')],
  ['demo-qr', '/demo?key=demo42&theme=light', [1440, 900], click('.dc-sec button:has-text("QR 보기")')],
  ['demo-reset-confirm', '/demo?key=demo42&theme=light', [1440, 900], click('.dc-reset')],
  ['demo-390', '/demo?key=demo42&theme=light', [390, 844]],
  ['landing-1440-dark', '/?theme=dark', [1440, 900]],
  ['landing-320x256', '/?theme=light', [320, 256]],
];

function measure() {
  const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const visible = el => { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const bgOf = el => { const layers = []; let op = 1, n = el; while (n && n.nodeType === 1) { const cs = getComputedStyle(n); const c = parse(cs.backgroundColor); if (c && c.a > 0) layers.push(c); op *= parseFloat(cs.opacity || '1'); if (c && c.a >= 1) break; n = n.parentElement; } let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 }; if (base.a < 1) base = { r: 255, g: 255, b: 255, a: 1 }; for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base); return { bg: base, op }; };
  const desc = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const out = { contrast: [], placeholders: [], targets: [], small: [], clipped: [], overflow: null, h1: 0, toasts: 0 };
  document.querySelectorAll('body *').forEach(el => {
    if (!visible(el) || el.closest('svg')) return;
    if (![...el.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) return;
    if (el.closest('button:disabled, [aria-disabled="true"]')) return;
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) return;
    const { bg, op } = bgOf(el); const r = ratio(blend({ ...fg, a: fg.a * op }, bg), bg);
    const size = parseFloat(cs.fontSize), w = parseInt(cs.fontWeight, 10);
    const need = size >= 24 || (size >= 18.66 && w >= 700) ? 3 : 4.5;
    if (r < need) out.contrast.push(`${desc(el)} ${r.toFixed(2)}:1 (need ${need}) "${el.textContent.trim().slice(0, 20)}"`);
    if (el.closest('.senior') && size < 17 && !el.closest('.sr-only')) out.small.push(`${desc(el)} ${size}px`);
    // clipped text: overflow hidden / ellipsis / line clamp hiding content
    if (!el.closest('.sr-only') && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) {
        if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && cs.overflowX !== 'auto') out.clipped.push(`${desc(el)} "${el.textContent.trim().slice(0, 24)}" ${el.scrollWidth}x${el.scrollHeight}>${el.clientWidth}x${el.clientHeight}`);
      }
    }
  });
  document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    if (!visible(el)) return; const pc = parse(getComputedStyle(el, '::placeholder').color); if (!pc) return;
    const { bg } = bgOf(el); const r = ratio(blend(pc, bg), bg); if (r < 4.5) out.placeholders.push(`${desc(el)} "${el.placeholder}" ${r.toFixed(2)}:1`);
    // placeholder clipped by the field width
    if (!el.value) { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(el); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const tw = c.measureText(el.placeholder).width; const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); if (el.tagName === 'INPUT' && tw > avail + 1) out.clipped.push(`placeholder ${desc(el)} "${el.placeholder}" ${Math.round(tw)}>${Math.round(avail)}`); }
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
  // headings outline
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => +h.tagName[1]); let skip = null; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[i - 1] + 1) { skip = `${hs[i - 1]}->${hs[i]}`; break; } out.headingSkip = skip;
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
  } catch (e) { return [`DETECTOR_UNAVAILABLE: ${String(e).slice(0, 120)}`]; }
}

async function newPage(b, vp, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] }, ...(opts.ctx || {}) });
  const p = await ctx.newPage();
  if (opts.fontSize) { const cdp = await ctx.newCDPSession(p); await cdp.send('Page.enable'); await cdp.send('Page.setFontSizes', { fontSizes: { standard: opts.fontSize } }); }
  return { ctx, p };
}
const SPACING_CSS = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}';

async function runStates(b, only) {
  let det = 0, hard = 0; const rep = {};
  for (const [name, url, vp, act, opts = {}] of STATES) {
    if (only && !only.test(name)) continue;
    const { ctx, p } = await newPage(b, vp, opts);
    const errors = []; p.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}); await p.waitForTimeout(2500);
    if (opts.textSpacing) { await p.addStyleTag({ content: SPACING_CSS }); await p.waitForTimeout(400); }
    try { if (act) await act(p); } catch (e) { errors.push('ACTION: ' + String(e).slice(0, 120)); }
    await p.screenshot({ path: `${OUT}shots/${name}.png` });
    const m = await p.evaluate(measure); const d = await detector(p);
    rep[name] = { url, vp, opts, ...m, detector: d, errors };
    det += d.length;
    const fails = m.contrast.length + m.placeholders.length + (m.overflow ? 1 : 0) + (m.titleTruncated ? 1 : 0) + errors.length;
    hard += fails;
    console.log(`${name.padEnd(30)} det=${d.length} con=${m.contrast.length} ph=${m.placeholders.length} ovf=${m.overflow || '-'} trunc=${m.titleTruncated ?? '-'} thread=${m.threadHeight ?? '-'} h1=${m.h1} skip=${m.headingSkip || '-'} small=${m.small.length} clipped=${m.clipped.length} err=${errors.length}`);
    d.forEach(x => console.log('    · ' + x)); m.contrast.forEach(x => console.log('    ! contrast ' + x)); errors.forEach(x => console.log('    ! ' + x));
    m.clipped.slice(0, 6).forEach(x => console.log('    ~ clipped ' + x)); m.small.slice(0, 4).forEach(x => console.log('    ~ small ' + x));
    await ctx.close();
  }
  return { det, hard, rep };
}

async function behaviour(b) {
  const res = {};
  const page = async (url, vp, opts = {}) => { const { ctx, p } = await newPage(b, vp, opts); await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500); return { ctx, p }; };
  const act = p => p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'body'; return a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.trim().split(/\s+/).join('.') : '') + (a.getAttribute('aria-label') ? `[${a.getAttribute('aria-label')}]` : ''); });
  const inDialog = p => p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

  // Help sheet
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]); await p.focus('button[aria-label="도움말"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const movedIn = await inDialog(p); const first = await act(p); let esc = false; for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); if (!(await inDialog(p))) esc = true; }
    for (let i = 0; i < 4; i++) { await p.keyboard.press('Shift+Tab'); if (!(await inDialog(p))) esc = true; }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.helpSheet = { movedIn, first, tabTrapped: !esc, escapeCloses: (await p.$('[aria-labelledby="sa-help-title"]')) === null, focusReturned: await act(p) }; await ctx.close(); }

  // Invite dialog (desktop) via keyboard
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.focus('button[aria-label="초대"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const movedIn = await inDialog(p); const first = await act(p); let esc = false; for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); if (!(await inDialog(p))) esc = true; }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.inviteDialog = { movedIn, first, tabTrapped: !esc, escapeCloses: (await p.$('.dlg')) === null, focusReturned: await act(p) }; await ctx.close(); }

  // Dialog re-render focus jump: open invite at 1000px, move focus, then resize across the 900px breakpoint (FamilyApp re-renders)
  { const { ctx, p } = await page('/family?as=jieun', [1000, 800]); await p.click('button[aria-label="초대"]'); await p.waitForTimeout(500);
    await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); const before = await act(p);
    await p.setViewportSize({ width: 800, height: 800 }); await p.waitForTimeout(600); const after = await act(p);
    res.dialogRerender = { before, after, stable: before === after }; await ctx.close(); }

  // MemoryDetail dialog re-render: open detail in mom panel, focus close, trigger a MomPanel store update is not possible read-only; record only focus-in
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.click('button[aria-label="어머니 소식"]'); await p.waitForTimeout(500); await p.focus('.mp-list .mt'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
    const movedIn = await inDialog(p); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.memoryDetail = { movedIn, closes: (await p.$('.dlg')) === null, focusReturned: await act(p), panelStillOpen: (await p.$('.fam-panel')) !== null }; await ctx.close(); }

  // Desktop artifact panel: focus after open, Tab distance to panel, focus after Escape
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.focus('.cd-art-head'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    const afterOpen = await act(p); let n = 0; for (; n < 80; n++) { const inside = await p.evaluate(() => !!document.activeElement?.closest('.fam-panel')); if (inside) break; await p.keyboard.press('Tab'); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.desktopPanel = { afterOpen, tabsToReachPanel: n, closedByEscape: (await p.$('.fam-panel')) === null, focusAfterEscape: await act(p) }; await ctx.close(); }

  // Narrow artifact sheet: focus return to the card button
  { const { ctx, p } = await page('/family?as=jieun&embed=1', [390, 844]); await p.focus('.cd-art-head'); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
    const movedIn = await inDialog(p); let esc = false; for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!(await inDialog(p))) esc = true; }
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    res.narrowArtifactSheet = { role: 'dialog', movedIn, tabTrapped: !esc, escapeCloses: (await p.$('.fam-sheet')) === null, focusReturned: await act(p) }; await ctx.close(); }

  // Persona menu
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.focus('.fam-persona-btn'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const first = await act(p); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.personaMenu = { first, closes: (await p.$('#fam-persona-menu')) === null, focusReturned: await act(p) }; await ctx.close(); }

  // More menu: focus in, Escape, mouse-leave keeps it open
  { const { ctx, p } = await page('/family?as=jieun', [1440, 900]); await p.focus('button[aria-label="더 보기"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const first = await act(p); await p.mouse.move(10, 600); await p.waitForTimeout(300); const stillOpen = (await p.$('#fam-more-menu')) !== null;
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    res.moreMenu = { first, stillOpenAfterMouseLeave: stillOpen, closes: (await p.$('#fam-more-menu')) === null, focusReturned: await act(p) }; await ctx.close(); }

  // MomPanel tabs keyboard
  { const { ctx, p } = await page('/family?as=jieun&embed=1', [390, 844]); await p.click('button[aria-label="어머니 소식"]'); await p.waitForTimeout(500); await p.focus('#mp-tab-memory');
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300); const a = await act(p); const sel = await p.getAttribute('#mp-tab-health', 'aria-selected');
    const tabbable = await p.evaluate(() => [...document.querySelectorAll('[role=tab]')].filter(t => t.tabIndex === 0).length);
    res.momTabs = { focused: a, healthSelected: sel, tabbableTabs: tabbable }; await ctx.close(); }

  // Itinerary tabs present?
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]);
    res.itineraryTabs = await p.evaluate(() => ({ tablists: document.querySelectorAll('.cd-tabs[role=tablist]').length, tabpanels: document.querySelectorAll('.cd-trip [role=tabpanel]').length }));
    // decided memory card shape
    res.memoryCards = await p.evaluate(() => [...document.querySelectorAll('.cd-memory')].map(c => ({ radiogroups: c.querySelectorAll('[role=radiogroup]').length, disabledBtns: c.querySelectorAll('button:disabled').length, result: c.querySelector('.ml-result')?.textContent ?? null, cap: c.querySelector('.cd-cap')?.textContent ?? null, factsClipped: [...c.querySelectorAll('.cd-facts dd')].some(d => d.scrollWidth > d.clientWidth) })));
    res.scheduleSenior = await p.evaluate(() => [...document.querySelectorAll('.cd-slots-s')].map(s => s.querySelectorAll('.chip').length));
    res.seniorChatControls = await p.evaluate(() => [...document.querySelectorAll('.sa-header button, .cp button, .cp input, .sa-tabs button')].filter(e => e.getBoundingClientRect().width > 0).length);
    await ctx.close(); }

  // Segmented keyboard on privacy 'daily' (toggle twice → restored)
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844]); await tab(3)(p);
    const g = 'section[aria-labelledby="p-daily"] [role=radiogroup]';
    const initial = await p.$eval(g, el => el.querySelector('[aria-checked=true]').textContent);
    const tabbable = await p.$eval(g, el => [...el.querySelectorAll('[role=radio]')].filter(r => r.tabIndex === 0).length);
    await p.focus(`${g} [aria-checked=true]`); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    const mid = await p.$eval(g, el => ({ checked: el.querySelector('[aria-checked=true]').textContent, focusOnChecked: document.activeElement === el.querySelector('[aria-checked=true]') }));
    const ring = await p.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    const fin = await p.$eval(g, el => el.querySelector('[aria-checked=true]').textContent);
    res.segmented = { initial, tabbable, mid, ringOnFocus: ring, final: fin, restored: fin === initial }; await ctx.close(); }

  // Reduced motion: running animations that still translate/scale/rotate
  { const { ctx, p } = await page('/family?as=jieun&embed=1', [390, 844], { ctx: { reducedMotion: 'reduce' } });
    await p.evaluate(() => { window.__smooth = 0; const o = Element.prototype.scrollTo; Element.prototype.scrollTo = function (a) { if (a && a.behavior === 'smooth') window.__smooth++; return o.apply(this, arguments); }; });
    await p.click('.cd-art-head'); await p.waitForTimeout(80);
    const travel = await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none')).map(a => (a.animationName || a.id || 'anim') + '@' + (a.effect.target?.className || '')));
    res.reducedMotion = { travellingAnimations: travel, smoothScrollCalls: await p.evaluate(() => window.__smooth) }; await ctx.close(); }
  { const { ctx, p } = await page('/senior?as=mom&embed=1', [390, 844], { ctx: { reducedMotion: 'reduce' } });
    await p.click('button[aria-label="도움말"]'); await p.waitForTimeout(60);
    res.reducedMotionSenior = await p.evaluate(() => document.getAnimations().filter(a => a.effect && a.effect.getKeyframes().some(k => k.transform && k.transform !== 'none')).map(a => (a.animationName || 'anim') + '@' + (a.effect.target?.className || ''))); await ctx.close(); }

  // CLS with delayed images
  for (const [name, url] of [['senior', '/senior?as=mom&embed=1'], ['family', '/family?as=jieun&embed=1'], ['familyDesktop', '/family?as=jieun']]) {
    const ctx = await b.newContext({ viewport: { width: name === 'familyDesktop' ? 1440 : 390, height: name === 'familyDesktop' ? 900 : 844 } }); const p = await ctx.newPage();
    await p.route(/\.(jpe?g|png|webp)(\?|$)/, async r => { await new Promise(x => setTimeout(x, 1500)); await r.continue(); });
    await p.addInitScript(() => { window.__cls = 0; window.__shifts = []; new PerformanceObserver(l => { for (const e of l.getEntries()) { if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push([Math.round(e.startTime), +e.value.toFixed(4), (e.sources || []).map(s => s.node && (s.node.className || s.node.nodeName)).join('|').slice(0, 80)]); } } }).observe({ type: 'layout-shift', buffered: true }); });
    await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
    res['cls_' + name] = await p.evaluate(() => ({ cls: +window.__cls.toFixed(4), shifts: window.__shifts.slice(0, 6) })); await ctx.close(); }

  // Coarse targets on new surfaces
  for (const [name, url, actn] of [['invite390', '/family?as=jieun&embed=1', click('button[aria-label="초대"]')], ['newroom390', '/family?as=jieun', click('.fam-new')], ['artifact390', '/family?as=jieun&embed=1', art], ['more390', '/family?as=jieun&embed=1', click('button[aria-label="더 보기"]')], ['memDetail390', '/family?as=jieun&embed=1', memDetail], ['list390', '/family?as=jieun', null], ['help390', '/senior?as=mom&embed=1', click('button[aria-label="도움말"]')], ['landing390', '/', null]]) {
    const { ctx, p } = await page(url, [390, 844], { ctx: { hasTouch: true, isMobile: true } }); if (actn) await actn(p);
    const m = await p.evaluate(measure); res['coarse_' + name] = [...new Set(m.targets)]; await ctx.close(); }

  // Text preference on family + director
  for (const [name, url, sel] of [['family', '/family?as=jieun&embed=1', '.ml-text'], ['landing', '/', '.ld-pitch']]) {
    const { ctx, p } = await page(url, [390, 844], { fontSize: 32 });
    res['textPref_' + name] = await p.evaluate(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).fontSize : null; }, sel); await ctx.close(); }
  return res;
}

(async () => {
  const only = process.argv[2] && process.argv[2] !== 'behaviour' ? new RegExp(process.argv[2]) : null;
  const b = await chromium.launch();
  const report = {};
  if (process.argv[2] !== 'behaviour') { const r = await runStates(b, only); report.states = r.rep; console.log(`\nSTATES detector=${r.det} hard=${r.hard}`); }
  if (!only) { report.behaviour = await behaviour(b); console.log('behaviour', JSON.stringify(report.behaviour, null, 1)); }
  fs.writeFileSync(OUT + 'report.json', JSON.stringify(report, null, 1));
  await b.close();
})();
