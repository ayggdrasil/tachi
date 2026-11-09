// Offline (demo brain) planner: deterministic tool plans for a few request shapes (Korean or English), and a composer that
// turns tool results into a warm answer in the active language. Also composes the answer when a live loop failed after a state-changing tool ran.
import { resolvePlace } from '../data/places';
import type { ToolAudience } from '../tools';
import type { AgentStep } from './toolLoop';
import { parseClock, parseWhen } from '../tools/time';
import { getLocale } from './locale';

export interface PlannedCall { name: string; input: Record<string, unknown> }

const REMIND_RE = /리마인더|알림\s*(?:좀\s*)?(?:해|설정|맞춰|등록|보내)|알려\s*(?:줘|주|드려|달)|깨워\s*줘|잊지\s*않게|챙겨\s*(?:줘|드려)/;
const REMIND_LIST_RE = /(?:리마인더|알림).{0,8}(?:뭐|목록|있|확인|보여)/;
const ROUTE_RE = /가는\s*길|어떻게\s*가|가려면|교통편?|얼마나\s*걸려|길\s*(?:좀\s*)?알려/;
const NEAR_RE = /(?:근처|주변).{0,10}(?:어디|뭐|추천|가볼|볼\s*만|구경)/;
// English request shapes (same intents; none of the DEMO_SCRIPT_EN lines match them)
const REMIND_EN = /\bremind\b|\bset (?:up )?(?:a |an )?(?:reminder|alarm)\b|\bdon'?t let (?:me|her|mom) forget\b|\bwake (?:me|her|mom) up\b/i;
const REMIND_LIST_EN = /\b(?:what|which|any|list|show|check)\b.{0,25}\breminders\b|\breminders?\b.{0,15}\b(?:do i have|does (?:she|mom) have|are (?:there|set))\b/i;
const ROUTE_EN = /\bhow (?:do|can|would|should|does) (?:i|we|she|mom|you|one) (?:get|go|travel)\b|\bdirections?\b|\broute to\b|\bway to\b|\bhow (?:long|far)\b.{0,40}\b(?:to|from)\b/i;
const NEAR_EN = /\b(?:near(?:by)?|around|close to)\b/i;
const NEAR_ASK_EN = /\b(?:what|where|any|recommend|worth|visit|see|places?|things|spots?)\b/i;

/** English counterpart of reminderText: 'Remind me to take my blood pressure pills tomorrow at 8am' → 'take your blood pressure pills'. */
export function reminderTextEn(text: string): string {
  let t = ` ${text} `
    .replace(/\btachi\b[,!]?\s*/gi, ' ')
    .replace(/\b(?:please|can you|could you|would you)\b[,]?\s*/gi, ' ')
    .replace(/\b(?:remind|wake)\s+(?:me|her|mom|grandma|my mom|my mother)\s*(?:up\s*)?(?:to|about|that|of)?\s+/i, ' ')
    .replace(/\bset (?:up )?(?:a |an )?(?:reminder|alarm)\s*(?:for (?:me|her|mom)\s*)?(?:to|about|for)?\s+/i, ' ')
    .replace(/\bdon'?t let (?:me|her|mom) forget\s*(?:to|about)?\s+/i, ' ')
    .replace(/\b(?:every ?day|daily|each day)\b/gi, ' ')
    .replace(/\b(?:on\s+)?(?:the\s+)?day after tomorrow\b|\b(?:tomorrow|today|tonight)\b/gi, ' ')
    .replace(/\b(?:this|tomorrow|in the)\s+(?:morning|afternoon|evening)\b|\bat night\b/gi, ' ')
    .replace(/\b(?:on\s+)?(?:next\s+|this\s+)?(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*day\b/gi, ' ')
    .replace(/\b(?:at|around|by)?\s*\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s*m\b\.?|o'?clock)?/gi, m => (/[ap]\.?\s*m|o'?clock|:|at|around|by/i.test(m) ? ' ' : m))
    .replace(/\b(?:at|around)\s+(?:noon|midnight)\b/gi, ' ')
    .replace(/\bin\s+(?:\d+|an?|one|two|three|half an)\s*(?:min(?:ute)?s?|hours?|hrs?)\b/gi, ' ')
    .replace(/\s+(?:in the|this|at)\s*$/i, ' ')
    .replace(/\b(?:my|her)\b/gi, 'your')
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(/\s+(?:at|on|in|for)$/i, '').replace(/^(?:to|about)\s+/i, '').trim();
  return t.length >= 2 ? t.slice(0, 60) : 'what we talked about';
}

/** What the senior should be reminded of, in a short noun phrase: '내일 아침 8시에 혈압약 먹으라고 알려줘' → '혈압약 드시기'. */
export function reminderText(text: string): string {
  let t = text
    .replace(/타치(?:야|님)?[,\s]*/g, '')
    .replace(/(?:엄마|어머니|어머님|할머니|할머님)(?:한테|께|에게)?\s*/g, '')
    .replace(/(?:매일|날마다|오늘|내일|모레|글피|다음\s*주|이번\s*주)\s*/g, '')
    .replace(/[일월화수목금토]요일\s*/g, '')
    .replace(/(?:오전|오후|아침|점심|낮|저녁|밤|새벽)?\s*(?:\d{1,2}|열한|열두|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*시(?:\s*반|\s*\d{1,2}\s*분)?\s*(?:에|쯤)?\s*/g, '')
    .replace(/\d{1,2}:\d{2}\s*(?:에)?\s*/g, '')
    .replace(/(?:\d+|한|두|세)\s*(?:분|시간)\s*(?:뒤|후|있다가)(?:에)?\s*/g, '')
    .replace(/(?:아침|점심|저녁|밤)(?:에)?\s+/g, '')
    .replace(/\s*(?:좀\s*)?(?:리마인더|알림)\s*(?:좀\s*)?(?:해|설정해|맞춰|등록해|보내)\s*(?:줘|줄래|주세요|드려)?.*$/, '')
    .replace(/\s*(?:좀\s*)?(?:알려|깨워|챙겨)\s*(?:줘|주세요|드려|줄래|달라).*$/, '')
    .trim();
  t = t
    .replace(/(먹|드시|드)(?:으라고|라고|시라고|도록)$/, '드시기')
    .replace(/(?:하|해)(?:라고|시라고|도록)$/, '하기')
    .replace(/(\S)(?:으라고|라고|시라고|도록)$/, '$1기')
    .replace(/(?:거|것)\s*$/, '').replace(/[,.\s]+$/, '').trim();
  if (/약/.test(t) && !/드시|먹/.test(t)) t = `${t} 드시기`;
  return t.length >= 2 ? t.slice(0, 60) : '약속드린 일';
}

/** A deterministic plan, or null when the request is not one the offline planner handles (→ state machine). */
export function planOffline(text: string, audience: ToolAudience, now: Date): PlannedCall[] | null {
  const t = text.trim();
  if (!t) return null;
  if (/[A-Za-z]/.test(t) && !/[가-힣]/.test(t)) {
    if (REMIND_EN.test(t) && !REMIND_LIST_EN.test(t)) {
      const at = parseWhen(t, now);
      if (at && (parseClock(t) || /\bin\s+(?:\d+|an?|one|two|three|half an)\s*(?:min|hour|hr)/i.test(t))) {
        return [{ name: 'reminder_create', input: { text: reminderTextEn(t), at: at.toISOString(), repeat: /\b(?:every ?day|daily|each day)\b/i.test(t) ? 'daily' : 'none' } }];
      }
    }
    if (REMIND_LIST_EN.test(t)) return [{ name: 'reminder_list', input: {} }];
    const placeEn = resolvePlace(t)?.place;
    if (ROUTE_EN.test(t) && placeEn) return [{ name: 'transit_route', input: { to: placeEn.name, from: '집' } }];
    if (NEAR_EN.test(t) && NEAR_ASK_EN.test(t) && placeEn) return [{ name: 'map_search', input: { near: placeEn.name, limit: 3 } }];
    return null;
  }
  if (REMIND_RE.test(t) && !REMIND_LIST_RE.test(t) && !/일정/.test(t)) {
    const at = parseWhen(t, now);
    if (at && (parseClock(t) || /분\s*(?:뒤|후)|시간\s*(?:뒤|후)/.test(t))) {
      return [{ name: 'reminder_create', input: { text: reminderText(t), at: at.toISOString(), repeat: /매일|날마다/.test(t) ? 'daily' : 'none' } }];
    }
  }
  if (REMIND_LIST_RE.test(t)) return [{ name: 'reminder_list', input: {} }];
  const place = resolvePlace(t)?.place;
  if (ROUTE_RE.test(t) && place) return [{ name: 'transit_route', input: { to: place.name, from: '집' } }];
  if (NEAR_RE.test(t) && place) return [{ name: 'map_search', input: { near: place.name, limit: 3 } }];
  void audience;
  return null;
}

type J = Record<string, unknown>;

/** Warm deterministic answer from tool results (offline brain, or after a live failure that already changed state). */
export function composeFromSteps(steps: AgentStep[], audience: ToolAudience): string | undefined {
  void audience;
  const en = getLocale() === 'en';
  const lines: string[] = [];
  for (const s of steps) {
    if (s.kind !== 'tool' || !s.run) continue;
    if (!s.ok) {
      if (s.run.error?.code === 'forbidden') lines.push(en ? "Mom has kept that private, so I can't share it." : '그 내용은 어머님이 비공개로 두셔서 알려 드릴 수 없어요.');
      continue;
    }
    const d = s.run.output!.data as J;
    switch (s.name) {
      case 'reminder_create': {
        const r = d.reminder as J;
        if (en) lines.push(d.duplicate ? `There's already a reminder on ${r.when}: ${r.text}.` : `I'll remind ${audience === 'family' ? 'Mom' : 'you'} on ${r.when}: ${r.text}.${r.repeat === 'daily' ? ' I\'ll do it at the same time every day.' : ''}`);
        else lines.push(d.duplicate ? `이미 ${r.when}에 '${r.text}' 알림이 있어요.` : `${r.when}에 '${r.text}' 알려 드릴게요.${r.repeat === 'daily' ? ' 매일 같은 시간에 알려 드려요.' : ''}`);
        break;
      }
      case 'reminder_list': {
        const rs = d.reminders as J[];
        if (en) lines.push(rs.length ? `Scheduled reminders: ${rs.slice(0, 3).map(r => `${r.when}, ${r.text}`).join('; ')}${rs.length > 3 ? `, and ${rs.length - 3} more` : ''}.` : 'There are no reminders scheduled right now.');
        else lines.push(rs.length ? `등록된 알림은 ${rs.slice(0, 3).map(r => `${r.when} '${r.text}'`).join(', ')}${rs.length > 3 ? ` 외 ${rs.length - 3}건` : ''}이에요.` : '지금 등록된 알림은 없어요.');
        break;
      }
      case 'transit_route': {
        const note = (d.seniorNotes as string[])[0];
        lines.push(en
          ? `From ${d.from} to ${d.to} takes ${d.durationLabel} by ${d.modeLabel}.${note ? ` ${note}` : ''}`
          : `${d.from}에서 ${d.to}까지 ${d.modeLabel}로 ${d.durationLabel} 걸려요.${note ? ` ${note}` : ''}`);
        break;
      }
      case 'map_search': {
        const ps = d.places as J[];
        if (en) lines.push(ps.length ? `Near ${d.center ?? 'there'} you'll find ${ps.map(p => p.name).join(', ')}. ${String(ps[0].seniorNote ?? '')}`.trim() : "I couldn't find a good place nearby.");
        else lines.push(ps.length ? `${d.center ?? ''} 근처에는 ${ps.map(p => p.name).join(', ')}이 있어요. ${String(ps[0].seniorNote ?? '')}`.trim() : '근처에서 알맞은 곳을 찾지 못했어요.');
        break;
      }
      case 'graph_search': {
        const rs = d.results as J[];
        if (rs.length) lines.push(en ? `There's a story about ${rs[0].title}. ${rs[0].summary ?? ''}`.trim() : `${rs[0].title} 이야기가 있어요. ${rs[0].summary ?? ''}`.trim());
        break;
      }
    }
  }
  const out = lines.join(' ').trim();
  return out || undefined;
}
