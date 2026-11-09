// Offline (demo brain) planner: deterministic tool plans for a few request shapes, and a composer that turns tool
// results into a warm Korean answer. Also composes the answer when a live loop failed after a state-changing tool ran.
import { resolvePlace } from '../data/places';
import type { ToolAudience } from '../tools';
import type { AgentStep } from './toolLoop';
import { parseClock, parseWhen } from '../tools/time';

export interface PlannedCall { name: string; input: Record<string, unknown> }

const REMIND_RE = /리마인더|알림\s*(?:좀\s*)?(?:해|설정|맞춰|등록|보내)|알려\s*(?:줘|주|드려|달)|깨워\s*줘|잊지\s*않게|챙겨\s*(?:줘|드려)/;
const REMIND_LIST_RE = /(?:리마인더|알림).{0,8}(?:뭐|목록|있|확인|보여)/;
const ROUTE_RE = /가는\s*길|어떻게\s*가|가려면|교통편?|얼마나\s*걸려|길\s*(?:좀\s*)?알려/;
const NEAR_RE = /(?:근처|주변).{0,10}(?:어디|뭐|추천|가볼|볼\s*만|구경)/;

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
  const lines: string[] = [];
  for (const s of steps) {
    if (s.kind !== 'tool' || !s.run) continue;
    if (!s.ok) {
      if (s.run.error?.code === 'forbidden') lines.push('그 내용은 어머님이 비공개로 두셔서 알려 드릴 수 없어요.');
      continue;
    }
    const d = s.run.output!.data as J;
    switch (s.name) {
      case 'reminder_create': {
        const r = d.reminder as J;
        lines.push(d.duplicate ? `이미 ${r.when}에 '${r.text}' 알림이 있어요.` : `${r.when}에 '${r.text}' 알려 드릴게요.${r.repeat === 'daily' ? ' 매일 같은 시간에 알려 드려요.' : ''}`);
        break;
      }
      case 'reminder_list': {
        const rs = d.reminders as J[];
        lines.push(rs.length ? `등록된 알림은 ${rs.slice(0, 3).map(r => `${r.when} '${r.text}'`).join(', ')}${rs.length > 3 ? ` 외 ${rs.length - 3}건` : ''}이에요.` : '지금 등록된 알림은 없어요.');
        break;
      }
      case 'transit_route':
        lines.push(`${d.from}에서 ${d.to}까지 ${d.modeLabel}로 ${d.durationLabel} 걸려요.${(d.seniorNotes as string[])[0] ? ` ${(d.seniorNotes as string[])[0]}` : ''}`);
        break;
      case 'map_search': {
        const ps = d.places as J[];
        lines.push(ps.length ? `${d.center ?? ''} 근처에는 ${ps.map(p => p.name).join(', ')}이 있어요. ${String(ps[0].seniorNote ?? '')}`.trim() : '근처에서 알맞은 곳을 찾지 못했어요.');
        break;
      }
      case 'graph_search': {
        const rs = d.results as J[];
        if (rs.length) lines.push(`${rs[0].title} 이야기가 있어요. ${rs[0].summary ?? ''}`.trim());
        break;
      }
    }
  }
  const out = lines.join(' ').trim();
  return out || undefined;
}
