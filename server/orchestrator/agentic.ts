// Agent-loop integration with the state machine as the safety net.
//  - Live LLM configured + a suitable request → brain.runAgent (plan → tools → verify).
//  - Offline demo brain → only the deterministic planner's request shapes (reminders, routes).
//  - Anything else, or any failure / timeout / refusal / invalid output → return false and the caller runs the
//    existing state-machine path unchanged.
import { SENIOR_ID, SENIOR_ROOM_ID } from '../../shared/constants';
import type { Message, MessageMeta, PrivacyCategory, Room, User } from '../../shared/types';
import { agentSystemPrompt } from '../brain/toolLoop';
import { questionCategory } from '../brain/heuristics/family';
import { planOffline } from '../brain/planner';
import { dueReminders, markDelivered, reminderCategory } from '../tools/reminders';
import { whenLabel } from '../tools/time';
import { toolsFor, type ToolAudience, type ToolContext } from '../tools';
import type { ToolNotice } from '../tools/types';
import { ctx } from './ctx';
import { displayName, getPrivacy, isStale, memoryVisibleToFamily, now, senior, tachiSay, withTyping } from './core';
import { logSeniorSession } from './sessions';
import { warn } from '../util/misc';
import { st } from '../i18n';
import { isKo } from './locale';

const COMMON = String.raw`리마인더|알림|깨워\s*줘|잊지\s*않게|가는\s*길|어떻게\s*가|가려면|교통편?|얼마나\s*걸려|(?:근처|주변).{0,10}(?:어디|뭐|추천|가볼|구경)`;
// English request shapes (reminders, routes, places); none of the DEMO_SCRIPT_EN lines match them.
const COMMON_EN = String.raw`\bremind|\breminders?\b|\bwake (?:me|her|mom) up\b|don'?t let (?:me|her|mom) forget|\bhow (?:do|can|would|should|does) (?:i|we|she|mom|you) (?:get|go|travel)\b|\bdirections?\b|\broute to\b|\bhow (?:long|far)\b.{0,40}\b(?:to|from)\b|\b(?:near(?:by)?|around|close to)\b.{0,30}\b(?:visit|see|go|places?|things|spots?|worth|recommend)\b|\b(?:visit|see|go|places?|things|spots?|worth|recommend)\b.{0,30}\b(?:near(?:by)?|around|close to)\b`;
/** Senior requests worth a live tool loop (reminders, routes, places). Recall / trip / share keep their card flows. */
export const SENIOR_AGENT_RE = new RegExp(`${COMMON}|알려\\s*(?:줘|주세요)|${COMMON_EN}`, 'i');
/** Family requests worth a live tool loop: the above plus memory questions (graph_search, family-visible only). */
export const FAMILY_AGENT_RE = new RegExp(`${COMMON}|알려\\s*드려|추억|기억|옛날|사진|${COMMON_EN}|\\bmemor(?:y|ies)\\b|\\bthe old days\\b|\\bphotos?\\b`, 'i');
const REMINDISH = /리마인더|알림|알려\s*(?:줘|드려)|깨워|잊지\s*않게|\bremind|\breminders?\b|\bwake (?:me|her|mom) up\b|don'?t let (?:me|her|mom) forget/i;

/** Is a live (non-demo) model active with its key present? (The brain re-checks the circuit breaker.) */
export function liveModelActive(): boolean {
  const st = ctx.brain.getModelState();
  const o = st.options.find(x => x.key === st.active);
  return !!o && o.provider !== 'mock' && o.available;
}

function toolContext(audience: ToolAudience, callerId: string, notices: ToolNotice[]): ToolContext {
  return {
    audience, callerId, seniorId: SENIOR_ID, now: () => now(), db: ctx.db, graph: ctx.graph,
    privacy: getPrivacy, memoryVisibleToFamily: id => memoryVisibleToFamily(ctx.db.memories.get(id)), users: () => ctx.db.users.all(),
    notify: n => notices.push(n),
  };
}

/** Last line of defence for family answers: never name a hidden memory. */
function leaksPrivate(text: string): boolean {
  const hidden = ctx.db.memories.all().filter(m => !memoryVisibleToFamily(m)).map(m => m.title).filter(t => t && t.length >= 3);
  return hidden.some(t => text.includes(t));
}

async function surface(notices: ToolNotice[]): Promise<void> {
  for (const n of notices) {
    if (isStale()) return;
    if (n.kind === 'reminder_created' && n.reminder.createdBy !== SENIOR_ID) {
      await tachiSay(SENIOR_ROOM_ID, {
        text: st('agent.reminderBy', { name: displayName(n.reminder.createdBy), when: whenLabel(new Date(n.reminder.dueAt)), text: n.reminder.text }),
        meta: { category: n.reminder.category, source: 'rule' },
      });
    }
  }
}

/**
 * Try to answer with the agent loop. Returns the posted message, or undefined when the caller must run the state machine.
 * Never throws for agent problems (they are logged and fall back).
 */
export async function tryToolLoop(room: Room, audience: ToolAudience, asker: User, text: string): Promise<Message | undefined> {
  if (!ctx.brain.runAgent) return undefined;
  const offline = planOffline(text, audience, now()) !== null;
  const cat = questionCategory(text);
  const liveSuitable = liveModelActive() && (audience === 'senior'
    ? SENIOR_AGENT_RE.test(text)
    : FAMILY_AGENT_RE.test(text) && (!(cat === 'health' || cat === 'mood') || REMINDISH.test(text)));
  if (!liveSuitable && !offline) return undefined;

  const notices: ToolNotice[] = [];
  const toolCtx = toolContext(audience, asker.id, notices);
  let ai;
  try {
    ai = await withTyping(room.id, () => ctx.brain.runAgent!({
      goal: text, audience, tools: toolsFor(audience), toolCtx, allowOffline: offline, offlineOnly: !liveSuitable,
      system: agentSystemPrompt({ audience, senior: senior(), asker, users: ctx.db.users.all(), now: now() }),
    }));
  } catch (e) {
    warn('agent crashed, falling back:', e);
    await surface(notices).catch(() => undefined);
    return undefined;
  }
  const out = ai.value;
  if (!out.ok || !out.answer) { await surface(notices); return undefined; }
  if (audience === 'family' && leaksPrivate(out.answer)) {
    warn('agent answer named private data; falling back');
    await surface(notices);
    return undefined;
  }
  const cats = out.provenance.categories;
  const meta: MessageMeta = {
    toolsUsed: out.toolsUsed,
    ...(audience === 'family' && cats.length ? { category: cats[0], categoriesUsed: cats } : {}),
    ...(audience === 'family' && out.provenance.memoryIds.length ? { memoryIdsUsed: out.provenance.memoryIds } : {}),
  };
  const msg = await tachiSay(room.id, { text: out.answer, meta }, ai);
  await surface(notices);
  if (audience === 'senior') {
    const health = out.steps.some(s => s.ok && s.name === 'reminder_create' && reminderCategory(String((s.input as { text?: string })?.text ?? '')) === 'health');
    const category: PrivacyCategory = health ? 'health' : 'daily';
    if (!ctx.db.kv.get<string>('active-proactive')) logSeniorSession(category, st('agent.sess.title'), st('agent.sess.summary'));
  }
  return msg;
}

/** Deliver reminders that are due on the demo clock (called from the proactive ticker). */
export async function deliverDueReminders(): Promise<number> {
  const due = dueReminders(ctx.db, now());
  for (const r of due) {
    markDelivered(ctx.db, r, now()); // first, so a slow post can never deliver twice
    if (r.userId !== SENIOR_ID) continue;
    const by = r.createdBy !== SENIOR_ID ? st('agent.reminderDue.by', { name: displayName(r.createdBy) }) : '';
    await tachiSay(SENIOR_ROOM_ID, {
      text: st('agent.reminderDue', { text: isKo() ? r.text : r.text.replace(/[.!]+$/, ''), tail: /[.!요]$/.test(r.text) ? '' : st('agent.reminderDue.tail'), by }),
      quickReplies: [st('agent.qr.ok'), st('agent.qr.thanks')], meta: { category: r.category, source: 'rule' },
    });
  }
  return due.length;
}
