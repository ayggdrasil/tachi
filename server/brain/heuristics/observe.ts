// Polarity-aware extraction of explicit medication / mood statements from senior small talk.
import type { SeniorObservation } from '../contract';

const NEG = /(?:안\s*먹|안\s*챙|안\s*드|못\s*먹|못\s*챙|못\s*드|깜빡|잊었|잊어버|거르|걸렀|빼먹|먹지\s*(?:않|못)|챙기지\s*(?:않|못)|드시지\s*(?:않|못))/;
const POS = /(?:먹었|챙겨\s*먹|챙겼|드셨|먹고\s*왔|먹었어|복용했)/;
const MED_NAME = /(혈압약|관절약|당뇨약|감기약|소화제|영양제|비타민|진통제|수면제|[가-힣]{1,4}약)/;

export function medicationObservation(t: string): SeniorObservation['medication'] | undefined {
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
  if (/우울|속상|외로|쓸쓸|허전|슬프/.test(t) && !/안\s*(?:우울|속상|외로|슬프)/.test(t)) return '조금 우울';
  if (/그저\s*그래|그냥\s*그래|보통|그럭저럭|so\s*so/.test(t)) return '보통';
  if (/기분\s*(?:이\s*)?(?:좋|최고)|기분\s*좋네|행복|신나|즐거/.test(t) && !/안\s*좋|별로/.test(t)) return '좋음';
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
