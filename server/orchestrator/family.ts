// Family room flows: 4.5 Q&A (public data only), 4.6 gathering, 4.7 scheduling trigger.
import type { Message, PrivacyCategory, Room, User } from '../../shared/types';
import type { FamilyContext } from '../brain/contract';
import { ctx } from './ctx';
import { getHealth, getPrivacy, getUser, markActionDone, now, senior, tachiSay } from './core';
import { createGathering } from './artifacts';
import { reactBots } from './bots';
import { startScheduling, handlePickSlots } from './scheduling';

/** Only PUBLIC categories reach the brain. Private ones are merely named. */
export function buildFamilyContext(asker: User): FamilyContext {
  const privacy = getPrivacy();
  const priv = (Object.keys(privacy) as PrivacyCategory[]).filter(c => privacy[c] === 'private');
  const h = getHealth();
  const t = now();
  return {
    senior: senior(), asker, privacy, privateCategories: priv,
    health: privacy.health === 'family' ? h : undefined,
    moodToday: privacy.mood === 'family' ? h?.mood.at(-1)?.label : undefined,
    memories: privacy.memory === 'family'
      ? ctx.db.memories.all().filter(m => m.status === 'saved' && m.visibility === 'family')
        .map(m => ({ id: m.id, title: m.title, summary: m.summary, year: m.year, place: m.place, people: m.people, emotions: m.emotions }))
      : [],
    recentSessions: ctx.db.sessions.all()
      .filter(s => privacy[s.category] === 'family' && t.getTime() - new Date(s.startedAt).getTime() < 3 * 86400000)
      .slice(-5).map(s => ({ startedAt: s.startedAt, title: s.title, summary: s.summary, category: s.category })),
    trips: privacy.trip === 'family'
      ? ctx.db.trips.all().filter(x => x.status !== 'declined').map(x => ({ title: x.suggestion.title, destination: x.suggestion.destination, status: x.status }))
      : [],
  };
}

export async function handleFamilyInput(room: Room, userId: string, text: string | undefined, trigger: Message): Promise<void> {
  if (!text) { reactBots(room.id, trigger); return; }
  const asker = getUser(userId);
  if (!asker) return;
  const ai = await ctx.brain.classifyFamilyIntent(text, asker);
  const intent = ai.value;
  switch (intent.type) {
    case 'ask_tachi': return answer(room, asker, text);
    case 'gathering': await createGathering(room.id, asker, text); return;
    case 'schedule': return startScheduling(room.id, asker);
    default: reactBots(room.id, trigger);
  }
}

async function answer(room: Room, asker: User, question: string): Promise<void> {
  const fctx = buildFamilyContext(asker);
  const ai = await ctx.brain.answerFamily(question, fctx);
  const t = await tachiSay(room.id, { text: ai.value.text }, ai);
  let last: Message = t;
  if (ai.value.showHealthCard && fctx.health) {
    last = await tachiSay(room.id, { kind: 'health_card', text: '최근 7일 건강 요약이에요.', payload: { type: 'health_card', summary: fctx.health }, meta: { category: 'health' } });
  }
  reactBots(room.id, last);
}

export async function handleFamilyAction(room: Room, userId: string, msg: Message, actionId: string, data?: Record<string, unknown>): Promise<void> {
  const act = msg.actions?.find(a => a.id === actionId);
  if (actionId === 'start_scheduling') {
    if (act?.done) return;
    markActionDone(msg, 'start_scheduling');
    await startScheduling(room.id, { id: userId });
  } else if (actionId === 'pick_slots') {
    await handlePickSlots(userId, msg, data);
  }
}
