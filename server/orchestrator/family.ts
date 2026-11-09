// Family room flows: 4.5 Q&A (public data only), 4.6 gathering, 4.7 scheduling trigger.
import { KIN_RELATIONS, TACHI_ID } from '../../shared/constants';
import type { Message, PrivacyCategory, Room, User } from '../../shared/types';
import type { FamilyContext } from '../brain/contract';
import { ctx } from './ctx';
import { getHealth, getPrivacy, getUser, healthForFamily, markActionDone, memoryVisibleToFamily, now, senior, tachiSay, tripVisibleToFamily, withTyping, PRIVATE_NOTICE } from './core';
import { sessionHiddenFromFamily } from './sessions';
import { createGathering } from './artifacts';
import { reactBots } from './bots';
import { startScheduling, handlePickSlots, handleScheduleAction } from './scheduling';

/** Only PUBLIC categories reach the brain. Private ones are merely named. */
export function buildFamilyContext(asker: User): FamilyContext {
  const privacy = getPrivacy();
  const priv = (Object.keys(privacy) as PrivacyCategory[]).filter(c => privacy[c] === 'private');
  const h = getHealth();
  const t = now();
  const fh = healthForFamily(h) ?? undefined;
  return {
    senior: senior(), asker, privacy, privateCategories: priv,
    health: fh,
    moodToday: privacy.mood === 'family' ? h?.mood.at(-1)?.label : undefined,
    memories: ctx.db.memories.all().filter(memoryVisibleToFamily)
      .map(m => ({ id: m.id, title: m.title, summary: m.summary, year: m.year, place: m.place, people: m.people, emotions: m.emotions })),
    recentSessions: ctx.db.sessions.all()
      .filter(s => !sessionHiddenFromFamily(s) && t.getTime() - new Date(s.startedAt).getTime() < 3 * 86400000)
      .slice(-5).map(s => ({ startedAt: s.startedAt, title: s.title, summary: s.summary, category: s.category })),
    trips: ctx.db.trips.all().filter(x => x.status !== 'declined' && tripVisibleToFamily(x))
      .map(x => ({ title: x.suggestion.title, destination: x.suggestion.destination, status: x.status })),
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

/** Which privacy category does a family question touch? (so a later retraction can hide the answer) */
export function questionCategory(question: string, showHealthCard?: boolean): PrivacyCategory | undefined {
  if (/기분|마음|우울|컨디션|감정|외로/.test(question)) return 'mood';
  if (showHealthCard || /혈압|건강|약|수면|잠|걸음|병원|아프|맥박/.test(question)) return 'health';
  if (/추억|사진|옛날|기억|젊을|어릴/.test(question)) return 'memory';
  return undefined;
}

export const KIN_ONLY_NOTICE = '가족에게만 공유된 정보예요. 어머님께 직접 여쭤봐 주세요.';

/** Only kin (and rooms made up entirely of kin) may query the senior's health / mood / memories / trips. */
export function kinMayAsk(room: Room, asker: User): boolean {
  const isKin = (u: User) => KIN_RELATIONS.includes(u.relation) || u.role === 'senior' || u.id === TACHI_ID;
  if (!isKin(asker)) return false;
  return room.memberIds.every(id => { const u = getUser(id); return !u || id === TACHI_ID || isKin(u); });
}

async function answer(room: Room, asker: User, question: string): Promise<void> {
  if (!kinMayAsk(room, asker) && (questionCategory(question) !== undefined || /엄마|어머|할머니|요즘|어때|괜찮|지내|여행|생신|일정|하루/.test(question))) {
    await tachiSay(room.id, { text: KIN_ONLY_NOTICE, meta: { source: 'rule' } });
    return;
  }
  const fctx = buildFamilyContext(asker);
  const ai = await withTyping(room.id, () => ctx.brain.answerFamily(question, fctx));
  // privacy may have changed while the provider was thinking: re-check against the CURRENT settings before posting
  const asked = questionCategory(question, ai.value.showHealthCard);
  const wasPublic = !!asked && fctx.privacy[asked] === 'family'; // an already-private category got the brain's own gentle refusal: leave it untagged
  const category = wasPublic ? asked : undefined;
  if (category && getPrivacy()[category] === 'private') {
    await tachiSay(room.id, { text: PRIVATE_NOTICE, meta: { category, source: 'rule' } });
    return;
  }
  const t = await tachiSay(room.id, { text: ai.value.text, meta: { ...(category ? { category } : {}) } }, ai);
  let last: Message = t;
  const fh = healthForFamily();
  if (ai.value.showHealthCard && fh) {
    last = await tachiSay(room.id, { kind: 'health_card', text: '최근 7일 건강 요약이에요.', payload: { type: 'health_card', summary: fh }, meta: { category: 'health' } });
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
  } else if (actionId === 'confirm_slot' || actionId === 'repoll') {
    await handleScheduleAction(userId, msg, actionId, data);
  }
}
