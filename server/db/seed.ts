// Deterministic demo seed, all dates relative to "now". Used at first boot and by reset().
import {
  DEFAULT_LOCALE, DEFAULT_PRIVACY, FAMILY_ROOM_ID, SEED_FAMILY_ROOM_MEMBERS, SENIOR_ID,
  SENIOR_ROOM_ID, TACHI_ID, contactsFor, dateLabelL, dayHeaderLabel, pad2, proactiveScheduleFor, usersFor,
} from '../../shared/constants';
import type {
  DemoState, HealthSummary, Locale, Memory, Message, ReportPayload, Room, SessionLog,
} from '../../shared/types';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { ctx } from '../orchestrator/ctx';
import { warn, ymd } from '../util/misc';

/** Seed copy picker: `t(en, ko)` returns the string for the locale being seeded. */
type T = (en: string, ko: string) => string;
const dayLabel = (d: Date, l: Locale): string => (l === 'ko' ? dayHeaderLabel(d) : dateLabelL(d, 'en'));

function at(daysAgo: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
}

function seedHealth(t: T): HealthSummary {
  const sys = [126, 130, 124, 134, 128, 132, 127];
  const dia = [80, 84, 78, 86, 82, 85, 80];
  const sleep = [6.5, 7, 5.5, 6, 7.5, 6.5, 7];
  const steps = [4200, 3800, 5600, 2800, 4900, 4400, 3600];
  const good = t('Good', '좋음'); const okay = t('Okay', '보통');
  const mood = [good, good, okay, good, good, good, good];
  const dates = Array.from({ length: 7 }, (_, i) => ymd(at(6 - i, '12:00')));
  return {
    updatedAt: new Date().toISOString(),
    bloodPressure: dates.map((date, i) => ({ date, systolic: sys[i], diastolic: dia[i] })),
    medications: dates.flatMap((date, i) => [
      { date, name: t('Blood pressure pill', '혈압약'), time: '아침' as const, taken: i !== 3 },
      ...(i < 6 ? [{ date, name: t('Joint medicine', '관절약'), time: '저녁' as const, taken: true }] : []),
    ]),
    sleepHours: dates.map((date, i) => ({ date, hours: sleep[i] })),
    steps: dates.map((date, i) => ({ date, count: steps[i] })),
    mood: dates.map((date, i) => ({ date, label: mood[i] })),
    notes: [t('She said her knees felt cold (yesterday)', '무릎이 시리다고 하셨어요 (어제)')],
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

function seedMemories(t: T): Memory[] {
  const base = { ownerId: SENIOR_ID, status: 'saved' as const };
  const husband = t('Youngsu Park', '박영수');
  const rHusband = t('husband', '남편');
  const jieun = t('Jieun Kim', '김지은');
  const rDaughter = t('daughter', '딸');
  const minjun = t('Minjun Park', '박민준');
  const rSon = t('son', '아들');
  return [
    {
      ...base, id: 'mem-wedding-1976', title: t('Autumn 1976, wedding at Myeongdong Cathedral', '1976년 가을, 명동성당 결혼식'),
      story: t(
        'In autumn 1976, Youngsu and I were married at Myeongdong Cathedral. I wore a white wedding dress and carried a chrysanthemum bouquet, and my heart was pounding so hard. I can still see the autumn sunlight of that day.',
        '1976년 가을, 명동성당에서 영수 씨와 결혼식을 올렸다. 하얀 웨딩드레스에 국화 부케를 들었는데 가슴이 얼마나 두근거렸는지 모른다. 그날의 가을 햇살이 아직도 눈에 선하다.'),
      summary: t('A heart-fluttering autumn wedding with Youngsu at Myeongdong Cathedral.', '명동성당에서 영수 씨와 올린 설레는 가을 결혼식.'),
      year: 1976, era: t('1970s', '1970년대'), season: t('Autumn', '가을'), place: t('Myeongdong Cathedral, Seoul', '서울 명동성당'), placeId: 'seoul-myeongdong-cathedral',
      people: [{ name: husband, relation: rHusband }], event: t('Wedding', '결혼식'), emotions: [t('Excitement', '설렘'), t('Happiness', '행복')],
      tags: [t('wedding dress', '웨딩드레스'), t('chrysanthemum', '국화')],
      visibility: 'private', photoUrl: privateSeedPhoto(), createdAt: at(21, '10:20').toISOString(),
    },
    {
      ...base, id: 'mem-haeundae-1988', title: t('Summer 1988, family vacation at Haeundae Beach', '1988년 여름, 해운대 가족 피서'),
      story: t(
        'In summer 1988 the whole family went to Haeundae in Busan. The water was colder than we expected, so Jieun only dipped her feet, and Minjun cried for more watermelon until he fell asleep on his father\'s lap. I still miss the taste of watermelon under the beach umbrella.',
        '1988년 여름, 온 가족이 부산 해운대로 피서를 갔다. 바닷물이 생각보다 차가워서 지은이는 발만 담갔고, 민준이는 수박을 더 달라고 울다가 아빠 무릎에서 잠들었다. 튜브와 파라솔 아래에서 먹던 수박 맛이 지금도 그립다.'),
      summary: t('Cold waves, watermelon and the whole family together at Haeundae.', '차가운 바다와 수박, 온 가족이 함께한 해운대의 여름.'),
      year: 1988, era: t('1980s', '1980년대'), season: t('Summer', '여름'), place: t('Haeundae Beach, Busan', '부산 해운대'), placeId: 'busan-haeundae',
      people: [{ name: husband, relation: rHusband }, { name: jieun, relation: rDaughter }, { name: minjun, relation: rSon }],
      event: t('Family trip', '가족여행'), emotions: [t('Joy', '즐거움'), t('Nostalgia', '그리움')],
      tags: [t('inner tube', '튜브'), t('watermelon', '수박'), t('beach umbrella', '파라솔')],
      visibility: 'family', sharedAt: at(5, '16:30').toISOString(), photoUrl: '/demo-photos/haeundae-1988.jpg', createdAt: at(6, '15:00').toISOString(),
    },
    {
      ...base, id: 'mem-graduation-1999', title: t('Winter 1999, Jieun\'s college graduation', '1999년 겨울, 지은이 대학 졸업식'),
      story: t(
        'In winter 1999, Jieun\'s college graduation took place in Sinchon. She looked so grown up in her graduation cap. Her father and I handed her a bouquet and laughed together for a long time.',
        '1999년 겨울, 신촌에서 지은이의 대학 졸업식이 있었다. 학사모를 쓴 딸이 얼마나 대견하던지, 아빠와 함께 꽃다발을 안겨 주며 한참을 웃었다.'),
      summary: t('A proud winter day handing flowers to our daughter in her graduation cap.', '학사모를 쓴 딸에게 꽃다발을 안겨 준 뿌듯한 겨울날.'),
      year: 1999, era: t('1990s', '1990년대'), season: t('Winter', '겨울'), place: t('Sinchon, Seoul', '서울 신촌'), placeId: 'seoul-sinchon',
      people: [{ name: jieun, relation: rDaughter }, { name: husband, relation: rHusband }], event: t('Graduation', '졸업식'), emotions: [t('Pride', '뿌듯함')],
      tags: [t('bouquet', '꽃다발'), t('graduation cap', '학사모')], visibility: 'family', sharedAt: at(5, '16:35').toISOString(),
      photoUrl: '/demo-photos/graduation-1999.jpg', createdAt: at(6, '15:20').toISOString(),
    },
  ];
}

function familyLinks(t: T): [string, string][] {
  return [
    [t('Youngsu Park', '박영수'), t('husband', '남편')], [t('Jieun Kim', '김지은'), t('daughter', '딸')], [t('Minjun Park', '박민준'), t('son', '아들')],
    [t('Suyeon Lee', '이수연'), t('daughter-in-law', '며느리')], [t('Harin Park', '박하린'), t('granddaughter', '손녀')],
  ];
}

function seedSessions(t: T): SessionLog[] {
  const mk = (id: string, hhmm: string, kind: SessionLog['kind'], title: string, category: SessionLog['category'], summary: string): SessionLog => {
    const s = at(1, hhmm);
    return { id, startedAt: s.toISOString(), endedAt: new Date(s.getTime() + 4 * 60000).toISOString(), kind, title, category, summary, reported: true };
  };
  return [
    mk('sess-seed-morning', '09:01', 'proactive', t('Morning check-in', '아침 안부'), 'daily', t('Chatted over morning greetings about how she was feeling.', '아침 인사를 나누며 컨디션을 이야기하셨어요.')),
    mk('sess-seed-memory', '14:12', 'proactive', t('Haeundae photo story', '해운대 사진 이야기'), 'memory', t('Talked about the 1988 Haeundae family vacation photo.', '1988년 해운대 가족 피서 사진 이야기를 나누셨어요.')),
    mk('sess-seed-evening', '19:34', 'proactive', t('Evening check-in', '저녁 인사'), 'daily', t('Exchanged evening greetings.', '저녁 인사를 나누셨어요.')),
  ];
}

function seedMessages(sessions: SessionLog[], l: Locale, t: T): Message[] {
  const m = (id: string, roomId: string, senderId: string, text: string, when: Date, extra: Partial<Message> = {}): Message =>
    ({ id, roomId, senderId, kind: 'text', text, createdAt: when.toISOString(), ...extra });
  const yd = new Date(at(1, '12:00'));
  const report: ReportPayload = {
    type: 'report', dateLabel: dayLabel(yd, l), moodLabel: t('Good', '좋음'),
    highlight: t('Yesterday Mom happily talked about the 1988 Haeundae family vacation.', '어제는 해운대 가족 피서 이야기를 즐겁게 나누셨어요.'),
    sessions: sessions.map(s => {
      const priv = DEFAULT_PRIVACY[s.category] === 'private';
      const d = new Date(s.startedAt);
      return { time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, title: s.title, summary: priv ? t('A private conversation', '비공개 대화예요') : s.summary, category: s.category, isPrivate: priv };
    }),
  };
  return [
    m('seed-m1', SENIOR_ROOM_ID, TACHI_ID, t('Mom, have you had dinner? You worked hard today.', '어머님, 저녁 드셨어요? 오늘도 수고 많으셨어요.'), at(1, '19:34'),
      { meta: { proactive: true, sessionId: 'sess-seed-evening', category: 'daily' }, quickReplies: [t('Yes, I ate', '네, 먹었어요'), t('Not yet', '아직이에요')] }),
    m('seed-m2', SENIOR_ROOM_ID, SENIOR_ID, t('Yes, I did. You get some rest too.', '응, 먹었어. 너도 잘 쉬어'), at(1, '19:36')),
    m('seed-m3', SENIOR_ROOM_ID, TACHI_ID, t('Glad to hear it. I\'ll say hello again tomorrow morning. Sleep well.', '다행이에요. 내일 아침에 또 인사드릴게요. 편히 쉬세요.'), at(1, '19:36')),
    m('seed-m4', SENIOR_ROOM_ID, SENIOR_ID, t('Okay, thank you.', '그래, 고마워'), at(1, '19:37')),
    m('seed-f1', FAMILY_ROOM_ID, 'jieun', t('Mom got back from the hospital fine. Her blood pressure was good too.', '엄마 오늘 병원 잘 다녀오셨대요. 혈압도 괜찮으시대요.'), at(1, '18:20')),
    m('seed-f2', FAMILY_ROOM_ID, 'minjun', t('Good to hear. I\'ll come down this weekend.', '다행이다. 주말에 한번 내려갈게요.'), at(1, '18:24')),
    m('seed-f3', FAMILY_ROOM_ID, 'suyeon', t('I\'ll bring the side dishes Mom likes.', '어머님 좋아하시는 반찬 챙겨서 갈게요.'), at(1, '18:31')),
    m('seed-f4', FAMILY_ROOM_ID, 'jieun', t('Minjun, drive safe!', '민준아 운전 조심해서 와~'), at(1, '18:35')),
    m('seed-f5', FAMILY_ROOM_ID, 'minjun', t('ok', 'ㅇㅋ'), at(1, '18:36')),
    m('seed-f6', FAMILY_ROOM_ID, TACHI_ID,
      t(`I put together what Mom talked about on ${report.dateLabel}.`, `${report.dateLabel} 어머님과 나눈 이야기를 정리했어요.`), at(1, '21:00'), { kind: 'report', payload: report }),
  ];
}

export async function seed(locale: Locale = DEFAULT_LOCALE): Promise<void> {
  const { db, graph } = ctx;
  const l: Locale = locale === 'ko' ? 'ko' : 'en';
  const t: T = (en, ko) => (l === 'ko' ? ko : en);
  const users = usersFor(l);
  for (const u of users) db.users.put({ ...u, isBot: true });
  for (const c of contactsFor(l)) db.contacts.put({ ...c });

  const created = at(30, '09:00').toISOString();
  const rooms: Room[] = [
    { id: SENIOR_ROOM_ID, type: 'tachi', title: t('Tachi', '타치'), memberIds: [SENIOR_ID, TACHI_ID], createdBy: SENIOR_ID, createdAt: created },
    { id: FAMILY_ROOM_ID, type: 'family', title: t('Our Family', '우리 가족'), memberIds: [...SEED_FAMILY_ROOM_MEMBERS], createdBy: 'jieun', createdAt: created },
  ];
  const sessions = seedSessions(t);
  sessions.forEach(s => db.sessions.put(s));
  const msgs = seedMessages(sessions, l, t);
  for (const r of rooms) {
    const last = msgs.filter(x => x.roomId === r.id).at(-1);
    db.rooms.put({ ...r, lastMessageAt: last?.createdAt });
  }
  msgs.forEach(x => db.messages.insert(x));

  const memories = seedMemories(t);
  memories.forEach(x => db.memories.put(x));

  db.kv.set('locale', l);
  db.kv.set('privacy', { ...DEFAULT_PRIVACY });
  db.kv.set('health', seedHealth(t));
  const demo: DemoState = {
    botsEnabled: true, clockOffsetMinutes: 0,
    proactiveSchedule: proactiveScheduleFor(l).map(p => ({ ...p })), lanUrls: ctx.lanUrls, scenarioStep: 0, locale: l,
  };
  db.kv.set('demo', demo);

  try {
    for (const m of memories) await graph.upsertMemory(m);
    for (const [name, rel] of familyLinks(t)) await graph.linkFamily(name, rel, users[0].name);
  } catch (e) {
    warn('graph seeding failed:', e);
  }
}
