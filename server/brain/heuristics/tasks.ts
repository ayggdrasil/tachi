// Offline task classification: which action Tachi can take for a gathering to-do.
import type { BookingCategory, ReportOpenTask, TaskActionKind } from '../../../shared/types';
import type { TaskClassification } from '../contract';

export type { TaskClassification };

const CALENDAR_RE = /캘린더|달력|일정\s*(?:공유|등록|알림)|초대(?:장)?\s*(?:보내|발송)|참석\s*확인/;
const TRAIN_RE = /KTX|ktx|SRT|srt|기차|열차|코레일|기차표|승차권/;
const CAR_RE = /렌터카|렌트카|차량\s*(?:예약|대여)|승합차|콜택시/;
const LODGING_RE = /숙소|호텔|펜션|한옥\s*스테이|한옥|리조트|민박|게스트하우스|방\s*예약/;
const RESTAURANT_RE = /식당|맛집|한정식|음식점|레스토랑|점심\s*예약|저녁\s*예약|식사\s*예약|룸\s*예약/;
const BOOK_RE = /예약|예매|대여/;
/** Notes-like items Tachi cannot really act on beyond reminding (and there is nothing to remind without an owner). */
const NONE_RE = /^(?:참고|메모|아이디어)/;

/** Deterministic classification used by the demo brain and as the LLM fallback. */
export function classifyTask(text: string): TaskClassification {
  const t = text.trim();
  if (!t || NONE_RE.test(t)) return { kind: 'none' };
  if (CALENDAR_RE.test(t)) return { kind: 'calendar_invite' };
  // order matters: '숙소·식당 예약' → lodging first (the bigger booking), 'KTX·차량 예약' → train
  if (TRAIN_RE.test(t)) return { kind: 'booking_link', category: 'train', query: 'KTX' };
  if (LODGING_RE.test(t)) return { kind: 'booking_link', category: 'lodging', query: /한옥/.test(t) ? '한옥 숙소' : '숙소' };
  if (RESTAURANT_RE.test(t)) return { kind: 'booking_link', category: 'restaurant', query: /한정식/.test(t) ? '한정식' : '식당' };
  if (CAR_RE.test(t)) return { kind: 'booking_link', category: 'car', query: '렌터카' };
  if (BOOK_RE.test(t)) return { kind: 'booking_link', category: 'other', query: t.replace(/예약|예매|대여/g, '').replace(/[()·,]/g, ' ').trim() || '예약' };
  return { kind: 'reminder' };
}

export const TASK_KINDS: TaskActionKind[] = ['calendar_invite', 'booking_link', 'reminder', 'none'];
export const BOOKING_CATEGORIES: BookingCategory[] = ['restaurant', 'lodging', 'train', 'car', 'other'];

/** '남은 할 일 2개 · KTX·차량 예약(민준) 외 1개' — the report line about open to-dos ('' when none). */
export function openTasksLine(tasks: ReportOpenTask[], people: Record<string, string> = {}): string {
  if (!tasks.length) return '';
  const first = tasks[0];
  const who = first.assigneeId ? people[first.assigneeId] ?? '' : '';
  const label = `${first.text.replace(/\s*\(.*?\)\s*/g, ' ').trim()}${who ? `(${who})` : ''}`;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  return `남은 할 일 ${tasks.length}개 · ${label}${tasks.length > 1 ? ` 외 ${tasks.length - 1}개` : ''}${blocked ? ` · 도움이 필요한 일 ${blocked}개` : ''}`;
}
