// Deterministic demo seed, all dates relative to "now". Used at first boot and by reset().
import {
  CONTACTS, DEFAULT_PRIVACY, FAMILY_ROOM_ID, PROACTIVE_SCHEDULE, SEED_FAMILY_ROOM_MEMBERS, SENIOR_ID,
  SENIOR_ROOM_ID, TACHI_ID, USERS, dayHeaderLabel, pad2,
} from '../../shared/constants';
import type {
  DemoState, HealthSummary, Memory, Message, ReportPayload, Room, SessionLog,
} from '../../shared/types';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ctx } from '../orchestrator/ctx';
import { warn, ymd } from '../util/misc';

function at(daysAgo: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
}

function seedHealth(): HealthSummary {
  const sys = [126, 130, 124, 134, 128, 132, 127];
  const dia = [80, 84, 78, 86, 82, 85, 80];
  const sleep = [6.5, 7, 5.5, 6, 7.5, 6.5, 7];
  const steps = [4200, 3800, 5600, 2800, 4900, 4400, 3600];
  const mood = ['좋음', '좋음', '보통', '좋음', '좋음', '좋음', '좋음'];
  const dates = Array.from({ length: 7 }, (_, i) => ymd(at(6 - i, '12:00')));
  return {
    updatedAt: new Date().toISOString(),
    bloodPressure: dates.map((date, i) => ({ date, systolic: sys[i], diastolic: dia[i] })),
    medications: dates.flatMap((date, i) => [
      { date, name: '혈압약', time: '아침' as const, taken: i !== 3 },
      ...(i < 6 ? [{ date, name: '관절약', time: '저녁' as const, taken: true }] : []),
    ]),
    sleepHours: dates.map((date, i) => ({ date, hours: sleep[i] })),
    steps: dates.map((date, i) => ({ date, count: steps[i] })),
    mood: dates.map((date, i) => ({ date, label: mood[i] })),
    notes: ['무릎이 시리다고 하셨어요 (어제)'],
  };
}

/** The private wedding sample is served from a non-guessable file under data/uploads, never from the public /demo-photos path. */
function privateSeedPhoto(): string {
  const fallback = '/demo-photos/wedding-1976.jpg';
  try {
    const src = path.join(ctx.rootDir, 'demo', 'photos', 'wedding-1976.jpg');
    if (!fs.existsSync(src)) return fallback;
    const dir = path.join(ctx.dataDir, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const name = `${nanoid(24)}.jpg`;
    fs.copyFileSync(src, path.join(dir, name));
    return `/uploads/${name}`;
  } catch (e) { warn('private seed photo copy failed:', e); return fallback; }
}

function seedMemories(): Memory[] {
  const base = { ownerId: SENIOR_ID, status: 'saved' as const };
  return [
    {
      ...base, id: 'mem-wedding-1976', title: '1976년 가을, 명동성당 결혼식',
      story: '1976년 가을, 명동성당에서 영수 씨와 결혼식을 올렸다. 하얀 웨딩드레스에 국화 부케를 들었는데 가슴이 얼마나 두근거렸는지 모른다. 그날의 가을 햇살이 아직도 눈에 선하다.',
      summary: '명동성당에서 영수 씨와 올린 설레는 가을 결혼식.',
      year: 1976, era: '1970년대', season: '가을', place: '서울 명동성당', placeId: 'seoul-myeongdong-cathedral',
      people: [{ name: '박영수', relation: '남편' }], event: '결혼식', emotions: ['설렘', '행복'], tags: ['웨딩드레스', '국화'],
      visibility: 'private', photoUrl: privateSeedPhoto(), createdAt: at(21, '10:20').toISOString(),
    },
    {
      ...base, id: 'mem-haeundae-1988', title: '1988년 여름, 해운대 가족 피서',
      story: '1988년 여름, 온 가족이 부산 해운대로 피서를 갔다. 바닷물이 생각보다 차가워서 지은이는 발만 담갔고, 민준이는 수박을 더 달라고 울다가 아빠 무릎에서 잠들었다. 튜브와 파라솔 아래에서 먹던 수박 맛이 지금도 그립다.',
      summary: '차가운 바다와 수박, 온 가족이 함께한 해운대의 여름.',
      year: 1988, era: '1980년대', season: '여름', place: '부산 해운대', placeId: 'busan-haeundae',
      people: [{ name: '박영수', relation: '남편' }, { name: '김지은', relation: '딸' }, { name: '박민준', relation: '아들' }],
      event: '가족여행', emotions: ['즐거움', '그리움'], tags: ['튜브', '수박', '파라솔'],
      visibility: 'family', sharedAt: at(5, '16:30').toISOString(), photoUrl: '/demo-photos/haeundae-1988.jpg', createdAt: at(6, '15:00').toISOString(),
    },
    {
      ...base, id: 'mem-graduation-1999', title: '1999년 겨울, 지은이 대학 졸업식',
      story: '1999년 겨울, 신촌에서 지은이의 대학 졸업식이 있었다. 학사모를 쓴 딸이 얼마나 대견하던지, 아빠와 함께 꽃다발을 안겨 주며 한참을 웃었다.',
      summary: '학사모를 쓴 딸에게 꽃다발을 안겨 준 뿌듯한 겨울날.',
      year: 1999, era: '1990년대', season: '겨울', place: '서울 신촌', placeId: 'seoul-sinchon',
      people: [{ name: '김지은', relation: '딸' }, { name: '박영수', relation: '남편' }], event: '졸업식', emotions: ['뿌듯함'],
      tags: ['꽃다발', '학사모'], visibility: 'family', sharedAt: at(5, '16:35').toISOString(),
      photoUrl: '/demo-photos/graduation-1999.jpg', createdAt: at(6, '15:20').toISOString(),
    },
  ];
}

const FAMILY_LINKS: [string, string][] = [['박영수', '남편'], ['김지은', '딸'], ['박민준', '아들'], ['이수연', '며느리'], ['박하린', '손녀']];

function seedSessions(): SessionLog[] {
  const mk = (id: string, hhmm: string, kind: SessionLog['kind'], title: string, category: SessionLog['category'], summary: string): SessionLog => {
    const s = at(1, hhmm);
    return { id, startedAt: s.toISOString(), endedAt: new Date(s.getTime() + 4 * 60000).toISOString(), kind, title, category, summary, reported: true };
  };
  return [
    mk('sess-seed-morning', '09:01', 'proactive', '아침 안부', 'daily', '아침 인사를 나누며 컨디션을 이야기하셨어요.'),
    mk('sess-seed-memory', '14:12', 'proactive', '해운대 사진 이야기', 'memory', '1988년 해운대 가족 피서 사진 이야기를 나누셨어요.'),
    mk('sess-seed-evening', '19:34', 'proactive', '저녁 인사', 'daily', '저녁 인사를 나누셨어요.'),
  ];
}

function seedMessages(sessions: SessionLog[]): Message[] {
  const m = (id: string, roomId: string, senderId: string, text: string, when: Date, extra: Partial<Message> = {}): Message =>
    ({ id, roomId, senderId, kind: 'text', text, createdAt: when.toISOString(), ...extra });
  const yd = new Date(at(1, '12:00'));
  const report: ReportPayload = {
    type: 'report', dateLabel: dayHeaderLabel(yd), moodLabel: '좋음',
    highlight: '어제는 해운대 가족 피서 이야기를 즐겁게 나누셨어요.',
    sessions: sessions.map(s => {
      const priv = DEFAULT_PRIVACY[s.category] === 'private';
      const d = new Date(s.startedAt);
      return { time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, title: s.title, summary: priv ? '비공개 대화예요' : s.summary, category: s.category, isPrivate: priv };
    }),
  };
  return [
    m('seed-m1', SENIOR_ROOM_ID, TACHI_ID, '어머님, 저녁 드셨어요? 오늘도 수고 많으셨어요.', at(1, '19:34'), { meta: { proactive: true, sessionId: 'sess-seed-evening', category: 'daily' }, quickReplies: ['네, 먹었어요', '아직이에요'] }),
    m('seed-m2', SENIOR_ROOM_ID, SENIOR_ID, '응, 먹었어. 너도 잘 쉬어', at(1, '19:36')),
    m('seed-m3', SENIOR_ROOM_ID, TACHI_ID, '다행이에요. 내일 아침에 또 인사드릴게요. 편히 쉬세요.', at(1, '19:36')),
    m('seed-m4', SENIOR_ROOM_ID, SENIOR_ID, '그래, 고마워', at(1, '19:37')),
    m('seed-f1', FAMILY_ROOM_ID, 'jieun', '엄마 오늘 병원 잘 다녀오셨대요. 혈압도 괜찮으시대요.', at(1, '18:20')),
    m('seed-f2', FAMILY_ROOM_ID, 'minjun', '다행이다. 주말에 한번 내려갈게요.', at(1, '18:24')),
    m('seed-f3', FAMILY_ROOM_ID, 'suyeon', '어머님 좋아하시는 반찬 챙겨서 갈게요.', at(1, '18:31')),
    m('seed-f4', FAMILY_ROOM_ID, 'jieun', '민준아 운전 조심해서 와~', at(1, '18:35')),
    m('seed-f5', FAMILY_ROOM_ID, 'minjun', 'ㅇㅋ', at(1, '18:36')),
    m('seed-f6', FAMILY_ROOM_ID, TACHI_ID, `${report.dateLabel} 어머님과 나눈 이야기를 정리했어요.`, at(1, '21:00'), { kind: 'report', payload: report }),
  ];
}

export async function seed(): Promise<void> {
  const { db, graph } = ctx;
  for (const u of USERS) db.users.put({ ...u, isBot: true });
  for (const c of CONTACTS) db.contacts.put({ ...c });

  const created = at(30, '09:00').toISOString();
  const rooms: Room[] = [
    { id: SENIOR_ROOM_ID, type: 'tachi', title: '타치', memberIds: [SENIOR_ID, TACHI_ID], createdBy: SENIOR_ID, createdAt: created },
    { id: FAMILY_ROOM_ID, type: 'family', title: '우리 가족', memberIds: [...SEED_FAMILY_ROOM_MEMBERS], createdBy: 'jieun', createdAt: created },
  ];
  const sessions = seedSessions();
  sessions.forEach(s => db.sessions.put(s));
  const msgs = seedMessages(sessions);
  for (const r of rooms) {
    const last = msgs.filter(x => x.roomId === r.id).at(-1);
    db.rooms.put({ ...r, lastMessageAt: last?.createdAt });
  }
  msgs.forEach(x => db.messages.insert(x));

  const memories = seedMemories();
  memories.forEach(x => db.memories.put(x));

  db.kv.set('privacy', { ...DEFAULT_PRIVACY });
  db.kv.set('health', seedHealth());
  const demo: DemoState = {
    botsEnabled: true, clockOffsetMinutes: 0,
    proactiveSchedule: PROACTIVE_SCHEDULE.map(p => ({ ...p })), lanUrls: ctx.lanUrls, scenarioStep: 0,
  };
  db.kv.set('demo', demo);

  try {
    for (const m of memories) await graph.upsertMemory(m);
    for (const [name, rel] of FAMILY_LINKS) await graph.linkFamily(name, rel, '김순자');
  } catch (e) {
    warn('graph seeding failed:', e);
  }
}

