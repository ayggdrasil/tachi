import './util/env';
import { nanoid } from 'nanoid';
import { createApp, lanUrls } from './orchestrator/app';
import { st } from './i18n';

// no key configured → mint one for this process so LAN visitors cannot take the Director seat
if (!process.env.TACHI_DIRECTOR_KEY) process.env.TACHI_DIRECTOR_KEY = nanoid(6);
const DIRECTOR_KEY = process.env.TACHI_DIRECTOR_KEY;
const PORT = Number(process.env.PORT || 4100);

const { listen, ctx } = await createApp({ dataDir: process.env.TACHI_DATA_DIR || undefined,  port: PORT });
await listen(PORT);

const urls = lanUrls(PORT);
const model = ctx.brain.getModelState();
const active = model.options.find(o => o.key === model.active);
console.log(`
  ┌─────────────────────────────────────────────┐
  │  ${st('boot.title')}
  └─────────────────────────────────────────────┘
   ${st('boot.local')}  http://localhost:${PORT}
${urls.map(u => `   ${st('boot.lan')}  ${u}`).join('\n') || `   ${st('boot.noNet')}`}
   ${st('boot.director')}  http://localhost:${PORT}/demo?key=${DIRECTOR_KEY}
   ${st('boot.model')}  ${active?.label ?? model.active}${active?.provider === 'mock' ? ` ${st('boot.offline')}` : ''}
   ${st('boot.graph')}  ${ctx.graph.engine === 'kuzu' ? st('boot.graph.kuzu') : st('boot.graph.mem')}
`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
process.on('unhandledRejection', e => console.warn('[tachi:warn] unhandledRejection', e));
