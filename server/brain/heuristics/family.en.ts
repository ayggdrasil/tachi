// English offline family-room behaviours: Q&A, gathering drafts, artifact assist, bot replies.
import { dateLabelL } from '../../../shared/constants';
import type { Artifact, PrivacyCategory, User } from '../../../shared/types';
import type { BotContext, FamilyAnswer, FamilyContext, GatheringDraft, GatheringInput } from '../contract';
import { findPlaces, placeRegion, templateFor } from '../../data/places';
import { capitalize } from './en';
import { seniorCallEn } from './compose.en';
import { assessBloodPressure } from './health';

export const BIRTHDAY_RE_EN = /\bbirthday\b|\b(?:60th|70th|80th)\b|\b(?:sixtieth|seventieth|eightieth)\b|\bhwangap\b/i;

export function questionCategoryEn(q: string): PrivacyCategory | undefined {
  if (/\bblood\s*pressure\b|\bbp\b|\bmedic\w*|\bpills?\b|\bhealth\w*|\bsick\b|\bpain\w*|\bhurt\w*|\bhospital\b|\bsteps\b|\bwalk(?:ing|s|ed)?\b|\bsleep\w*|\bslept\b|\bexercis\w*|\bcondition\b|\bdizz\w*|\bknees?\b|\bdoctor\b|\bmeals?\b|\bate\b|\beaten\b|\bappetite\b/i.test(q)) return 'health';
  if (/\bmood\b|\bfeel(?:ing|s)?\b|\bsad\b|\bdepress\w*|\bemotion\w*|\blonely\b|\bspirits\b|\bhappy\b|\bcheerful\b/i.test(q)) return 'mood';
  // daily chat only when asking about the content of conversations; general wellbeing ('lately/today/how is') stays undefined.
  if (/\bwhat\b[^?]{0,24}\b(?:talk\w*|say|said|chat\w*|speak|spoke|discuss\w*)\b|\bconversations?\b|\bwhat has she been up to\b|\bwhat (?:did|does|was) (?:she|mom|mother|grandma) do\b|\bwhat\b[^?]{0,16}\bup to\b/i.test(q)) return 'daily';
  if (/\bmemor(?:y|ies)\b|\bphotos?\b|\bpictures?\b|\bold stor(?:y|ies)\b|\bstor(?:y|ies)\b|\bremember\w*|\balbum\b/i.test(q)) return 'memory';
  if (/\btrips?\b|\btravel\w*|\boutings?\b|\bgyeongju\b|\bbusan\b|\bplans?\b|\bitinerary\b/i.test(q)) return 'trip';
  return undefined;
}

const PRIVATE_NOUN_EN: Record<PrivacyCategory, string> = {
  health: 'her health information', mood: 'her mood', daily: 'her daily chat', memory: 'her memories', trip: 'her trips and outings',
};

export function fmtDateEn(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return dateLabelL(new Date(+m[1], +m[2] - 1, +m[3]), 'en');
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
type Facts = { latest: { systolic: number; diastolic: number }; avgS: number; avgD: number; totalDays: number; takenDays: number; missed: string[]; sleep: number; steps: number };

export function bpWarningEn(ctx: FamilyContext): string | undefined {
  if (!ctx.health?.bloodPressure.length) return undefined;
  const latest = ctx.health.bloodPressure[ctx.health.bloodPressure.length - 1];
  const lv = assessBloodPressure(latest).level;
  if (lv !== 'crisis' && lv !== 'high') return undefined;
  const call = seniorCallEn(ctx.asker);
  return `Her latest blood pressure of ${latest.systolic}/${latest.diastolic} is ${lv === 'crisis' ? 'very high' : 'high'}. Please contact ${call} right away to check on her, and call her doctor if needed.`;
}

/** Strip reassuring sentences from an English answer. */
export function stripReassuranceEn(text: string): string {
  return text.split(/(?<=[.!?。])\s+/).filter(s => !/\b(?:stable|fine|okay|no need to worry|don'?t worry|nothing to worry|no problem|no issues?|all good|healthy|reassuring|nothing wrong|not a concern)\b/i.test(s)).join(' ').trim();
}

export function answerFamilyEn(question: string, ctx: FamilyContext, cat: PrivacyCategory | undefined, f: Facts | undefined, bpw: string | undefined): FamilyAnswer {
  const call = seniorCallEn(ctx.asker);
  const Call = capitalize(call);
  if (cat && ctx.privateCategories.includes(cat)) {
    return { text: `${Call} has set ${PRIVATE_NOUN_EN[cat]} to private. If you'd like to know, please ask her directly.`, showHealthCard: false };
  }
  const parts: string[] = [];
  let showHealthCard = false;
  const wantsAll = !cat;
  if ((cat === 'health' || wantsAll) && ctx.health && f) {
    const onlySleep = /\b(?:sleep|slept|sleeping)\b/i.test(question) && !/blood pressure|\bbp\b|medic|pill/i.test(question);
    const onlySteps = /\b(?:steps|walk\w*|exercise)\b/i.test(question) && !/blood pressure|\bbp\b|medic|pill/i.test(question);
    const onlyMeds = /\b(?:medic\w*|pills?|meds)\b/i.test(question) && !/blood pressure|\bbp\b/i.test(question);
    if (onlySleep) parts.push(`Over the past 7 days she averaged ${f.sleep.toFixed(1)} hours of sleep. ${f.sleep >= 6.5 ? 'She seems to be sleeping well.' : "That's a little short, so I'll gently remind her to rest during the day."}`);
    else if (onlySteps) parts.push(`She has averaged ${f.steps.toLocaleString('en-US')} steps a day over the past 7 days. She's keeping up her walks.`);
    else if (onlyMeds) parts.push(`She took her medication on ${f.takenDays} of ${f.totalDays} days.${f.missed.length ? ` She missed it on ${f.missed.map(fmtDateEn).join(', ')}.` : ' She has not missed a single day.'}`);
    else {
      parts.push(`${Call}'s average blood pressure over the past 7 days is ${f.avgS}/${f.avgD}, and her most recent reading is ${f.latest.systolic}/${f.latest.diastolic}.`);
      parts.push(`She took her medication on ${f.takenDays} of ${f.totalDays} days${f.missed.length ? `, and missed it on ${f.missed.map(fmtDateEn).join(', ')}` : ''}.`);
      const lv = assessBloodPressure(f.latest).level;
      if (lv === 'crisis' || lv === 'high') parts.unshift(bpw!);
      else if (lv === 'elevated' || f.avgS >= 140) parts.push("It's a little on the high side, so it may be worth talking to her doctor.");
      else if (lv === 'invalid') parts.push('The latest blood pressure entry needs to be rechecked.');
      else parts.push(lv === 'low' ? "Her blood pressure has been on the low side, so please check that she isn't feeling dizzy." : 'The past 7 days have been steady, with no big swings.');
    }
    showHealthCard = cat === 'health';
  } else if (cat === 'health') {
    parts.push('No health records have been shared yet.');
  }
  if (cat === 'mood' || (wantsAll && ctx.moodToday)) {
    if (ctx.moodToday) parts.push(`Today ${call} said she is feeling "${ctx.moodToday}".`);
    else if (cat === 'mood') parts.push('There is no mood entry for today yet.');
  }
  if (cat === 'memory' || (wantsAll && !parts.length)) {
    const m = ctx.memories[0];
    if (m) parts.push(`The latest story ${call} shared is "${m.title}". ${m.summary}`);
    else if (cat === 'memory') parts.push('No memory stories have been shared yet.');
  }
  if (cat === 'trip') {
    const t = ctx.trips[0];
    parts.push(t ? `${Call} is looking at the "${t.title}" trip. It is currently ${t.status === 'accepted' ? 'one she has agreed to' : 'only suggested'}.` : 'There is no trip plan in progress yet.');
  }
  if (wantsAll && ctx.recentSessions.length && parts.length < 3) {
    const s = ctx.recentSessions[ctx.recentSessions.length - 1];
    const d = new Date(s.startedAt);
    parts.push(`At ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} we talked about ${s.title}. ${s.summary}`);
  }
  if (!parts.length) parts.push(`There is nothing shared about ${call} that I can tell you yet. Please ask her directly.`);
  return { text: parts.join(' '), showHealthCard };
}

// ── gathering ──────────────────────────────────────────────────────────────
export function draftGatheringEn(input: GatheringInput, birthday: boolean): GatheringDraft {
  const { proposalText, proposer, members, linkedMemory, linkedTrip } = input;
  const text = proposalText;
  const pl = findPlaces(text)[0];
  const memPl = linkedMemory?.place ? findPlaces(linkedMemory.place)[0] : undefined;
  const memRegion = memPl?.region;
  const tripPl = linkedTrip ? findPlaces(linkedTrip.destination)[0] : undefined;
  const tripOk = !!linkedTrip && (!pl || tripPl?.region === pl.region || linkedTrip.destination === pl.region);
  const memOk = !!linkedMemory && (!pl || memRegion === pl.region);
  const lt = tripOk ? linkedTrip : undefined;
  const lm = memOk ? linkedMemory : undefined;
  const destPl = pl ?? (lt ? tripPl : undefined) ?? memPl;
  const dest = destPl ? placeRegion(destPl) : (lt?.destination ?? '');
  const title = birthday ? `Mom's Birthday · ${dest ? `${dest} Family Trip` : 'Family Gathering'}` : dest ? `${dest} Family Trip` : 'Family Gathering';
  const bg: string[] = [`${proposer.name} proposed "${text.replace(/[!.]+$/, '')}", which started this plan.`];
  if (lm) bg.push(`It was inspired by the memory "${lm.title}" that Mom shared.`);
  if (lt) bg.push(`It builds on the "${lt.title}" itinerary Tachi suggested.`);
  const place = pl ? `Around ${dest}` : lm?.place ? `Around ${lm.place}` : dest ? `Around ${dest}` : 'To be decided';
  const tpl = dest ? templateFor(dest) : undefined;
  const agenda = tpl
    ? [...tpl.days[0].stops.slice(1, 4).map(s => `Day 1 · ${s.title}`), ...tpl.days[1].stops.slice(1, 3).map(s => `Day 2 · ${s.title}`)]
    : ['Arrive at the venue and say hello', 'Family meal', 'Group photos', birthday ? 'Birthday wishes for Mom' : 'A word of thanks for Mom'];
  const has = (id: string) => members.some(m => m.id === id);
  const tasks: GatheringDraft['tasks'] = [
    { text: 'Book KTX tickets / a car', ...(has('minjun') ? { assigneeId: 'minjun' } : {}) },
    { text: 'Book lodging and restaurants (few stairs, seated dining)', ...(has('suyeon') ? { assigneeId: 'suyeon' } : {}) },
    birthday
      ? { text: 'Prepare a birthday cake and flowers', ...(has('harin') ? { assigneeId: 'harin' } : has('jieun') ? { assigneeId: 'jieun' } : {}) }
      : { text: 'Prepare a group photo and keepsakes', ...(has('harin') ? { assigneeId: 'harin' } : has('jieun') ? { assigneeId: 'jieun' } : {}) },
    { text: "Look after Mom's medication and wellbeing", ...(has('jieun') ? { assigneeId: 'jieun' } : {}) },
  ];
  return {
    title,
    background: bg.join(' '),
    purpose: birthday
      ? "Celebrate Mom's birthday together as a family, and make new memories while walking through a place from the past."
      : 'Spend time together as a family, and make new memories while walking through a place from the past.',
    place,
    agenda,
    tasks,
    notes: "Tachi will ask each member for their available times to set the date. The route is planned with few stairs, with Mom's knees in mind.",
  };
}

const ASSIST_POOL_EN: { key: RegExp; text: string; who: string }[] = [
  { key: /wheelchair|route|stairs/i, text: 'Check wheelchair rental and a low-stairs route', who: 'minjun' },
  { key: /spare|emergency|medicine|pill|medication/i, text: "Bring Mom's blood pressure medicine and a spare supply", who: 'jieun' },
  { key: /photo|album|print/i, text: 'Print old photos to bring along (the 1984 Bulguksa photo)', who: 'jieun' },
  { key: /filming|group (?:photo|video)|video/i, text: 'Take charge of group photos and video', who: 'harin' },
  { key: /rain|weather/i, text: 'Check the weather and a rainy-day plan', who: 'suyeon' },
  { key: /allerg|menu|diet/i, text: 'Confirm meal menus and any food restrictions', who: 'suyeon' },
];
export function assistArtifactEn(artifact: Artifact, members: User[]): { message: string; newTasks: { text: string; assigneeId?: string }[] } {
  const existing = artifact.tasks.map(t => t.text).join(' ') + ' ' + artifact.notes;
  const picks = ASSIST_POOL_EN.filter(p => !p.key.test(existing)).slice(0, 3);
  const newTasks = picks.map(p => ({ text: p.text, ...(members.some(m => m.id === p.who) ? { assigneeId: p.who } : {}) }));
  return {
    message: newTasks.length ? `I suggested ${newTasks.length} easily forgotten preparations for ${artifact.title}. Please delete any you don't need.` : "You're already well prepared. Let me know if anything else comes up.",
    newTasks,
  };
}

// ── bots ───────────────────────────────────────────────────────────────────
const CALL_EN: Record<string, string> = { jieun: 'Mom', minjun: 'Mom', suyeon: 'Mom', harin: 'Grandma' };
const pickBy = <T,>(seed: string, arr: T[]): T => { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return arr[(h >>> 0) % arr.length]; };
const hashOf = (seed: string): number => { let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function botReplyEn(ctx: BotContext): string {
  const id = ctx.persona.id;
  const kind = ctx.trigger.kind;
  const seed = `${id}|${ctx.trigger.text}|${kind}`;
  const r = hashOf(seed) % 100;
  const call = CALL_EN[id] ?? 'Mom';
  const T = ctx.trigger.text;

  if (kind === 'system' && /invit|joined|added/i.test(T)) {
    if (id === 'harin') return "Grandma~ I'm here too! Looking at the photos makes me so happy lol";
    return `Thanks for inviting me. I'll keep up with how ${call} is doing here.`;
  }

  const lines: Record<string, Partial<Record<string, string[]>>> = {
    jieun: {
      share_card: ["Mom, I've never seen this photo... Minjun was so little then.", 'Mom, hearing this story made me tear up thinking about Dad.', 'Mom, this photo is so lovely. Let us go back there, for sure.'],
      memory_card: ['Mom, this photo is such a treasure. Thank you.'],
      artifact: ["I'll take care of Mom's medicine and how she's doing."],
      schedule_result: ['Great, see you then!', "That date works. I'll bring Mom."],
      schedule_candidate: ['Those are the candidate times. Let me know once it is decided.'],
      schedule_progress: ["Everyone who hasn't answered yet, please reply~"],
      report: ["Thanks to Tachi I feel at ease. Mom talked a lot today.", "Thanks for the report. It's nice to see Mom chatting."],
      health_card: ["Mom, how are you feeling today? I'll give you a call.", "I'll check in about her medicine so she doesn't skip it."],
      itinerary: ["The plan looks lovely. You kept Mom's knees in mind, right?"],
      trip_suggestion: ["Gyeongju sounds great! I think Mom will love it."],
      recall_card: ['Mom, that photo is really pretty.'],
      text: ['Okay, got it.', 'Take care today, Mom~'],
    },
    minjun: {
      share_card: ['Nice photo. I was little then.', "I remember this. I ran away, didn't I lol"],
      memory_card: ['Good photo.'],
      artifact: ["I'll look into the KTX and the car.", "I'll handle the driving."],
      schedule_result: ["Got it. I'll clear that day.", 'Noted.'],
      schedule_candidate: ['Those are the candidate times. Let me know once it is decided.'],
      schedule_progress: ["I've answered."],
      report: ['Got it. Thanks.'],
      health_card: ["Saw the record. Tell me if you need anything."],
      itinerary: ['The route looks good.'],
      trip_suggestion: ["Sounds good. I'll drive."],
      text: ['Okay.', 'Got it.'],
    },
    suyeon: {
      share_card: ["Mom, the photo is so lovely. It makes me want to go back to Gyeongju too.", "Hearing Mom's story warms my heart."],
      memory_card: ['Mom, what a precious photo.'],
      artifact: ["I'll look into lodging and restaurants.", "I'll find restaurants with comfortable seating."],
      schedule_result: ['Wonderful, see you then!', "It's set. I'll get everything ready."],
      schedule_candidate: ['Those are the candidate times. Let me know once it is decided.'],
      schedule_progress: ["I've answered. Everyone, please take a look."],
      report: ["It's nice to see Mom doing well."],
      health_card: ["I'll keep an eye on how Mom is doing too."],
      itinerary: ['The schedule looks comfortable. Mom will like it.'],
      trip_suggestion: ['Gyeongju sounds great. It is a place full of Mom\'s memories.'],
      text: ['Okay, got it.', 'Take care today, Mom.'],
    },
    harin: {
      share_card: ['Grandma you look so pretty lol', 'Grandma this photo is amazing. I want to go too lol', 'Grandma is the best lol tell us more stories'],
      memory_card: ['Grandma the photo is awesome lol'],
      artifact: ["I'll handle the cake and flowers lol", "I'll take the photos for you lol"],
      schedule_result: ["I'll keep that day free lol", 'Sounds good, see you then lol'],
      schedule_candidate: ['Those are the candidate times lol. Let me know once it is decided.'],
      schedule_progress: ["I've answered lol"],
      report: ['Grandma chatted a lot today lol'],
      health_card: ['Grandma please take care of yourself lol'],
      itinerary: ['A trip with Grandma makes me so excited lol'],
      trip_suggestion: ['Oh Gyeongju! I want to go lol'],
      text: ['Love you Grandma lol', 'Yep lol'],
    },
  };
  const table = lines[id];
  if (!table) {
    const gen: Record<string, string[]> = {
      share_card: [`${call}, that is a lovely photo.`], schedule_result: ['Yes, I have seen it.'], system: ['Yes, nice to meet you.'], text: ['Yes, understood.'],
    };
    return pickBy(seed, gen[kind] ?? gen.text);
  }
  if (['text', 'itinerary', 'recall_card', 'schedule_progress', 'trip_suggestion'].includes(kind) && r % 100 < 35) return '';
  if (['report', 'health_card'].includes(kind) && r < 25) return '';
  if (kind === 'text' && /tachi|gathering|schedule|time/i.test(T) && r < 50) return '';
  const healthText = kind === 'text' && /blood pressure|\bbp\b|health|medicine|\bpills?\b|condition/i.test(T);
  const confirmed = /confirmed|finalized|locked in|it'?s set/i.test(T) && !/candidate|not (?:yet )?confirmed|unconfirmed|tentative|proposed|options?|not finalized/i.test(T);
  const k = kind === 'schedule_result' && !confirmed ? 'schedule_candidate' : healthText ? 'health_card' : kind;
  const arr = table[k] ?? table.text ?? [];
  return arr.length ? pickBy(seed, arr) : '';
}

/** Reassuring/evaluative wording is banned in bot replies about health (English). */
export const BANNED_HEALTH_WORDS_EN = /\b(?:healthy|stable|reassuring|relieved|nothing to worry|no need to worry|no problem|good numbers|glad she'?s (?:ok|fine|well)|that'?s good|so good to hear)\b/i;
export type { Facts };
