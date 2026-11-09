// axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A+AA + best-practice) over the key UI states. Read-only.
const { chromium } = require('playwright');
const path = require('path');
const AXE = path.join(__dirname, 'axe/package/axe.min.js');
const BASE = 'http://localhost:4100';
const tab = n => async p => { await p.click(`nav.sa-tabs button:nth-child(${n})`); await p.waitForTimeout(800); };
const click = s => async p => { await p.click(s); await p.waitForTimeout(700); };
const S = [
  ['senior-chat', '/senior?as=mom&embed=1', [390, 844]],
  ['senior-album', '/senior?as=mom&embed=1', [390, 844], tab(2)],
  ['senior-sheet', '/senior?as=mom&embed=1', [390, 844], async p => { await tab(2)(p); await p.click('.sa-grid .mt'); await p.waitForTimeout(700); }],
  ['senior-privacy', '/senior?as=mom&embed=1', [390, 844], tab(3)],
  ['senior-help', '/senior?as=mom&embed=1', [390, 844], click('button[aria-label="도움말"]')],
  ['senior-samples', '/senior?as=mom&embed=1', [390, 844], click('.cp-sample-btn')],
  ['senior-dark', '/senior?as=mom&embed=1&theme=dark', [390, 844]],
  ['family-embed', '/family?as=jieun&embed=1', [390, 844]],
  ['family-list', '/family?as=jieun', [390, 844]],
  ['family-mom', '/family?as=jieun&embed=1', [390, 844], click('button[aria-label="어머니 소식"]')],
  ['family-health', '/family?as=jieun&embed=1', [390, 844], async p => { await click('button[aria-label="어머니 소식"]')(p); await click('#mp-tab-health')(p); }],
  ['family-artifact', '/family?as=jieun&embed=1', [390, 844], click('.cd-art-head')],
  ['family-desktop', '/family?as=jieun', [1440, 900]],
  ['family-desktop-artifact', '/family?as=jieun', [1440, 900], click('.cd-art-head')],
  ['family-invite', '/family?as=jieun', [1440, 900], click('button[aria-label="초대"]')],
  ['family-newroom', '/family?as=jieun', [1440, 900], click('.fam-new')],
  ['family-more', '/family?as=jieun', [1440, 900], click('button[aria-label="더 보기"]')],
  ['family-dark', '/family?as=jieun&theme=dark', [1440, 900]],
  ['demo', '/demo?key=demo42', [1440, 900]],
  ['demo-graph', '/demo?key=demo42', [1440, 900], click('.dc-toggles button:nth-child(2)')],
  ['landing', '/', [390, 844]],
];
(async () => {
  const b = await chromium.launch();
  const tally = {};
  for (const [name, url, vp, act] of S) {
    const ctx = await b.newContext({ viewport: { width: vp[0], height: vp[1] } }); const p = await ctx.newPage();
    await p.goto(BASE + url, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200);
    if (act) await act(p);
    await p.addScriptTag({ path: AXE });
    const r = await p.evaluate(async () => {
      const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] });
      return { v: res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes.slice(0, 3).map(n => n.target.join(' ') + (n.failureSummary ? ' :: ' + n.failureSummary.split('\n').slice(1, 2).join('') : '')) })), inc: res.incomplete.map(v => v.id + '×' + v.nodes.length) };
    });
    console.log(`${name.padEnd(24)} violations=${r.v.length} ${r.v.map(v => `${v.id}(${v.impact})×${v.n}`).join(', ')}`);
    r.v.forEach(v => { tally[v.id] = (tally[v.id] || 0) + v.n; v.t.forEach(t => console.log('     ' + v.id + ': ' + t.slice(0, 200))); });
    console.log('     incomplete: ' + r.inc.join(', '));
    await ctx.close();
  }
  console.log('TALLY', JSON.stringify(tally));
  await b.close();
})();
