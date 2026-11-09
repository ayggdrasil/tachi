// Family room flows: 4.5 Q&A (public data only), 4.6 gathering, 4.7 scheduling trigger.
import { TACHI_ID, isKinRelation } from '../../shared/constants';
import { st } from '../i18n';
import type { Message, PrivacyCategory, Room, User } from '../../shared/types';
import type { FamilyContext } from '../brain/contract';
import { ctx } from './ctx';
import { getHealth, getPrivacy, getUser, healthForFamily, markActionDone, memoryVisibleToFamily, now, senior, tachiSay, tripVisibleToFamily, withTyping, privateNotice } from './core';
import { sessionHiddenFromFamily } from './sessions';
import { createGathering, handleGatheringChoice } from './artifacts';
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
  if (MOOD_Q_RE.test(question)) return 'mood';
  if (showHealthCard || HEALTH_Q_RE.test(question)) return 'health';
  if (MEMORY_Q_RE.test(question)) return 'memory';
  return undefined;
}

const MOOD_Q_RE = /기분|마음|우울|컨디션|감정|외로|\b(mood|feel(s|ing)?|depress\w*|lonely|sad|spirits)\b/i;
const HEALTH_Q_RE = /혈압|건강|약|수면|잠|걸음|병원|아프|맥박|\b(blood pressure|bp|health\w*|medic\w*|pills?|sleep\w*|steps|walk\w*|hospital|doctor|pain\w*|aches?|pulse)\b/i;
const MEMORY_Q_RE = /추억|사진|옛날|기억|젊을|어릴|\b(memor\w*|photos?|pictures?|old days|remember\w*|young|childhood)\b/i;
const ABOUT_SENIOR_RE = /엄마|어머|할머니|요즘|어때|괜찮|지내|여행|생신|일정|하루|\b(mom|mother|grandma|grandmother|lately|these days|how (is|has|was|are)|doing|okay|trip|travel|birthday|schedule|today)\b/i;

export const kinOnlyNotice = (): string => st('family.kinOnly');

/** Only kin (and rooms made up entirely of kin) may query the senior's health / mood / memories / trips. */
export function kinMayAsk(room: Room, asker: User): boolean {
  const isKin = (u: User) => isKinRelation(u.relation) || u.role === 'senior' || u.id === TACHI_ID;
  if (!isKin(asker)) return false;
  return room.memberIds.every(id => { const u = getUser(id); return !u || id === TACHI_ID || isKin(u); });
}

const SENSITIVITY: PrivacyCategory[] = ['health', 'mood', 'memory', 'trip', 'daily'];

/** Which categories / resources an answer actually drew on, derived from the context it was given and its text. */
export function answerProvenance(fctx: FamilyContext, text: string, asked: PrivacyCategory | undefined, showHealthCard?: boolean, question = ''): {
  categories: PrivacyCategory[]; memoryIds: string[]; tripIds: string[];
} {
  const used = new Set<PrivacyCategory>();
  if (asked) used.add(asked);
  if (fctx.health && (showHealthCard || /혈압|맥박|수면|걸음|복약|약|건강|병원|컨디션|\b(blood pressure|pulse|sleep\w*|steps|medic\w*|pills?|health\w*|hospital|doctor|condition)\b/i.test(text))) used.add('health');
  if (fctx.moodToday && (text.includes(fctx.moodToday) || /기분|마음|컨디션|감정|외로|우울|\b(mood|feel(s|ing)?|spirits|lonely|sad|cheerful|happy|cheery)\b/i.test(text))) used.add('mood');
  // Conservative: an answer about memories / trips is tied to EVERY memory / trip in its context (no substring inference alone).
  const exactMem = fctx.memories.some(m => (m.title && text.includes(m.title)) || (m.place && m.place.length >= 2 && text.includes(m.place)));
  const aboutMemory = asked === 'memory' || exactMem || /추억|사진|기억|옛날|어릴|젊을|그때|예전|옛적|\b(memor\w*|photos?|pictures?|remember\w*|back then|long ago|childhood|years ago|old days)\b/i.test(text);
  const memoryIds = aboutMemory ? fctx.memories.map(m => m.id) : [];
  if (memoryIds.length) used.add('memory');
  const ctxTrips = ctx.db.trips.all().filter(t => t.status !== 'declined' && tripVisibleToFamily(t));
  const exactTrip = ctxTrips.some(t => text.includes(t.suggestion.title) || (t.suggestion.destination.length >= 2 && text.includes(t.suggestion.destination)));
  const aboutTrip = exactTrip || /여행|나들이|일정|코스|다녀|\b(trips?|outings?|itinerary|route|travel\w*|visited)\b/i.test(text) || /여행|나들이|일정|코스|\b(trips?|outings?|itinerary|route|travel\w*)\b/i.test(question);
  const tripIds = aboutTrip ? ctxTrips.map(t => t.id) : [];
  if (tripIds.length) used.add('trip');
  for (const s of fctx.recentSessions) if (s.title && text.includes(s.title)) used.add(s.category);
  return { categories: SENSITIVITY.filter(c => used.has(c)), memoryIds, tripIds };
}

/** Is everything an answer used still public right now? */
function stillPublic(prov: { categories: PrivacyCategory[]; memoryIds: string[]; tripIds: string[] }): boolean {
  const privacy = getPrivacy();
  return prov.categories.every(c => privacy[c] === 'family')
    && prov.memoryIds.every(id => memoryVisibleToFamily(ctx.db.memories.get(id)))
    && prov.tripIds.every(id => tripVisibleToFamily(ctx.db.trips.get(id)));
}

async function answer(room: Room, asker: User, question: string): Promise<void> {
  if (!kinMayAsk(room, asker) && (questionCategory(question) !== undefined || ABOUT_SENIOR_RE.test(question))) {
    await tachiSay(room.id, { text: kinOnlyNotice(), meta: { source: 'rule' } });
    return;
  }
  let fctx = buildFamilyContext(asker);
  let ai = await withTyping(room.id, () => ctx.brain.answerFamily(question, fctx));
  let asked = questionCategory(question, ai.value.showHealthCard);
  let prov = answerProvenance(fctx, ai.value.text, asked && fctx.privacy[asked] === 'family' ? asked : undefined, ai.value.showHealthCard, question);
  // privacy may have changed while the provider was thinking: revalidate everything the answer used; rebuild + re-ask once
  if (!stillPublic(prov)) {
    fctx = buildFamilyContext(asker);
    ai = await withTyping(room.id, () => ctx.brain.answerFamily(question, fctx));
    asked = questionCategory(question, ai.value.showHealthCard);
    prov = answerProvenance(fctx, ai.value.text, asked && fctx.privacy[asked] === 'family' ? asked : undefined, ai.value.showHealthCard, question);
    if (!stillPublic(prov)) {
      await tachiSay(room.id, { text: privateNotice(), meta: { ...(prov.categories[0] ? { category: prov.categories[0] } : {}), source: 'rule' } });
      return;
    }
  }
  const meta = prov.categories.length
    ? { category: prov.categories[0], categoriesUsed: prov.categories, ...(prov.memoryIds.length ? { memoryIdsUsed: prov.memoryIds } : {}), ...(prov.tripIds.length ? { tripIdsUsed: prov.tripIds } : {}) }
    : {};
  const t = await tachiSay(room.id, { text: ai.value.text, meta }, ai);
  let last: Message = t;
  const fh = healthForFamily();
  if (ai.value.showHealthCard && fh) {
    last = await tachiSay(room.id, { kind: 'health_card', text: st('family.healthCardText'), payload: { type: 'health_card', summary: fh }, meta: { category: 'health' } });
  }
  reactBots(room.id, last);
}

export async function handleFamilyAction(room: Room, userId: string, msg: Message, actionId: string, data?: Record<string, unknown>): Promise<void> {
  const act = msg.actions?.find(a => a.id === actionId);
  if (actionId === 'start_scheduling') {
    if (act?.done) return;
    markActionDone(msg, 'start_scheduling');
    const aid = typeof act?.data?.artifactId === 'string' ? act.data.artifactId : undefined;
    const art = aid ? ctx.db.artifacts.get(aid) : undefined;
    if (aid && (!art || art.roomId !== room.id)) throw new Error('artifact not in this room');
    await startScheduling(room.id, { id: userId }, aid ? { artifactId: aid } : {});
  } else if (actionId === 'revise_gathering' || actionId === 'new_gathering') {
    await handleGatheringChoice(userId, msg, actionId);
  } else if (actionId === 'pick_slots') {
    await handlePickSlots(userId, msg, data);
  } else if (actionId === 'confirm_slot' || actionId === 'repoll') {
    await handleScheduleAction(userId, msg, actionId, data);
  }
}
