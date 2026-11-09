// LLM-driven 1:1 conversation with the senior: the model talks, the orchestrator validates and executes its actions.
import { SENIOR_ID, TACHI_ID } from '../../shared/constants';
import type { ID, Memory, Room } from '../../shared/types';
import type { AgentMemory, ChatTurn, MemoryDraft, SeniorAgentAction, SeniorAgentInput } from '../brain/contract';
import { yesNo } from '../brain/heuristics/ko';
import { placeById, resolvePlace } from '../data/places';
import { st } from '../i18n';
import { ctx } from './ctx';
import { getHealth, now, senior, tachiSay, withTyping } from './core';
import { getLocale } from './locale';
import { clearProactiveMemory, getProactiveMemory } from './proactive';
import { logSeniorSession } from './sessions';
import {
  RECORD_CLAIM_RE, acceptCurrentTrip, applyObservation, commitMemory, declineCurrentTrip, doShare, getPending,
  kInterview, logHealth, offerTripForMemory, postRecallCard, resolvePhotoPath, setLastMemory, setPending, skipShare, stripRecordClaims,
} from './senior';
import { nowIso, uid, warn } from '../util/misc';
import type { InterviewState } from '../brain/contract';

const kDraft = (roomId: ID) => `agent-draft:${roomId}`;
const DRAFT_TTL_MS = 6 * 3600 * 1000;
interface StoredDraft { draft: MemoryDraft; at: string }

function loadDraft(roomId: ID): MemoryDraft | undefined {
  const s = ctx.db.kv.get<StoredDraft>(kDraft(roomId));
  if (!s) return undefined;
  if (now().getTime() - new Date(s.at).getTime() > DRAFT_TTL_MS) { ctx.db.kv.del(kDraft(roomId)); return undefined; }
  return s.draft;
}
function saveDraft(roomId: ID, draft: MemoryDraft | undefined): void {
  if (draft) ctx.db.kv.set<StoredDraft>(kDraft(roomId), { draft, at: now().toISOString() });
  else ctx.db.kv.del(kDraft(roomId));
}

const str = (x: unknown, max = 600): string | undefined => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : undefined);
const strList = (x: unknown, n: number, max = 40): string[] =>
  Array.isArray(x) ? [...new Set(x.map(v => str(v, max)).filter((v): v is string => !!v))].slice(0, n) : [];
const people = (x: unknown): { name: string; relation?: string }[] => {
  if (!Array.isArray(x)) return [];
  const out: { name: string; relation?: string }[] = [];
  for (const p of x) {
    const name = str((p as { name?: unknown })?.name, 40);
    if (!name || out.some(o => o.name === name)) continue;
    const relation = str((p as { relation?: unknown })?.relation, 30);
    out.push(relation ? { name, relation } : { name });
  }
  return out.slice(0, 12);
};
const year = (x: unknown): number | undefined => {
  const n = typeof x === 'number' ? x : typeof x === 'string' ? Number(x) : NaN;
  return Number.isInteger(n) && n >= 1800 && n <= now().getFullYear() ? n : undefined;
};

/** Whitelisted draft fields only (the model never writes photoUrl / ids). */
function cleanDraft(x: unknown): MemoryDraft {
  const d = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const out: MemoryDraft = {};
  for (const k of ['title', 'story', 'summary', 'era', 'season', 'place', 'event'] as const) { const v = str(d[k], k === 'story' ? 2000 : 200); if (v) out[k] = v; }
  const y = year(d.year); if (y) out.year = y;
  const pid = str(d.placeId, 80); if (pid && placeById(pid)) out.placeId = pid;
  const ppl = people(d.people); if (ppl.length) out.people = ppl;
  const em = strList(d.emotions, 6); if (em.length) out.emotions = em;
  const tg = strList(d.tags, 10); if (tg.length) out.tags = tg;
  return out;
}

function mergeDraft(old: MemoryDraft | undefined, patch: MemoryDraft): MemoryDraft {
  const o = old ?? {};
  const union = <T,>(a: T[] | undefined, b: T[] | undefined, key: (t: T) => string): T[] | undefined => {
    const m = new Map<string, T>();
    for (const t of [...(a ?? []), ...(b ?? [])]) m.set(key(t), typeof t === 'string' ? t : { ...(m.get(key(t)) ?? {}), ...t });
    return m.size ? [...m.values()] : undefined;
  };
  const out: MemoryDraft = { ...o, ...patch, photoUrl: o.photoUrl };
  const ppl = union(o.people, patch.people, p => p.name); if (ppl) out.people = ppl.slice(0, 12);
  const em = union(o.emotions, patch.emotions, e => e); if (em) out.emotions = em.slice(0, 6);
  const tg = union(o.tags, patch.tags, e => e); if (tg) out.tags = tg.slice(0, 10);
  if (out.photoUrl === undefined) delete out.photoUrl;
  return out;
}

const STOP = new Set(['the', 'and', 'was', 'were', 'that', 'this', 'with', 'for', 'you', 'your', 'about', 'what', 'when', 'where', 'who', 'how', 'did', 'does', 'have', 'has', 'had',
  'remember', 'tell', 'told', 'show', 'can', 'could', 'would', 'will', 'our', 'ours', 'one', 'there', 'then', 'they', 'them', 'she', 'her', 'his', 'him', 'but', 'not', 'yes',
  'okay', 'please', 'thank', 'thanks', 'like', 'just', 'some', 'any', 'from', 'into', 'been', 'being', 'are', 'its', 'let', 'lets', 'want', 'went', 'got', 'get']);
function keywordsOf(text: string): string[] {
  const toks = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = toks.filter(t => (/[가-힣]/.test(t) ? t.length >= 2 : t.length >= 3 && !STOP.has(t)));
  return [...new Set(out)].slice(0, 8);
}

const asAgentMemory = (m: Memory): AgentMemory => ({
  id: m.id, title: m.title, summary: m.summary, story: m.story.slice(0, 700), year: m.year, season: m.season, place: m.place,
  people: m.people, event: m.event, emotions: m.emotions, visibility: m.visibility,
});

function historyOf(roomId: ID, exceptId?: ID): ChatTurn[] {
  const rows = ctx.db.messages.byRoom(roomId, 28).filter(m => m.id !== exceptId && m.senderId !== 'system' && m.text);
  return rows.slice(-16).map(m => {
    const mine = m.senderId !== TACHI_ID;
    const text = m.kind === 'text' ? m.text : m.kind === 'photo' ? `[photo] ${m.text}` : `[${m.kind}] ${m.text}`;
    return { role: mine ? 'user' as const : 'assistant' as const, text: text.slice(0, 500) };
  });
}

async function gatherMemories(message: string): Promise<AgentMemory[]> {
  const saved = ctx.db.memories.all().filter(m => m.status === 'saved' && m.ownerId === SENIOR_ID);
  const picked = new Map<ID, Memory>();
  const kws = keywordsOf(message);
  if (kws.length) {
    let hits = await ctx.graph.search(kws, { limit: 3 }).catch(() => []);
    // nothing by name in the graph: let the optional GBrain mirror suggest memories by free text ([] when it is off)
    if (!hits.some(h => ctx.db.memories.get(h.memoryId)?.status === 'saved')) hits = await ctx.graph.deepRecall(message, { limit: 3 });
    for (const h of hits) { const m = ctx.db.memories.get(h.memoryId); if (m?.status === 'saved') picked.set(m.id, m); }
  }
  const pm = getProactiveMemory();
  const pmem = pm ? ctx.db.memories.get(pm.memoryId) : undefined;
  if (pmem?.status === 'saved') picked.set(pmem.id, pmem);
  for (const m of [...saved].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3)) picked.set(m.id, m);
  return [...picked.values()].slice(0, 7).map(asAgentMemory);
}

/** The senior signals the story is complete ("that's all", "please remember it", "그게 다야", "기억해 줘"). */
const DONE_RE = /that'?s (all|it|the (whole )?story)|remember (it|this|that)|keep (it|this)|save (it|this)|그게\s*다|다야|끝이야|이게\s*다|기억해\s*(줘|주|둬)|저장해/i;

function decadeEra(y: number): string { return getLocale() === 'ko' ? `${Math.floor(y / 10) * 10}년대` : `${Math.floor(y / 10) * 10}s`; }

/** Validate the model's memory and build the record (private until the senior shares it). */
function buildMemory(raw: unknown, draft: MemoryDraft | undefined): Memory | null {
  const d = mergeDraft(draft, cleanDraft(raw));
  const story = d.story ?? d.summary ?? '';
  const title = d.title ?? (story ? story.slice(0, 40) : '');
  if (!title || (story.length < 8 && !d.summary)) return null;
  const placeId = d.placeId ?? (d.place ? resolvePlace(d.place)?.place.id : undefined);
  const photoUrl = d.photoUrl && (d.photoUrl.startsWith('/uploads/') || d.photoUrl.startsWith('/demo-photos/')) ? d.photoUrl : undefined;
  return {
    id: uid('mem'), ownerId: SENIOR_ID, ...(photoUrl ? { photoUrl } : {}), title, story: story || title, summary: d.summary ?? story.slice(0, 90) ?? title,
    ...(d.year ? { year: d.year } : {}), ...(d.era || d.year ? { era: d.era ?? decadeEra(d.year!) } : {}), ...(d.season ? { season: d.season } : {}),
    ...(d.place ? { place: d.place } : {}), ...(placeId ? { placeId } : {}), people: d.people ?? [], ...(d.event ? { event: d.event } : {}),
    emotions: d.emotions ?? [], tags: d.tags ?? [], visibility: 'private', status: 'saved', createdAt: nowIso(),
  };
}

const savedMemory = (id: unknown): Memory | undefined => {
  const m = typeof id === 'string' ? ctx.db.memories.get(id) : undefined;
  return m && m.status === 'saved' && m.ownerId === SENIOR_ID ? m : undefined;
};

/**
 * One LLM turn in the senior's room. Returns false when the model answered with the offline fallback (or failed):
 * the caller then runs the heuristic pipeline unchanged.
 */
export async function agentTurn(room: Room, text: string | undefined, photoUrl: string | undefined, msgId?: ID): Promise<boolean> {
  const message = (text ?? '').trim();
  let draft = loadDraft(room.id);
  if (photoUrl) {
    clearProactiveMemory();
    setPending(room.id, null);
    draft = { ...(draft ?? {}), photoUrl };
  }
  // an unfinished offline interview would be orphaned by the agent: drop it together with its draft row
  const old = ctx.db.kv.get<InterviewState>(kInterview(room.id));
  if (old) { const row = ctx.db.memories.get(old.memoryId); if (row?.status === 'draft') ctx.db.memories.delete(row.id); ctx.db.kv.del(kInterview(room.id)); }
  if (draft) draft = { ...draft, turns: (draft.turns ?? 0) + 1 };

  const pending = getPending(room.id);
  const input: SeniorAgentInput = {
    locale: getLocale(), senior: senior(), history: historyOf(room.id, msgId), message,
    ...(photoUrl ? { photo: { url: photoUrl, path: resolvePhotoPath(photoUrl) } } : {}),
    memories: await gatherMemories(message),
    allMemoryTitles: ctx.db.memories.all().filter(m => m.status === 'saved').map(m => ({ id: m.id, title: m.title })),
    ...(draft ? { draft } : {}), pending: pending?.type ?? null, health: getHealth(), now: now(),
  };
  const ai = await withTyping(room.id, () => ctx.brain.seniorAgentTurn(input));
  const turn = ai?.value;
  const actions: SeniorAgentAction[] = Array.isArray(turn?.actions) ? turn.actions.filter(a => a && typeof a === 'object') : [];
  let reply = typeof turn?.reply === 'string' ? turn.reply.trim() : '';
  if (!ai || ai.fallback || (!reply && !actions.length)) return false;
  // the offline fallback never reaches here; from now on the turn is committed (no heuristic re-run)
  if (draft) saveDraft(room.id, draft);
  if (!reply) reply = st('senior.thanksTelling');

  let chips = Array.isArray(turn.quickReplies) ? turn.quickReplies.map(c => str(c, 40)).filter((c): c is string => !!c).slice(0, 3) : [];
  // observations are stored before the reply is shown so Tachi never claims a record that did not happen
  let askMed = false;
  for (const a of actions) if (a.type === 'log_health' && a.observation) askMed = applyObservation(a.observation).ask || askMed;
  if (askMed) { reply = st('senior.askWhichMed'); chips = [st('senior.askWhichMed.c1'), st('senior.askWhichMed.c2')]; }
  else if (RECORD_CLAIM_RE.test(reply) && !actions.some(a => a.type === 'log_health' || a.type === 'save_memory' || a.type === 'update_draft')) reply = stripRecordClaims(reply);

  // A NEW memory is pushed to the DB only once the story has had room to grow: at least two story turns,
  // or the senior says she is done. An early save becomes a draft and Tachi keeps listening instead.
  const storyTurns = draft?.turns ?? 0;
  const saveReady = storyTurns >= 2 || DONE_RE.test(message);
  const early = actions.find(a => a.type === 'save_memory');
  if (early && !saveReady) {
    const idx = actions.indexOf(early);
    actions[idx] = { type: 'update_draft', draft: cleanDraft((early as { memory?: unknown }).memory) ?? {} } as SeniorAgentAction;
    if (!draft) draft = { turns: 1 };
    reply = st('senior.agent.tellMore');
    chips = [];
  }
  const memoryTalk = !!draft || actions.some(a => ['save_memory', 'update_draft', 'show_memory'].includes(a.type));
  const healthTalk = actions.some(a => a.type === 'log_health');
  await tachiSay(room.id, { text: reply, quickReplies: chips, meta: { category: healthTalk ? 'health' : memoryTalk ? 'memory' : 'daily' } }, ai);

  let saved = false;
  let logged = false;
  let sharedOrDeclined = false;
  for (const a of actions) {
    try {
      switch (a.type) {
        case 'update_draft': {
          const base = loadDraft(room.id) ?? draft ?? { turns: 1 };
          const merged = { ...mergeDraft(base, cleanDraft((a as { draft?: unknown }).draft)), turns: base.turns ?? 1 };
          draft = merged;
          saveDraft(room.id, merged);
          break;
        }
        case 'save_memory': {
          if (saved) break;
          const mem = buildMemory((a as { memory?: unknown }).memory, loadDraft(room.id) ?? draft);
          if (!mem) break;
          const dup = ctx.db.memories.all().find(m => m.status === 'saved' && m.title.toLowerCase() === mem.title.toLowerCase());
          if (dup) break; // already kept: never twice
          saved = logged = true;
          saveDraft(room.id, undefined);
          draft = undefined;
          await commitMemory(room, mem, ai);
          break;
        }
        case 'show_memory': {
          const mem = savedMemory((a as { memoryId?: unknown }).memoryId);
          if (!mem) break;
          clearProactiveMemory();
          setLastMemory(mem.id);
          await postRecallCard(room.id, mem, `${mem.title} · ${mem.summary}`, ai);
          logSeniorSession('memory', st('senior.sess.recall'), st('senior.sess.recallSummary', { title: mem.title }), mem.id);
          logged = true;
          break;
        }
        case 'share_memory': {
          const mem = savedMemory((a as { memoryId?: unknown }).memoryId);
          if (!mem || !message) break;
          sharedOrDeclined = true;
          await doShare(room.id, mem.id);
          break;
        }
        case 'suggest_trip': {
          const mem = savedMemory((a as { memoryId?: unknown }).memoryId);
          if (mem) await offerTripForMemory(room, mem);
          break;
        }
        case 'accept_trip': sharedOrDeclined = true; await acceptCurrentTrip(room); break;
        case 'decline_trip': sharedOrDeclined = true; await declineCurrentTrip(room); break;
        case 'log_health': {
          const sys = Number((a as { systolic?: unknown }).systolic);
          const dia = Number((a as { diastolic?: unknown }).diastolic);
          if (Number.isFinite(sys) && Number.isFinite(dia) && sys > 0 && dia > 0) { await logHealth(room, message, Math.round(sys), Math.round(dia)); logged = true; }
          else if ((a as { observation?: unknown }).observation) logged = false;
          break;
        }
        default: break; // unknown action: ignored
      }
    } catch (e) { warn(`senior agent action ${String((a as { type?: unknown }).type)} failed:`, e); }
  }

  // a plain "no" to a waiting consent / trip offer is honoured even if the model forgot the action (its reply already answered)
  if (pending && !sharedOrDeclined && message && yesNo(message) === 'no') {
    if (pending.type === 'share_confirm') await skipShare(room.id, pending.memoryId, { quiet: true });
    else if (pending.type === 'trip_confirm') await declineCurrentTrip(room);
  }
  if (!logged && !ctx.db.kv.get<string>('active-proactive')) {
    const cat = healthTalk ? 'health' : memoryTalk ? 'memory' : 'daily';
    const title = st(`senior.sess.cat.${cat}`);
    logSeniorSession(cat, title, st('senior.sess.catSummary', { title }));
  }
  return true;
}
