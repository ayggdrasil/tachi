// LLM senior agent path with a stubbed brain: the model decides, the orchestrator persists / shows / shares.
//   npx tsx server/scripts/agent.test.ts
import '../util/env';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { FAMILY_ROOM_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Bootstrap, ClientToServerEvents, Message, ServerToClientEvents } from '../../shared/types';
import type { AIResult, Brain, SeniorAgentInput, SeniorAgentTurn } from '../brain/contract';
import { createBrain } from '../brain/index';
import { createApp } from '../orchestrator/app';

let failures = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`); if (!ok) failures++; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function waitFor<T>(label: string, fn: () => T | undefined | false, timeoutMs = 15000): Promise<T | undefined> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) { const v = fn(); if (v) return v; await sleep(60); }
  check(false, `timeout waiting for ${label}`);
  return undefined;
}

// ── stub brain: the real offline brain, but "live" with a scripted agent ──
const inputs: SeniorAgentInput[] = [];
let script: (i: SeniorAgentInput) => { turn: SeniorAgentTurn; fallback?: boolean } = () => ({ turn: { reply: 'ok', quickReplies: [], actions: [] } });
const real = createBrain();
const brain: Brain = {
  ...real,
  isLive: () => true,
  async seniorAgentTurn(i: SeniorAgentInput): Promise<AIResult<SeniorAgentTurn>> {
    inputs.push(i);
    const r = script(i);
    return { value: r.turn, model: 'Stub LLM', fallback: !!r.fallback, source: r.fallback ? 'heuristic' : 'llm' };
  },
};

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tachi-agent-'));
  const { listen, close, ctx } = await createApp({ port: 0, dataDir, paceMs: 40, quiet: true, locale: 'en', brain });
  const port = await listen(0);
  const url = `http://localhost:${port}`;
  const sock = connect(url, { transports: ['websocket'], forceNew: true }) as Socket<ServerToClientEvents, ClientToServerEvents>;
  const msgs: Message[] = [];
  sock.on('message:new', m => msgs.push(m));
  sock.on('message:update', m => { const i = msgs.findIndex(x => x.id === m.id); if (i >= 0) msgs[i] = m; });
  await new Promise<void>(r => sock.on('connect', () => r()));
  const boot = await new Promise<Bootstrap>((res, rej) => sock.emit('hello', { userId: 'mom' }, b => ('error' in b ? rej(new Error(b.error)) : res(b))));
  msgs.push(...Object.values(boot.messages).flat());
  const say = (text?: string, photoUrl?: string) => sock.emit('message:send', { roomId: SENIOR_ROOM_ID, text, photoUrl });
  const since = (t0: number, roomId = SENIOR_ROOM_ID) => msgs.filter(m => m.roomId === roomId && Date.parse(m.createdAt) >= t0);

  // 1) a photo → LLM first question (vision input), draft started with the photo
  script = i => ({ turn: { reply: 'What a lovely photo! Where was it taken?', quickReplies: ['At the market', 'At home'], actions: [{ type: 'update_draft', draft: { title: 'Market day' } }] }, fallback: false });
  let t0 = Date.now();
  say(undefined, '/demo-photos/gyeongju-1984.jpg');
  const q1 = await waitFor('LLM first question', () => since(t0).find(m => m.senderId === 'tachi' && m.text.startsWith('What a lovely photo')));
  check(!!q1 && q1.meta?.source === 'llm' && q1.meta?.model === 'Stub LLM' && q1.quickReplies?.length === 2, 'photo gets an LLM first question with chips and LLM attribution');
  check(inputs.at(-1)?.photo?.url === '/demo-photos/gyeongju-1984.jpg' && inputs.at(-1)?.locale === 'en', 'agent input carries the photo and locale');
  check(ctx.db.memories.all().filter(m => m.status !== 'saved').length === 0 && ctx.db.memories.all().length === 3, 'no memory is created by merely starting a draft');

  // 2) a story turn → draft updated, still nothing saved; the model sees the draft + prior turns
  script = () => ({ turn: { reply: 'And who was with you?', quickReplies: [], actions: [{ type: 'update_draft', draft: { place: 'Namdaemun Market, Seoul', year: 1984, people: [{ name: 'Youngsu Park', relation: 'husband' }] } }] } });
  t0 = Date.now();
  say('It was the old Namdaemun market, 1984.');
  await waitFor('draft question', () => since(t0).find(m => m.senderId === 'tachi' && m.text === 'And who was with you?'));
  check(ctx.db.memories.all().length === 3, 'still nothing saved while the story is being collected');
  check(inputs.at(-1)?.draft?.photoUrl === '/demo-photos/gyeongju-1984.jpg' && !!inputs.at(-1)?.history.some(h => h.role === 'assistant' && h.text.includes('lovely photo')), 'input has the draft (photo) and the recent turns');
  check((inputs.at(-1)?.memories.length ?? 0) > 0 && inputs.at(-1)?.allMemoryTitles.length === 3, 'input has memories and all titles');

  // 2b) a save after only two of her answers is held back: still a draft, and Tachi asks about what is missing
  //     (when/where and who are known here, so it asks what happened) instead of closing the story
  script = () => ({ turn: { reply: 'I have saved your memory.', quickReplies: [], actions: [{ type: 'save_memory', memory: {
    title: 'Spring 1984, Namdaemun Market', story: 'Youngsu and I went to Namdaemun Market in 1984.', summary: 'Market day.', year: 1984,
    place: 'Namdaemun Market, Seoul', people: [{ name: 'Youngsu Park', relation: 'husband' }], emotions: [], tags: [],
  } }] } });
  t0 = Date.now();
  say('Youngsu and I went together.');
  const held = await waitFor('held-back save', () => since(t0).find(m => m.senderId === 'tachi' && m.kind === 'text'));
  await sleep(300);
  check(ctx.db.memories.all().length === 3 && !since(t0).some(m => m.kind === 'memory_card'), 'photo + two answers: the save is held back (the photo is not an answer)');
  check(!!held && /what do you remember most/i.test(held.text) && !/saved/i.test(held.text), 'held-back save asks what happened, never claims it was saved');
  check(ctx.db.kv.get<{ draft: { turns?: number; people?: unknown[] } }>(`agent-draft:${SENIOR_ROOM_ID}`)?.draft.turns === 2, 'draft counts only her two spoken answers');

  // 3) the model decides the memory is complete → save_memory persists it exactly like a finished interview
  script = () => ({ turn: {
    reply: 'What a wonderful memory. I will keep it safe.', quickReplies: [],
    actions: [{ type: 'save_memory', memory: {
      title: 'Spring 1984, shopping at Namdaemun Market', story: 'In spring 1984 Youngsu and I walked through Namdaemun Market and bought tangerines for the children.',
      summary: 'A spring day of tangerines at Namdaemun Market.', year: 1984, season: 'Spring', place: 'Namdaemun Market, Seoul',
      people: [{ name: 'Youngsu Park', relation: 'husband' }], event: 'Shopping', emotions: ['Happiness'], tags: ['tangerines'],
    } }],
  } });
  t0 = Date.now();
  say('We bought tangerines for the kids and Youngsu carried them all the way home.');
  const card = await waitFor('memory_card', () => since(t0).find(m => m.kind === 'memory_card'));
  const saved = ctx.db.memories.all().find(m => m.title === 'Spring 1984, shopping at Namdaemun Market');
  check(!!saved && saved.status === 'saved' && saved.visibility === 'private' && saved.ownerId === 'mom', 'memory persisted in SQLite, private');
  check(saved?.photoUrl === '/demo-photos/gyeongju-1984.jpg', "the draft's photo is attached");
  check(!!card && !!card.actions?.some(a => a.id === 'share_memory') && !!card.actions?.some(a => a.id === 'skip_share'), 'memory_card with consent buttons posted');
  check(card?.payload?.type === 'memory_card' && card.payload.graphDelta.nodes.length > 0, 'memory_card carries the graph delta');
  const hits = await ctx.graph.search(['Namdaemun'], { limit: 3 });
  check(hits.some(h => h.memoryId === saved?.id), 'graph updated: the new memory is searchable');
  check(since(t0).some(m => m.senderId === 'tachi' && /share it with the family/i.test(m.text)), 'consent prompt posted');
  check(!ctx.db.kv.get(`agent-draft:${SENIOR_ROOM_ID}`), 'draft cleared after saving');
  check(!since(t0, FAMILY_ROOM_ID).some(m => m.kind === 'share_card'), 'nothing reached the family before consent');

  // 4) share_memory goes through doShare (consent card flow); the memory saved on the previous turn is not shown again
  script = () => ({ turn: { reply: 'Sending it to the family now.', quickReplies: [], actions: [{ type: 'share_memory', memoryId: saved!.id }, { type: 'show_memory', memoryId: saved!.id }] } });
  t0 = Date.now();
  say('Yes please, send it.');
  await waitFor('share_card', () => since(t0, FAMILY_ROOM_ID).find(m => m.kind === 'share_card'));
  check(ctx.db.memories.get(saved!.id)?.visibility === 'family', 'share_memory shared via the existing doShare');
  await sleep(300);
  check(!since(t0).some(m => m.kind === 'recall_card'), 'no recall card for the memory saved on the previous turn');

  // 5) show_memory → recall_card; unknown ids are ignored
  script = () => ({ turn: { reply: 'Here is that day.', quickReplies: [], actions: [{ type: 'show_memory', memoryId: 'mem-haeundae-1988' }, { type: 'show_memory', memoryId: 'mem-nope' }, { type: 'launch_rocket' } as never] } });
  t0 = Date.now();
  say('Tell me about the beach again.');
  const recall = await waitFor('recall_card', () => since(t0).find(m => m.kind === 'recall_card'));
  check(recall?.payload?.type === 'recall_card' && recall.payload.memoryId === 'mem-haeundae-1988', 'show_memory posts a recall_card for that memory');
  await sleep(400);
  check(since(t0).filter(m => m.kind === 'recall_card').length === 1, 'unknown memory ids / actions are ignored');

  // 6) a hallucinated duplicate save is not stored twice
  const before = ctx.db.memories.all().length;
  script = () => ({ turn: { reply: 'Saved.', quickReplies: [], actions: [{ type: 'save_memory', memory: { title: 'Spring 1984, shopping at Namdaemun Market', story: 'In spring 1984 Youngsu and I walked through Namdaemun Market.', summary: 'dup', people: [], emotions: [], tags: [] } }] } });
  t0 = Date.now();
  say('anything');
  const dupReply = await waitFor('dup turn', () => since(t0).find(m => m.senderId === 'tachi' && m.kind === 'text'));
  await sleep(300);
  check(ctx.db.memories.all().length === before, 'duplicate save_memory is ignored');
  // 6b) a save on the very first message of a new story is held back: Tachi keeps listening and the story becomes a draft
  check(!!dupReply && dupReply.text !== 'Saved.' && /tell me a little more/i.test(dupReply.text), 'first-message save is deferred: Tachi asks for more');
  check(!!ctx.db.kv.get(`agent-draft:${SENIOR_ROOM_ID}`), 'deferred save is kept as a draft');
  ctx.db.kv.del(`agent-draft:${SENIOR_ROOM_ID}`);

  // 7) fallback result → the offline heuristic pipeline answers instead (unchanged behavior)
  script = () => ({ turn: { reply: 'FALLBACK TEXT', quickReplies: [], actions: [] }, fallback: true });
  t0 = Date.now();
  say('Good morning!');
  const fb = await waitFor('heuristic reply', () => since(t0).find(m => m.senderId === 'tachi'));
  check(!!fb && fb.text !== 'FALLBACK TEXT' && fb.meta?.model !== 'Stub LLM', `fallback → offline pipeline replies: ${fb?.text.slice(0, 50)}`);

  sock.close();
  await close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(failures ? `\nAGENT TEST FAILED (${failures})` : '\nAGENT TEST OK');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
