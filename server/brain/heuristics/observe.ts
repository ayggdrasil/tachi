// Polarity-aware extraction of explicit medication / mood statements from senior small talk.
import type { SeniorObservation } from '../contract';

const NEG = /(?:안\s*먹|안\s*챙|안\s*드|못\s*먹|못\s*챙|못\s*드|깜빡|잊었|잊어버|거르|걸렀|빼먹|먹지\s*(?:않|못)|챙기지\s*(?:않|못)|드시지\s*(?:않|못))/;
const POS = /(?:먹었|챙겨\s*먹|챙겼|드셨|먹고\s*왔|먹었어|복용했)/;
const MED_NAME = /(혈압약|관절약|당뇨약|감기약|소화제|영양제|비타민|진통제|수면제|[가-힣]{1,4}약)/;

export function medicationObservation(t: string): SeniorObservation['medication'] | undefined {
  if (!/[가-힣]/.test(t) && /[A-Za-z]/.test(t)) return medicationObservationEn(t);
  if (!/약|복약|영양제|비타민/.test(t)) return undefined;
  // "약 먹었어" style statement; questions are not observations
  if (/[?？]\s*$/.test(t) || /먹을까|먹어야|먹을게|먹어도/.test(t)) return undefined;
  let taken: boolean;
  if (NEG.test(t)) taken = false;
  else if (POS.test(t)) taken = true;
  else return undefined;
  const time = /아침/.test(t) ? '아침' : /점심/.test(t) ? '점심' : /저녁/.test(t) ? '저녁' : undefined;
  const nm = t.match(MED_NAME)?.[1];
  const name = nm && nm !== '약' && !/^(?:먹는|그|이|저|무슨|무)약$/.test(nm) ? nm : undefined;
  return { taken, ...(name ? { name } : {}), ...(time ? { time } : {}) };
}

export function moodObservation(t: string): string | undefined {
  if (!/[가-힣]/.test(t) && /[A-Za-z]/.test(t)) return moodObservationEn(t);
  if (/우울|속상|외로|쓸쓸|허전|슬프/.test(t) && !/안\s*(?:우울|속상|외로|슬프)/.test(t)) return '조금 우울';
  if (/그저\s*그래|그냥\s*그래|보통|그럭저럭|so\s*so/.test(t)) return '보통';
  if (/기분\s*(?:이\s*)?(?:좋|최고)|기분\s*좋네|행복|신나|즐거/.test(t) && !/안\s*좋|별로/.test(t)) return '좋음';
  return undefined;
}

// ── English ────────────────────────────────────────────────────────────────
const MED_WORD_EN = /\b(?:pills?|medicine|medication|meds|tablets?|vitamins?|supplements?|capsules?|prescription)\b/i;
const NEG_EN = /\b(?:didn'?t|did not|haven'?t|have not|hasn'?t|forgot|forgotten|forget|skipped|skip|missed|never took|not yet|without|couldn'?t|wasn'?t able)\b|n'?t (?:take|took|taken|have|had|eat|ate)\b|\bnot (?:take|took|taken)\b/i;
const POS_EN = /\b(?:took|taken|have taken|already took|just took|swallowed|had my|finished my|drank my|takes?)\b/i;
const MED_NAME_EN = /\b(blood pressure|joint|diabetes|cold|heart|sleeping|pain|stomach|cholesterol|allergy)\s+(?:pills?|medicine|medication|meds|tablets?)/i;
export function medicationObservationEn(t: string): SeniorObservation['medication'] | undefined {
  if (!MED_WORD_EN.test(t)) return undefined;
  if (/\?\s*$/.test(t) || /\b(?:should i|shall i|do i need|do i have to|can i|may i|need to take|have to take|going to take|gonna take|about to take|will take|remind me|supposed to)\b/i.test(t)) return undefined;
  let taken: boolean;
  if (NEG_EN.test(t)) taken = false;
  else if (POS_EN.test(t)) taken = true;
  else return undefined;
  const time = /\b(?:morning|breakfast)\b/i.test(t) ? '아침' : /\b(?:lunch|noon|midday|afternoon)\b/i.test(t) ? '점심' : /\b(?:evening|dinner|night|bedtime|supper)\b/i.test(t) ? '저녁' : undefined;
  const nm = t.match(MED_NAME_EN);
  const vit = t.match(/\b(vitamins?|supplements?)\b/i);
  const name = nm ? `${nm[1].toLowerCase()} medicine` : vit ? vit[1].toLowerCase().replace(/s$/, '') + 's' : undefined;
  return { taken, ...(name ? { name } : {}), ...(time ? { time } : {}) };
}
export function moodObservationEn(t: string): string | undefined {
  if (/\b(?:sad|down|lonely|blue|depressed|upset|gloomy|empty|low|homesick|miserable)\b/i.test(t) && !/\b(?:not|n't|never)\s+(?:feeling\s+|so\s+|too\s+|very\s+)*(?:sad|down|lonely|blue|depressed|upset|low)\b/i.test(t) && /\b(?:feel|feeling|felt|i'?m|i am|am|so|a bit|bit|little|today|mood)\b/i.test(t)) return '조금 우울';
  if (/\bso[- ]so\b|\bmeh\b|\bjust (?:okay|ok|alright|fine)\b|\bnothing special\b|\bsame as usual\b|\baverage\b|\bnot (?:so |too )?bad\b/i.test(t)) return '보통';
  if (/\b(?:feel|feeling|felt|i'?m|i am|mood is|in a)\s+(?:so |very |really |pretty |quite |much |a )?(?:good|great|wonderful|happy|cheerful|fantastic|lovely|better|well|joyful|excellent)\b|\bso happy\b|\bgood mood\b|\bgreat mood\b|\bhappy today\b/i.test(t)
    && !/\b(?:not|n't|never)\s+(?:feeling\s+|so\s+|too\s+|very\s+|really\s+)*(?:good|great|happy|well)\b|\bnot in a good\b/i.test(t)) return '좋음';
  return undefined;
}

export function observe(t: string): SeniorObservation | undefined {
  const medication = medicationObservation(t);
  const mood = moodObservation(t);
  if (!medication && !mood) return undefined;
  return { ...(medication ? { medication } : {}), ...(mood ? { mood } : {}) };
}

/** Validate an observation field coming from an LLM. */
export function validateObservation(v: unknown): SeniorObservation | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: SeniorObservation = {};
  const m = o.medication as Record<string, unknown> | undefined;
  if (m && typeof m === 'object' && typeof m.taken === 'boolean') {
    const time = typeof m.time === 'string' && ['아침', '점심', '저녁'].includes(m.time) ? (m.time as '아침' | '점심' | '저녁') : undefined;
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 12) : undefined;
    out.medication = { taken: m.taken, ...(name ? { name } : {}), ...(time ? { time } : {}) };
  }
  if (typeof o.mood === 'string' && ['좋음', '보통', '조금 우울'].includes(o.mood.trim())) out.mood = o.mood.trim();
  return out.medication || out.mood ? out : undefined;
}

// Explicit mood wording per label: an LLM mood is accepted only when the senior's own words contain it.
const MOOD_EVIDENCE: Record<string, RegExp> = {
  '좋음': /기분\s*(?:이\s*)?(?:좋|최고)|행복|신나|즐거|\b(?:feel|feeling|felt|i'?m|i am|mood is)\s+(?:so |very |really |pretty |quite |much |a )?(?:good|great|wonderful|happy|cheerful|fantastic|lovely|better|well|joyful)\b|\bso happy\b|\bgood mood\b/i,
  '보통': /그저\s*그래|그냥\s*그래|보통|그럭저럭|\bso[- ]so\b|\bmeh\b|\bjust (?:okay|ok|alright)\b|\bnothing special\b/i,
  '조금 우울': /우울|속상|외로|쓸쓸|허전|슬프|\b(?:sad|lonely|down|blue|depressed|upset|gloomy)\b/i,
};

/**
 * Field-by-field merge of grounded facts only. Medication taken/name/time come from the deterministic extraction
 * of the senior's own words (model-added name/time are never accepted); an LLM medication fact with no deterministic
 * support is dropped. Mood needs explicit mood wording in the text: deterministic extraction, or an LLM mood whose
 * label matches an explicit mood word in `text`.
 */
export function mergeObservation(llm: SeniorObservation | undefined, det: SeniorObservation | undefined, text = ''): SeniorObservation | undefined {
  const out: SeniorObservation = {};
  if (det?.medication) out.medication = { ...det.medication };
  const llmMood = llm?.mood && MOOD_EVIDENCE[llm.mood]?.test(text) && !/안\s*(?:좋|우울|속상|외로|슬프)|별로|\bnot (?:so |very |too |feeling )*(?:good|great|happy|well|sad|lonely|down)\b/i.test(text) ? llm.mood : undefined;
  const mood = det?.mood ?? llmMood;
  if (mood) out.mood = mood;
  return out.medication || out.mood ? out : undefined;
}
