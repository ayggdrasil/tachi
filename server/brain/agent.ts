// LLM-driven 1:1 conversation with the senior: prompt + strict validation/normalisation of the agent's JSON.
import type { MemoryPerson } from '../../shared/types';
import { resolvePlace } from '../data/places';
import type { ExtractedMemory, InterviewState, MemoryDraft, SeniorAgentAction, SeniorAgentInput, SeniorAgentTurn } from './contract';
import { extractFromState } from './heuristics/interview';
import { decadeEra } from './heuristics/ko';
import { EMOTION_LABELS_EN } from './heuristics/en';
import { EMOTION_LABELS_KO } from './heuristics/ko';
import { mergeObservation, observe, validateObservation } from './heuristics/observe';
import { str, strArr } from './llm';
import { getLocale, setLocale } from './locale';

type J = Record<string, unknown>;

export const AGENT_SCHEMA = `{"reply": string, "quick_replies": string[], "actions": [
  {"type":"save_memory","memory":{"title":string,"story":string,"summary":string,"year":number|null,"era":string|null,"season":string|null,"place":string|null,"people":[{"name":string,"relation":string}],"event":string|null,"emotions":string[],"tags":string[]}},
  {"type":"update_draft","draft":{ ...any subset of the memory fields above... }},
  {"type":"show_memory","memory_id":string},
  {"type":"share_memory","memory_id":string},
  {"type":"suggest_trip","memory_id":string},
  {"type":"accept_trip"}, {"type":"decline_trip"},
  {"type":"log_health","systolic":number|null,"diastolic":number|null,"medication":{"taken":boolean,"name":string|null,"time":"morning|midday|evening"|null}|null,"mood":"good|so-so|a bit down"|null}
]}`;

function memLine(m: SeniorAgentInput['memories'][number]): string {
  const people = m.people.map(p => (p.relation ? `${p.relation} ${p.name}` : p.name)).join(', ');
  return `- id=${m.id} | ${m.title} | ${m.summary} | year ${m.year ?? '?'} ${m.season ?? ''} | place ${m.place ?? '?'} | people ${people || '?'} | event ${m.event ?? '?'} | feelings ${m.emotions.join(', ') || '?'} | visibility ${m.visibility}\n  story: ${m.story.slice(0, 420)}`;
}

export function buildAgentPrompt(input: SeniorAgentInput): string {
  const en = input.locale === 'en';
  const emo = (en ? EMOTION_LABELS_EN : EMOTION_LABELS_KO).join(', ');
  const seasons = en ? 'spring, summer, autumn, winter' : '봄, 여름, 가을, 겨울';
  const persona = en
    ? `You are "Tachi", a warm, calm AI companion who keeps ${input.senior.name} (78) and her memories company. Reply language: ENGLISH. Speak warmly and simply, never stiffly; call her by her first name or just "you". No emoji.`
    : `당신은 "타치"예요. ${input.senior.name} 어머님(78세)의 기억을 함께 지키는 따뜻하고 차분한 AI 동반자예요. 답변 언어: 한국어(부드러운 해요체). 이모지는 쓰지 않아요.`;
  const h = input.health;
  const healthLine = h
    ? `latest BP ${h.bloodPressure.at(-1) ? `${h.bloodPressure.at(-1)!.systolic}/${h.bloodPressure.at(-1)!.diastolic}` : 'none'}; medication days: ${h.medications.length}`
    : 'none';
  return `${persona}

You are the senior's one-to-one conversation partner. You converse freely (small talk, feelings, stories), recall existing memories, and help her tell NEW memories that are not saved yet.

RULES
- Reply: at most 3 short sentences and at most ONE question per turn. Mirror her own words (years, places, names). Never lecture.
- NEVER invent facts about her family or memories. Only use facts she said in this conversation or that appear in [MEMORIES]. If unsure, ask gently.
- If she mentions or asks about an EXISTING memory: answer only from that memory and emit show_memory with its exact id.
- If she is telling a NEW memory (not in [MEMORIES]): ask gentle questions across turns (when / where / who / what happened / how it felt), one at a time, and keep track with update_draft (only what she actually said). Never save early: a photo is not an answer, and her first answers only open the story. Emit save_memory only once you know when or where, who was there, AND at least one concrete thing that happened (normally after about three of her answers), or when she signals she is done; until then ask about what is still missing and record it with update_draft. Then emit save_memory with a COMPLETE memory built from everything she told you and say a warm closing line (no question). Do not save twice, and do not save a memory that already exists in [MEMORIES]. If she keeps adding to the memory you saved in your previous turn, answer warmly without show_memory (it is already on screen).
  save_memory fields: title in ${en ? 'English' : 'Korean'} (e.g. ${en ? '"Spring 1984, family trip to Bulguksa Temple in Gyeongju"' : '"1984년 봄, 경주 불국사 가족여행"'}); story in the FIRST person built from her own words (3-5 sentences); summary one sentence; year (number) / era / season (${seasons}) / place / people (name + relation, only the ones she named) / event / emotions (1-3 from: ${emo}) / tags (objects, food, things she mentioned).
- If she agrees to share a memory with the family (after you offered or she asked): share_memory with its id. If she says no, just acknowledge warmly.
- Trips: after a memory about a place you may offer a nearby trip (suggest_trip with that memory id) at most once. If pending is a trip offer and she accepts or declines, emit accept_trip or decline_trip.
- Health: blood pressure numbers, taking/not taking medication, or how she feels today -> log_health with only what she stated (never guess names, times or moods). Show care, never diagnose or prescribe.
- Quick replies: 0-3 short tappable answers to your question (under ${en ? 28 : 14} characters).
- A photo may be attached to her latest message: describe only what you can see, never guess faces/identities, then begin the gentle questions about when/where it was taken.

OUTPUT: exactly one JSON object, no code fences, no commentary:
${AGENT_SCHEMA}

[CONTEXT]
now: ${input.now.toISOString()}
pending confirmation: ${input.pending ?? 'none'}
health: ${healthLine}
memory being collected (draft): ${input.draft ? JSON.stringify(input.draft) : 'none'}
[MEMORIES]
${input.memories.length ? input.memories.map(memLine).join('\n') : '(none)'}
[ALL MEMORY TITLES]
${input.allMemoryTitles.length ? input.allMemoryTitles.map(m => `- ${m.id}: ${m.title}`).join('\n') : '(none)'}`;
}

// ── normalisation ───────────────────────────────────────────────────────────
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v) : undefined);

function sanitizePeople(v: unknown): MemoryPerson[] {
  if (!Array.isArray(v)) return [];
  return (v as J[]).filter(p => p && typeof p.name === 'string' && p.name.trim()).map(p => ({
    name: String(p.name).trim().slice(0, 30), ...(typeof p.relation === 'string' && p.relation.trim() ? { relation: p.relation.trim().slice(0, 24) } : {}),
  })).slice(0, 8);
}

/** Validated subset of memory fields (used by update_draft and as the LLM side of save_memory). */
function sanitizeMemoryFields(j: J, loc: 'en' | 'ko'): Partial<ExtractedMemory> {
  const labels = loc === 'en' ? EMOTION_LABELS_EN : EMOTION_LABELS_KO;
  const seasons = loc === 'en' ? ['spring', 'summer', 'autumn', 'winter'] : ['봄', '여름', '가을', '겨울'];
  const out: Partial<ExtractedMemory> = {};
  const title = str(j.title, 120); if (title) out.title = title;
  const story = str(j.story, 1400); if (story) out.story = story;
  const summary = str(j.summary, 300); if (summary) out.summary = summary;
  const year = num(j.year, 1900, 2030); if (year) out.year = year;
  const era = str(j.era, 14); if (era) out.era = era;
  const season = typeof j.season === 'string' ? (loc === 'en' ? j.season.trim().toLowerCase().replace('fall', 'autumn') : j.season.trim()) : undefined;
  if (season && seasons.includes(season)) out.season = season;
  const place = str(j.place, 80); if (place) out.place = place;
  const people = sanitizePeople(j.people); if (people.length) out.people = people;
  const event = str(j.event, 40); if (event) out.event = event;
  const emo = strArr(j.emotions, 3, 20).map(e => (loc === 'en' ? e.toLowerCase() : e)).filter(e => labels.includes(e));
  if (emo.length) out.emotions = emo;
  const tags = strArr(j.tags, 8, 40); if (tags.length) out.tags = tags;
  return out;
}

/** Complete an LLM memory from the heuristic extraction over the conversation (fills only what is missing). */
export function completeMemory(llm: Partial<ExtractedMemory>, input: SeniorAgentInput): ExtractedMemory {
  const userTurns = [...input.history.filter(t => t.role === 'user').map(t => t.text), input.message].filter(t => t && t.trim());
  const draftText = [input.draft?.story, input.draft?.title].filter(Boolean) as string[];
  const state: InterviewState = {
    memoryId: 'agent', photoUrl: input.photo?.url ?? input.draft?.photoUrl ?? '', asked: [], filled: {}, done: true,
    answers: [...draftText, ...userTurns, ...(llm.story ? [llm.story] : [])].map(text => ({ slot: 'extra' as const, text })),
  };
  const h = extractFromState(state);
  const place = llm.place ?? input.draft?.place ?? h.place;
  const rp = place ? resolvePlace(place) : undefined;
  const year = llm.year ?? input.draft?.year ?? h.year;
  const people = llm.people?.length ? llm.people : input.draft?.people?.length ? input.draft.people : h.people;
  const emotions = llm.emotions?.length ? llm.emotions : input.draft?.emotions?.length ? input.draft.emotions : h.emotions;
  return {
    title: llm.title ?? h.title,
    story: llm.story ?? h.story,
    summary: llm.summary ?? h.summary,
    year, era: year ? decadeEra(year) : llm.era ?? h.era,
    season: llm.season ?? input.draft?.season ?? h.season,
    place,
    placeId: rp?.place.id ?? (place === h.place ? h.placeId : undefined),
    people, event: llm.event ?? input.draft?.event ?? h.event,
    emotions, tags: llm.tags?.length ? llm.tags : input.draft?.tags?.length ? input.draft.tags : h.tags,
  };
}

const MED_TIME: Record<string, '아침' | '점심' | '저녁'> = { morning: '아침', midday: '점심', noon: '점심', evening: '저녁', 아침: '아침', 점심: '점심', 저녁: '저녁' };
const MOOD: Record<string, string> = { good: '좋음', 'so-so': '보통', 'a bit down': '조금 우울', 좋음: '좋음', 보통: '보통', '조금 우울': '조금 우울' };

/** Validate the raw JSON from the model into a SeniorAgentTurn. Throws when there is no usable reply. */
export function normalizeAgentTurn(raw: J, input: SeniorAgentInput): SeniorAgentTurn {
  const prev = getLocale();
  setLocale(input.locale);   // heuristics (completeMemory) follow the input locale for this synchronous section
  try {
    const reply = str(raw.reply, 700);
    if (!reply) throw new Error('missing reply');
    const quickReplies = strArr(raw.quick_replies ?? raw.quickReplies, 3, 40);
    const known = new Set([...input.memories.map(m => m.id), ...input.allMemoryTitles.map(m => m.id)]);
    const actions: SeniorAgentAction[] = [];
    const list = Array.isArray(raw.actions) ? (raw.actions as J[]) : [];
    let saved = false;
    for (const a of list) {
      if (!a || typeof a !== 'object' || actions.length >= 4) continue;
      const type = String(a.type);
      const mid = str(a.memory_id ?? a.memoryId, 80);
      switch (type) {
        case 'save_memory': {
          if (saved || !a.memory || typeof a.memory !== 'object') break;
          saved = true;
          actions.push({ type: 'save_memory', memory: completeMemory(sanitizeMemoryFields(a.memory as J, input.locale), input) });
          break;
        }
        case 'update_draft': {
          if (!a.draft || typeof a.draft !== 'object') break;
          const d = sanitizeMemoryFields(a.draft as J, input.locale);
          if (Object.keys(d).length) actions.push({ type: 'update_draft', draft: d as MemoryDraft });
          break;
        }
        case 'show_memory': case 'share_memory': case 'suggest_trip':
          if (mid && known.has(mid)) actions.push({ type, memoryId: mid } as SeniorAgentAction);
          break;
        case 'accept_trip': case 'decline_trip':
          if (input.pending && /trip/.test(input.pending)) actions.push({ type } as SeniorAgentAction);
          break;
        case 'log_health': {
          const systolic = num(a.systolic, 40, 300), diastolic = num(a.diastolic, 40, 300);
          const med = a.medication && typeof a.medication === 'object' ? (a.medication as J) : undefined;
          const llmObs = validateObservation({
            medication: med && typeof med.taken === 'boolean' ? { taken: med.taken, name: med.name, time: typeof med.time === 'string' ? MED_TIME[med.time] : undefined } : undefined,
            mood: typeof a.mood === 'string' ? MOOD[a.mood.trim().toLowerCase()] ?? a.mood : undefined,
          });
          const observation = mergeObservation(llmObs, observe(input.message.trim()), input.message);
          const bpOk = systolic !== undefined && diastolic !== undefined;
          if (bpOk || observation) actions.push({ type: 'log_health', ...(bpOk ? { systolic, diastolic } : {}), ...(observation ? { observation } : {}) });
          break;
        }
        default: break;
      }
    }
    // a saved memory supersedes draft updates; the closing line must not carry a question
    const final = saved ? actions.filter(x => x.type !== 'update_draft') : actions;
    return { reply, quickReplies: saved ? [] : quickReplies, actions: final };
  } finally { setLocale(prev); }
}
