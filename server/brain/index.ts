// Tachi brain: real LLM when an API key + model is active, deterministic demo heuristics otherwise.
import type { ArtifactTask, ItineraryPayload, MemoryPerson, ModelOption, PrivacyCategory, TripStop } from '../../shared/types';
import { findPlaces, placeById, resolvePlace, templateFor } from '../data/places';
import type { AIResult, Brain, ExtractedMemory, FamilyAnswer, GatheringDraft, SeniorIntent } from './contract';
import { questionCategory, assistArtifact as hAssist, answerFamily as hAnswer, botReply as hBot, draftGathering as hDraft } from './heuristics/family';
import { composeReport as hReport, planItinerary as hPlan, proactiveMessage as hProactive, recallReply as hRecall, seniorChat as hChat, shareSummary as hShare, suggestTrip as hSuggest } from './heuristics/compose';
import { extractFromState, planNext, startTurn, SLOT_QUESTION } from './heuristics/interview';
import { availability, familyIntent, seniorIntent } from './heuristics/intents';
import { EMOTION_LABELS, decadeEra } from './heuristics/ko';
import { circuitOpen, completeJson, loadImage, str, strArr } from './llm';
import { ModelRegistry } from './models';
import * as P from './prompts';

const DEMO_LABEL = '데모 브레인';
const RULE_LABEL = '규칙 기반';
/** Thrown inside an llm callback when the requested provider operation could not run (heuristic substituted). */
class Substitute extends Error {}
type J = Record<string, unknown>;

export function createBrain(): Brain {
  const registry = new ModelRegistry();
  const warned = new Set<string>();
  const warnOnce = (kind: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    const key = `${kind}:${msg.slice(0, 40)}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[brain] ${kind} failed, using demo heuristic: ${msg}`);
  };

  const rule = <T>(value: T): AIResult<T> => ({ value, model: RULE_LABEL, fallback: false, source: 'rule' });

  /** source: 'llm' only when a live provider produced the value; 'heuristic' for the offline brain; 'rule' via `rule()`. */
  async function run<T>(name: string, heur: () => T, llm?: (opt: ModelOption) => Promise<T>): Promise<AIResult<T>> {
    const opt = registry.active();
    if (opt.provider === 'mock') return { value: heur(), model: DEMO_LABEL, fallback: false, source: 'heuristic' };
    if (!opt.available || circuitOpen(opt.provider)) return { value: heur(), model: DEMO_LABEL, fallback: true, source: 'heuristic' };
    if (!llm) return rule(heur());
    try {
      return { value: await llm(opt), model: opt.label, fallback: false, source: 'llm' };
    } catch (e) {
      if (!(e instanceof Substitute)) warnOnce(name, e);
      return { value: heur(), model: DEMO_LABEL, fallback: true, source: 'heuristic' };
    }
  }

  const ask = <T = J>(opt: ModelOption, p: { system: string; user: string }, maxTokens = 900, images?: { mime: string; base64: string }[]) =>
    completeJson<T>(opt, { system: p.system, turns: [{ role: 'user', text: p.user }], maxTokens, images });

  const brain: Brain = {
    getModelState: () => registry.state(),
    setActiveModel: key => registry.setActive(key),

    // ── interview ────────────────────────────────────────────────────────
    startInterview: input => run('startInterview', () => startTurn(input), async opt => {
      const img = loadImage(input.photoPath);
      if (!img) throw new Substitute('image unavailable');
      const j = await ask(opt, P.interviewStartPrompt(), 300, [img]);
      let obs = str(j.observation, 80);
      if (!obs) throw new Error('missing observation');
      if (!/[.!요다]$/.test(obs)) obs += '.';
      return startTurn(input, obs);
    }),

    interviewTurn: async (state, answer) => {
      const { turn, nextSlot } = planNext(state, answer);
      if (turn.done || !nextSlot) return rule(turn);
      return run('interviewTurn', () => turn, async opt => {
        const lastQ = SLOT_QUESTION[nextSlot];
        const ack = turn.reply.replace(lastQ, '').trim();
        const j = await ask(opt, P.interviewTurnPrompt(state, answer, nextSlot, ack, lastQ), 300);
        const reply = str(j.reply, 140);
        if (!reply || !/[?？]/.test(reply)) return turn;
        return { ...turn, reply };
      });
    },

    extractMemory: (state, senior) => {
      const h = extractFromState(state);
      return run<ExtractedMemory>('extractMemory', () => h, async opt => {
        const j = await ask(opt, P.extractMemoryPrompt(state, senior), 1200);
        const yr = typeof j.year === 'number' && Number.isInteger(j.year) && j.year >= 1900 && j.year <= 2030 ? j.year : h.year;
        const place = str(j.place, 30) ?? h.place;
        const rp = place ? resolvePlace(place) : undefined;
        const people: MemoryPerson[] = Array.isArray(j.people)
          ? (j.people as J[]).filter(p => p && typeof p.name === 'string' && p.name.trim()).map(p => ({ name: String(p.name).trim().slice(0, 20), ...(typeof p.relation === 'string' && p.relation ? { relation: p.relation.slice(0, 10) } : {}) })).slice(0, 8)
          : [];
        const emotions = strArr(j.emotions, 3, 10).filter(e => EMOTION_LABELS.includes(e));
        const season = str(j.season, 2);
        return {
          title: str(j.title, 40) ?? h.title,
          story: str(j.story, 700) ?? h.story,
          summary: str(j.summary, 120) ?? h.summary,
          year: yr, era: yr ? decadeEra(yr) : str(j.era, 10) ?? h.era,
          season: season && ['봄', '여름', '가을', '겨울'].includes(season) ? season : h.season,
          place, placeId: rp?.place.id ?? (place === h.place ? h.placeId : undefined),
          people: people.length ? people : h.people,
          event: str(j.event, 12) ?? h.event,
          emotions: emotions.length ? emotions : h.emotions,
          tags: strArr(j.tags, 8, 14).length ? strArr(j.tags, 8, 14) : h.tags,
        };
      });
    },

    // ── senior ───────────────────────────────────────────────────────────
    classifySeniorIntent: (text, ctx) => {
      const h = seniorIntent(text, ctx);
      if (h.type !== 'smalltalk') return Promise.resolve(rule<SeniorIntent>(h));
      return run<SeniorIntent>('classifySeniorIntent', () => h, async opt => {
        const j = await ask(opt, P.seniorIntentPrompt(text, ctx.knownNodeNames), 200);
        const type = String(j.type);
        const kws = strArr(j.keywords, 5, 20);
        if (type === 'recall' && kws.length) return { type: 'recall', keywords: kws };
        if (type === 'trip') return { type: 'trip', destination: str(j.destination, 20) };
        if (type === 'ask_share') return { type: 'ask_share' };
        return h;
      });
    },

    recallReply: (memory, query) => run('recallReply', () => hRecall(memory, query), async opt => {
      const j = await ask(opt, P.recallPrompt(memory, query), 400);
      return str(j.reply, 300) ?? hRecall(memory, query);
    }),

    seniorChat: (history, text) => run('seniorChat', () => hChat(text), async opt => {
      const h = hChat(text);
      const hist = history.slice(-6).map(t => `${t.role === 'user' ? '어머님' : '타치'}: ${t.text}`).join('\n');
      const j = await ask(opt, P.seniorChatPrompt(hist, text), 400);
      const reply = str(j.reply, 200);
      if (!reply) throw new Error('missing reply');
      const qr = strArr(j.quickReplies, 3, 14);
      const cat = String(j.category) as PrivacyCategory;
      return { reply, quickReplies: qr.length ? qr : h.quickReplies, category: ['health', 'mood', 'daily'].includes(cat) ? cat : h.category };
    }),

    shareSummary: memory => run('shareSummary', () => hShare(memory), async opt => {
      const h = hShare(memory);
      const j = await ask(opt, P.shareSummaryPrompt(memory), 600);
      return { title: str(j.title, 50) ?? h.title, summary: str(j.summary, 500) ?? h.summary };
    }),

    suggestTrip: memory => run('suggestTrip', () => hSuggest(memory), async opt => {
      const h = hSuggest(memory);
      const pl = placeById(memory.placeId) ?? findPlaces(memory.place ?? '')[0];
      const nearby = (pl?.nearby ?? []).map(placeById).map(p => p?.name).filter((x): x is string => !!x);
      const j = await ask(opt, P.suggestTripPrompt(memory, nearby, pl?.travelFromSeoul ?? ''), 500);
      const hl = strArr(j.highlights, 4, 20);
      return {
        memoryId: memory.id,
        title: str(j.title, 40) ?? h.title, reason: str(j.reason, 200) ?? h.reason,
        destination: str(j.destination, 20) ?? h.destination,
        highlights: hl.length >= 2 ? hl : h.highlights, durationLabel: str(j.durationLabel, 10) ?? h.durationLabel,
      };
    }),

    planItinerary: suggestion => run('planItinerary', () => hPlan(suggestion), async opt => {
      const h = hPlan(suggestion);
      const tpl = templateFor(suggestion.destination);
      const tplText = tpl.days.map(d => `${d.label}: ${d.stops.map(s => `${s.time} ${s.title}`).join(' → ')}`).join('\n');
      const j = await ask(opt, P.itineraryPrompt(suggestion.title, suggestion.destination, suggestion.highlights, tplText), 2500);
      const days = Array.isArray(j.days) ? (j.days as J[]).map((d, i) => {
        const stops: TripStop[] = Array.isArray(d.stops) ? (d.stops as J[]).filter(s => s && typeof s.title === 'string' && /^\d{1,2}:\d{2}$/.test(String(s.time))).map(s => ({
          time: String(s.time).padStart(5, '0'), title: String(s.title).slice(0, 30), description: str(s.description, 80) ?? '',
          ...(str(s.travel, 40) ? { travel: str(s.travel, 40) } : {}), ...(str(s.note, 80) ? { note: str(s.note, 80) } : {}),
        })).slice(0, 7) : [];
        return { label: str(d.label, 10) ?? `${i + 1}일차`, stops };
      }).filter(d => d.stops.length >= 2).slice(0, 4) : [];
      if (!days.length) throw new Error('invalid itinerary');
      const tips = strArr(j.tips, 5, 80);
      const out: Omit<ItineraryPayload, 'type' | 'tripId'> = {
        title: str(j.title, 40) ?? h.title, destination: suggestion.destination, dateLabel: '날짜 미정', days, tips: tips.length ? tips : h.tips,
      };
      return out;
    }),

    proactiveMessage: ({ kind, memory, now }) => run('proactiveMessage', () => hProactive(kind, memory, now), async opt => {
      const h = hProactive(kind, memory, now);
      const j = await ask(opt, P.proactivePrompt(kind, memory, now), 400);
      const text = str(j.text, 220);
      if (!text) throw new Error('missing text');
      const qr = strArr(j.quickReplies, 3, 14);
      return { text, quickReplies: qr.length ? qr : h.quickReplies };
    }),

    composeReport: ({ sessions, privacy, moodToday, now }) => {
      const h = hReport(sessions, privacy, moodToday, now);
      if (!h.sessions.length) return Promise.resolve(rule(h));
      return run('composeReport', () => h, async opt => {
        const j = await ask(opt, P.reportHighlightPrompt(h.sessions, h.moodLabel), 400);
        return { ...h, highlight: str(j.highlight, 200) ?? h.highlight };
      });
    },

    // ── family ───────────────────────────────────────────────────────────
    classifyFamilyIntent: async (text, asker) => rule(familyIntent(text, asker)),

    answerFamily: (question, ctx) => {
      const h = hAnswer(question, ctx);
      // Privacy: refusals and no-data answers never reach the LLM.
      const cat = questionCategory(question);
      const refusal = !!cat && ctx.privateCategories.includes(cat);
      if (refusal) return Promise.resolve(rule<FamilyAnswer>(h));
      return run<FamilyAnswer>('answerFamily', () => h, async opt => {
        const j = await ask(opt, P.familyAnswerPrompt(question, ctx), 700);
        const text = str(j.text, 500);
        if (!text) throw new Error('missing text');
        return { text, showHealthCard: h.showHealthCard };
      });
    },

    draftGathering: input => run<GatheringDraft>('draftGathering', () => hDraft(input), async opt => {
      const h = hDraft(input);
      const ids = new Set(input.members.map(m => m.id));
      const j = await ask(opt, P.gatheringPrompt(input), 1500);
      const tasks = Array.isArray(j.tasks) ? (j.tasks as J[]).filter(t => t && typeof t.text === 'string').map(t => ({
        text: String(t.text).slice(0, 80), ...(typeof t.assigneeId === 'string' && ids.has(t.assigneeId) ? { assigneeId: t.assigneeId } : {}),
      })).slice(0, 8) : [];
      const agenda = strArr(j.agenda, 8, 80);
      return {
        title: str(j.title, 40) ?? h.title, background: str(j.background, 300) ?? h.background, purpose: str(j.purpose, 200) ?? h.purpose,
        place: str(j.place, 40) ?? h.place, agenda: agenda.length >= 2 ? agenda : h.agenda, tasks: tasks.length >= 2 ? tasks : h.tasks,
        notes: str(j.notes, 300) ?? h.notes,
      };
    }),

    assistArtifact: (artifact, members) => run('assistArtifact', () => hAssist(artifact, members), async opt => {
      const ids = new Set(members.map(m => m.id));
      const j = await ask(opt, P.assistPrompt(artifact, members), 700);
      const newTasks: Omit<ArtifactTask, 'id' | 'done'>[] = Array.isArray(j.newTasks) ? (j.newTasks as J[]).filter(t => t && typeof t.text === 'string').map(t => ({
        text: String(t.text).slice(0, 80), ...(typeof t.assigneeId === 'string' && ids.has(t.assigneeId) ? { assigneeId: t.assigneeId } : {}),
      })).slice(0, 3) : [];
      if (!newTasks.length) throw new Error('no tasks');
      return { message: str(j.message, 160) ?? '빠지기 쉬운 준비를 제안했어요.', newTasks };
    }),

    parseAvailability: (text, slots) => {
      const h = availability(text, slots);
      if (h.length) return Promise.resolve(rule<string[]>(h));
      return run<string[]>('parseAvailability', () => h, async opt => {
        const j = await ask(opt, P.availabilityPrompt(text, slots), 300);
        const valid = new Set(slots.map(s => s.id));
        return strArr(j.slotIds, 12, 20).filter(id => valid.has(id));
      });
    },

    botReply: async ctx => {
      const heur = hBot(ctx);
      if (heur === '' && ctx.trigger.kind !== 'share_card') return rule('');
      return run('botReply', () => heur, async opt => {
      const j = await ask(opt, P.botPrompt(ctx), 200);
      const r = typeof j.reply === 'string' ? j.reply.trim().slice(0, 140) : '';
      return r;
      });
    },
  };
  return brain;
}

