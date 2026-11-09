import './util/env';
import { nanoid } from 'nanoid';
import { createApp, lanUrls } from './orchestrator/app';

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
  │  타치 Tachi 서버가 시작됐어요                 │
  └─────────────────────────────────────────────┘
   로컬        http://localhost:${PORT}
${urls.map(u => `   같은 Wi-Fi  ${u}`).join('\n') || '   (네트워크 주소를 찾지 못했어요)'}
   디렉터      http://localhost:${PORT}/demo?key=${DIRECTOR_KEY}
   모델        ${active?.label ?? model.active}${active?.provider === 'mock' ? ' (API 키 없이 오프라인 데모 모드)' : ''}
   그래프      ${ctx.graph.engine === 'kuzu' ? 'Kùzu 그래프 DB' : '인메모리 그래프'}
`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0));
process.on('unhandledRejection', e => console.warn('[tachi:warn] unhandledRejection', e));
