// Review loop: sends the plan, source and demo screenshots to OpenAI (gpt-6.1-sol, reasoning xhigh)
// and writes prioritized findings to docs/reviews/round-<n>.{json,md}.
// Usage: OPENAI_API_KEY=... ROUND=1 npx tsx scripts/qa/gpt-review.ts [--shots docs/reviews/shots]
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const MODEL = process.env.REVIEW_MODEL ?? 'gpt-6.1-sol';
const EFFORT = process.env.REVIEW_EFFORT ?? 'xhigh';
const ROUND = process.env.ROUND ?? '1';
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : join(ROOT, 'docs/reviews/shots');
const focus = process.env.REVIEW_FOCUS ?? '';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (/node_modules|dist|data|\.git|reviews/.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|md)$/.test(f) && st.size < 60_000) out.push(p);
  }
  return out;
}

const files = ['PLAN.md', ...walk(join(ROOT, 'shared')), ...walk(join(ROOT, 'server')), ...walk(join(ROOT, 'web/src'))]
  .map(p => (p.startsWith('/') ? p : join(ROOT, p)));
const bundle = files.map(p => `\n===== FILE: ${p.replace(ROOT, '')} =====\n${readFileSync(p, 'utf8')}`).join('');

const images = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter(f => extname(f) === '.png').sort().slice(0, 40)
  : [];

const instructions = `You are a world-class product reviewer, senior staff engineer and design critic judging a hackathon build.
Product: "Tachi" — an AI companion for Korean seniors that turns old photos + conversation into a memory graph (Kùzu),
recalls memories from keywords, checks in proactively, enforces privacy toward family, shares emotional memory summaries,
suggests nearby trips and itineraries, and runs a family room (health Q&A on public info, gathering artifact,
schedule coordination through per-member side chats, daily report). AI family bots make the 90‑second demo work alone.
UI must follow an achromatic "ChatGPT graphite-on-paper" system adapted for seniors (large type, ≥56px controls).
${focus ? `Extra focus this round: ${focus}` : ''}
Review the source bundle and the screenshots (phone 390×844 captures after each demo step; 9x = desktop).
Return STRICT JSON: {"scores": {"demo_readiness":0-10,"senior_ux":0-10,"family_ux":0-10,"ai_behavior":0-10,"robustness":0-10,"design_fidelity":0-10,"overall":0-10},
"summary": "3-5 sentences", "findings": [{"id":"F1","severity":"critical|high|medium|low","area":"demo|senior-ux|family-ux|ai|server|design|a11y|copy",
"file":"path or null","problem":"concrete, observed","evidence":"what in code/screenshot shows it","fix":"specific actionable change"}]}.
Order findings by impact on the live 90-second demo. Max 25 findings. Be concrete and verifiable; no generic advice.`;

const API = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
const HEADERS = { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? 'proxy-injected'}`, 'Content-Type': 'application/json' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  // Responses API in background mode: long xhigh reasoning runs server-side, we poll for the result.
  const content: unknown[] = [{ type: 'input_text', text: `SOURCE BUNDLE (${files.length} files):\n${bundle}` }];
  for (const f of images) {
    content.push({ type: 'input_text', text: `Screenshot: ${f}` });
    content.push({ type: 'input_image', image_url: `data:image/png;base64,${readFileSync(join(shotsDir, f)).toString('base64')}` });
  }
  const body = {
    model: MODEL,
    reasoning: { effort: EFFORT },
    instructions,
    input: [{ role: 'user', content }],
    text: { format: { type: 'json_object' } },
    max_output_tokens: 60000,
    background: true,
    store: true,
  };
  const t0 = Date.now();
  const created = await fetch(`${API}/responses`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  let json = await created.json() as any;
  if (!created.ok) { console.error(JSON.stringify(json, null, 2)); process.exit(1); }
  console.error(`review started: ${json.id} (${json.status})`);
  while (json.status === 'queued' || json.status === 'in_progress') {
    await sleep(15000);
    const r = await fetch(`${API}/responses/${json.id}`, { headers: HEADERS });
    const txt = await r.text();
    try { json = JSON.parse(txt); } catch { console.error('poll: non-JSON', txt.slice(0, 120)); continue; }
    console.error(`  ${Math.round((Date.now() - t0) / 1000)}s ${json.status}`);
  }
  if (json.status !== 'completed') { console.error(JSON.stringify(json.error ?? json, null, 2).slice(0, 2000)); process.exit(1); }
  const text: string = json.output_text ?? (json.output ?? []).flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  const outJson = join(ROOT, `docs/reviews/round-${ROUND}.json`);
  writeFileSync(outJson, JSON.stringify({ model: MODEL, effort: EFFORT, seconds: Math.round((Date.now() - t0) / 1000), usage: json.usage, ...parsed }, null, 2));
  const md = [`# GPT review — round ${ROUND} (${MODEL}, reasoning ${EFFORT})`, '', `**Scores:** ${Object.entries(parsed.scores).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '', parsed.summary, '',
    ...parsed.findings.map((f: any) => `- **${f.id} [${f.severity}] ${f.area}** ${f.file ? `\`${f.file}\`` : ''}\n  - Problem: ${f.problem}\n  - Evidence: ${f.evidence}\n  - Fix: ${f.fix}`)].join('\n');
  writeFileSync(join(ROOT, `docs/reviews/round-${ROUND}.md`), md);
  console.log(md);
}
main().catch(e => { console.error(e); process.exit(1); });
