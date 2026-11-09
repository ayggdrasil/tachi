// Validate the round-2 fix list as runtime CSS/DOM patches (product code untouched), then re-run detector + measures.
const { chromium } = require('playwright');
const BASE = 'http://localhost:4100';
const DETECT = 'http://localhost:8400/detect.js';
const OUT = __dirname + '/out4/'; require('fs').mkdirSync(OUT, { recursive: true });

const CSS = `
/* A: components + senior */
.seg { flex-shrink: 0; }
.sa-sheet-body > * { flex-shrink: 0; }
.sa-sheet-t { font-size: var(--senior-heading); }
.ml-bubble { padding: max(var(--space-8), .4em) max(var(--space-16), .6em); }
.mg-edge { stroke: var(--border-field); }
.sa-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 7em), 1fr)); }
.cp-input { padding: 0 var(--space-16); }
.cp-senior { container-type: inline-size; }
@media (min-height: 481px) { @container (max-width: 15em) { .cp-senior .cp-row { flex-wrap: wrap; } .cp-senior .cp-input { order: -1; flex: 1 1 100%; } .cp-senior .cp-send { margin-left: auto; } } }
.cp-family { container-type: inline-size; }
@container (max-width: 340px) { .cp-family .btn-icon[aria-controls="cp-samples"] { display: none; } }
/* C: base */
.btn-icon { border: 0; }
.badge { padding: .125em .5em; }
/* B: family header */
.fam-main { container: fammain / inline-size; }
.fam-head-btn { white-space: nowrap; flex: none; }
@container fammain (max-width: 639px) { .fam-head-label, .fam-stack { display: none; } }
.fam-head-title { white-space: normal; text-overflow: clip; overflow: visible; display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.fam-head-kicker { font-size: var(--text-micro); font-weight: var(--weight-medium); color: var(--text-2); line-height: 1.3; }
.fam-head-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
.fam-spacer { flex: 0 0 0; }
`;
const DOM = async p => p.evaluate(() => {
  const h = document.querySelector('.fam-head-title');
  if (h && !h.querySelector('.fam-head-name')) { const t = h.textContent; const m = t.startsWith('일정 조율 · ') ? ['일정 조율', t.slice(8)] : [null, t]; h.innerHTML = (m[0] ? `<span class="fam-head-kicker">${m[0]}</span>` : '') + `<span class="fam-head-name">${m[1]}</span>`; }
  // side-room button label → narrow icon-only
  document.querySelectorAll('.fam-head-btn > span:not(.fam-head-label)').forEach(s => { s.classList.add('fam-head-label'); s.parentElement.setAttribute('aria-label', s.textContent); });
  document.querySelector('.ml-senior') && document.querySelector('.cp-senior .cp-input')?.setAttribute('placeholder', '말씀해 보세요');
});
const FIX_POP = async p => p.evaluate(() => {
  const pop = document.querySelector('.cp-pop'); if (pop) { const row = pop.parentElement.getBoundingClientRect(); Object.assign(pop.style, { position: 'fixed', left: row.left + 'px', right: (innerWidth - row.right) + 'px', bottom: (innerHeight - row.top + 8) + 'px', top: 'auto' }); }
  const m = document.querySelector('.fam-more-menu'); if (m) { const b = document.querySelector('button[aria-label="더 보기"]').getBoundingClientRect(); Object.assign(m.style, { position: 'fixed', top: (b.bottom + 4) + 'px', right: (innerWidth - b.right) + 'px' }); }
});
const tab = n => async p => { await p.click(`nav.sa-tabs button:nth-child(${n})`); await p.waitForTimeout(700); };
const click = s => async p => { await p.click(s); await p.waitForTimeout(700); };
const art = click('.cd-art-head');
const side = async p => { await p.click('h2.fam-sec:has-text("타치와 1:1") + ul .fam-room'); await p.waitForTimeout(900); };

const STATES = [
  ['senior-sheet', '/senior?as=mom&embed=1', [390, 844], async p => { await tab(2)(p); await p.click('.sa-grid .mt'); await p.waitForTimeout(700); }],
  ['senior-help', '/senior?as=mom&embed=1', [390, 844], click('button[aria-label="도움말"]')],
  ['senior-samples', '/senior?as=mom&embed=1', [390, 844], click('.cp-sample-btn')],
  ['senior-chat', '/senior?as=mom&embed=1', [390, 844]],
  ['senior-320', '/senior?as=mom&embed=1', [320, 640]],
  ['senior-320x256', '/senior?as=mom', [320, 256]],
  ['senior-landscape', '/senior?as=mom', [844, 390]],
  ['senior-text200-chat', '/senior?as=mom&embed=1', [390, 844], null, 32],
  ['senior-text200-album', '/senior?as=mom&embed=1', [390, 844], tab(2), 32],
  ['senior-album-320', '/senior?as=mom&embed=1', [320, 640], tab(2)],
  ['family-text200-embed', '/family?as=jieun&embed=1', [390, 844], null, 32],
  ['family-text200-desktop', '/family?as=jieun', [1280, 800], null, 32],
  ['family-920-artifact', '/family?as=jieun', [920, 800], art],
  ['family-1024-artifact', '/family?as=jieun', [1024, 768], art],
  ['family-1440', '/family?as=jieun', [1440, 900]],
  ['family-390-side', '/family?as=minjun', [390, 844], side],
  ['family-320-side', '/family?as=minjun', [320, 640], side],
  ['family-embed', '/family?as=jieun&embed=1', [390, 844]],
  ['family-320', '/family?as=jieun&embed=1', [320, 640]],
  ['family-390-more', '/family?as=jieun&embed=1', [390, 844], click('button[aria-label="더 보기"]')],
  ['family-desktop-more', '/family?as=jieun', [1440, 900], click('button[aria-label="더 보기"]')],
];

(async () => {
  const b = await chromium.launch();
  const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
  for (const [name, url, vp, act, fs] of STATES) {
    if (only && !only.test(name)) continue;
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] } }); const p = await ctx.newPage();
    if (fs) { const cdp = await ctx.newCDPSession(p); await cdp.send('Page.enable'); await cdp.send('Page.setFontSizes', { fontSizes: { standard: fs } }); }
    await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200);
    await p.addStyleTag({ content: CSS });
    if (act) await act(p);
    await DOM(p); await FIX_POP(p); await p.waitForTimeout(400);
    await p.screenshot({ path: OUT + name + '.png' });
    const m = await p.evaluate(() => {
      const t = document.querySelector('.fam-head-name') || document.querySelector('.fam-head-title');
      const seg = document.querySelector('.sa-sheet .seg');
      const inp = document.querySelector('.cp-senior .cp-input, .cp-ta'); let ph = null;
      if (inp && !inp.value) { const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(inp); c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const tw = c.measureText(inp.placeholder).width; const av = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); ph = `${Math.round(tw)}/${Math.round(av)}${tw > av + 1 ? ' CLIPPED' : ''}`; }
      const btns = [...document.querySelectorAll('.fam-head-btn')].map(x => Math.round(x.getBoundingClientRect().height));
      const ml = document.querySelector('.ml');
      return { title: t ? `${t.textContent.slice(0, 22)} ${t.scrollWidth}x${t.scrollHeight}/${t.clientWidth}x${t.clientHeight}${(t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) ? ' TRUNC' : ''}` : null, seg: seg ? Math.round(seg.getBoundingClientRect().height) : null, ph, headBtnH: btns.join(','), thread: ml ? ml.clientHeight : null, ovf: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await p.evaluate(() => { window.__IMPECCABLE_CONFIG__ = { autoScan: false }; });
    await p.addScriptTag({ url: DETECT }); await p.waitForFunction(() => typeof window.impeccableDetectAsync === 'function', null, { timeout: 20000 });
    const f = await p.evaluate(async () => (await window.impeccableDetectAsync()) || []);
    const det = []; f.forEach(g => (g.findings || []).forEach(x => det.push(`${x.type}: ${(x.detail || '').slice(0, 120)}`)));
    console.log(`${name.padEnd(24)} det=${det.length} ${JSON.stringify(m)}`); det.forEach(d => console.log('    · ' + d));
    await ctx.close();
  }
  await b.close();
})();
