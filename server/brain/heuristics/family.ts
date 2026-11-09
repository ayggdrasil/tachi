// Offline family-room behaviours: Q&A, gathering drafts, artifact assist, bot replies.
import { PRIVACY_LABELS } from '../../../shared/constants';
import type { Artifact, HealthSummary, PrivacyCategory, User } from '../../../shared/types';
import type { BotContext, FamilyAnswer, FamilyContext, GatheringDraft, GatheringInput } from '../contract';
import { findPlaces, templateFor } from '../../data/places';
import { hasBatchim, hash, pick } from './ko';
import { memoryRef, seniorCall } from './compose';
import { assessBloodPressure } from './health';

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function fmtDate(s: string): string {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return `${d.getMonth() + 1}월 ${d.getDate()}일(${DOW[d.getDay()]})`;
}

export function questionCategory(q: string): PrivacyCategory | undefined {
  if (/혈압|복약|약\s|약은|약을|약도|건강|아프|병원|걸음|걷|수면|잠|운동|컨디션|식사|몸/.test(q)) return 'health';
  if (/기분|우울|감정|마음|웃|외로/.test(q)) return 'mood';
  // 일상 대화 only when asking about the content of conversations; general wellbeing ('요즘/오늘/어때') stays undefined.
  if (/무슨\s*(?:얘기|이야기|말)|대화|뭐라고\s*(?:하|말)|뭐\s*하셨|뭐하셨/.test(q)) return 'daily';
  if (/추억|기억|사진|옛날|옛이야기|이야기/.test(q)) return 'memory';
  if (/여행|나들이|경주|부산|계획|일정/.test(q)) return 'trip';
  return undefined;
}

export function healthFacts(h: HealthSummary) {
  const bp = h.bloodPressure;
  const latest = bp[bp.length - 1];
  const avgS = Math.round(avg(bp.map(b => b.systolic)));
  const avgD = Math.round(avg(bp.map(b => b.diastolic)));
  const byDate = new Map<string, boolean>();
  for (const m of h.medications) byDate.set(m.date, (byDate.get(m.date) ?? true) && m.taken);
  const totalDays = byDate.size;
  const takenDays = [...byDate.values()].filter(Boolean).length;
  const missed = [...byDate.entries()].filter(([, v]) => !v).map(([k]) => k);
  const sleep = avg(h.sleepHours.map(s => s.hours));
  const steps = Math.round(avg(h.steps.map(s => s.count)));
  return { latest, avgS, avgD, totalDays, takenDays, missed, sleep, steps };
}

const topic = (label: string): string => `${label}${hasBatchim(label) ? '은' : '는'}`;

export function answerFamily(question: string, ctx: FamilyContext): FamilyAnswer {
  const call = seniorCall(ctx.asker);
  const cat = questionCategory(question);
  if (cat && ctx.privateCategories.includes(cat)) {
    return {
      text: `${call}께서 ${topic(PRIVACY_LABELS[cat].label)} 비공개로 해 두셨어요. 궁금하시면 ${call}께 직접 여쭤봐 주세요.`,
      showHealthCard: false,
    };
  }
  const parts: string[] = [];
  let showHealthCard = false;
  const wantsAll = !cat;
  if ((cat === 'health' || wantsAll) && ctx.health) {
    const f = healthFacts(ctx.health);
    const onlySleep = /잠|수면/.test(question) && !/혈압|약/.test(question);
    const onlySteps = /걸음|걷|운동/.test(question) && !/혈압|약/.test(question);
    const onlyMeds = /약/.test(question) && !/혈압/.test(question);
    if (onlySleep) parts.push(`최근 7일 평균 수면은 ${f.sleep.toFixed(1)}시간이에요. ${f.sleep >= 6.5 ? '푹 주무시는 편이에요.' : '조금 부족한 편이라 낮에 잠깐 쉬시도록 챙겨 드릴게요.'}`);
    else if (onlySteps) parts.push(`최근 7일 하루 평균 ${f.steps.toLocaleString('ko-KR')}걸음 걸으셨어요. 산책을 꾸준히 하고 계세요.`);
    else if (onlyMeds) parts.push(`복약은 ${f.totalDays}일 중 ${f.takenDays}일 챙기셨어요.${f.missed.length ? ` ${f.missed.map(fmtDate).join(', ')}에 한 번 빠뜨리셨어요.` : ' 한 번도 빠뜨리지 않으셨어요.'}`);
    else {
      parts.push(`${call}께서는 최근 7일 평균 혈압이 ${f.avgS}/${f.avgD}이고, 가장 최근 기록은 ${f.latest.systolic}/${f.latest.diastolic}이에요.`);
      parts.push(`복약은 ${f.totalDays}일 중 ${f.takenDays}일 챙기셨고${f.missed.length ? `, ${f.missed.map(fmtDate).join(', ')}에는 빠뜨리셨어요` : ''}.`);
      const lv = f.latest ? assessBloodPressure(f.latest).level : 'invalid';
      if (lv === 'crisis' || lv === 'high') parts.unshift(`가장 최근 혈압 ${f.latest.systolic}/${f.latest.diastolic}은(는) ${lv === 'crisis' ? '매우 높은' : '높은'} 수치예요. 지금 바로 ${call}께 연락해 상태를 확인하시고, 필요하면 병원에 문의해 주세요.`);
      else if (lv === 'elevated' || f.avgS >= 140) parts.push('조금 높은 편이라 주치의와 상의해 보시면 좋겠어요.');
      else if (lv === 'invalid') parts.push('최근 혈압 기록은 다시 확인이 필요해요.');
      else parts.push(lv === 'low' ? '최근 혈압이 낮은 편이라 어지럽지 않으신지 살펴봐 주세요.' : '최근 7일 흐름은 큰 변동이 없어요.');
    }
    showHealthCard = cat === 'health';
  } else if (cat === 'health') {
    parts.push('아직 공유된 건강 기록이 없어요.');
  }
  if (cat === 'mood' || (wantsAll && ctx.moodToday)) {
    if (ctx.moodToday) parts.push(`오늘 ${call}의 기분은 '${ctx.moodToday}'이라고 하셨어요.`);
    else if (cat === 'mood') parts.push('오늘 기분 기록은 아직 없어요.');
  }
  if (cat === 'memory' || (wantsAll && !parts.length)) {
    const m = ctx.memories[0];
    if (m) parts.push(`최근 ${call}께서 들려주신 이야기는 "${m.title}"예요. ${m.summary}`);
    else if (cat === 'memory') parts.push('아직 공유된 추억 이야기가 없어요.');
  }
  if (cat === 'trip') {
    const t = ctx.trips[0];
    parts.push(t ? `${call}께서 "${t.title}" 여행을 살펴보고 계세요. 지금은 ${t.status === 'accepted' ? '가기로 하신' : '제안된'} 상태예요.` : '아직 진행 중인 여행 계획은 없어요.');
  }
  if (wantsAll && ctx.recentSessions.length && parts.length < 3) {
    const s = ctx.recentSessions[ctx.recentSessions.length - 1];
    const d = new Date(s.startedAt);
    parts.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}에 ${s.title}을 나눴어요. ${s.summary}`);
  }
  if (!parts.length) parts.push(`${call}께 관해 공유된 내용 안에서는 아직 말씀드릴 게 없어요. 직접 여쭤봐 주시면 좋겠어요.`);
  return { text: parts.join(' '), showHealthCard };
}

// ── gathering ──────────────────────────────────────────────────────────────
export function draftGathering(input: GatheringInput): GatheringDraft {
  const { proposalText, proposer, members, linkedMemory, linkedTrip } = input;
  const text = proposalText;
  const pl = findPlaces(text)[0];
  // A place named in the proposal wins; a linked trip/memory is used only when it agrees with it (or when none is named).
  const memRegion = linkedMemory?.place ? findPlaces(linkedMemory.place)[0]?.region : undefined;
  const tripOk = !!linkedTrip && (!pl || linkedTrip.destination === pl.region);
  const memOk = !!linkedMemory && (!pl || memRegion === pl.region);
  const lt = tripOk ? linkedTrip : undefined;
  const lm = memOk ? linkedMemory : undefined;
  const dest = pl?.region ?? lt?.destination ?? memRegion ?? '';
  const birthday = /생신|생일/.test(text) || !lt;
  const title = birthday ? `어머니 생신 · ${dest ? `${dest} 가족 여행` : '가족 모임'}` : `가족 모임 · ${dest || '나들이'}`;
  const bg: string[] = [`${proposer.name}님이 "${text.replace(/[!.]+$/, '')}"라고 제안해서 시작된 모임이에요.`];
  if (lm) bg.push(`어머님이 들려주신 "${lm.title}" 추억이 계기가 됐어요.`);
  if (lt) bg.push(`타치가 제안한 "${lt.title}" 일정을 바탕으로 준비해요.`);
  const place = pl ? `${pl.region} 일대` : lm?.place ? `${lm.place} 일대` : dest ? `${dest} 일대` : '장소 협의 중';
  const tpl = dest ? templateFor(dest) : undefined;
  const agenda = tpl
    ? [...tpl.days[0].stops.slice(1, 4).map(s => `첫째 날 · ${s.title}`), ...tpl.days[1].stops.slice(1, 3).map(s => `둘째 날 · ${s.title}`)]
    : ['모임 장소 도착과 인사', '가족 식사', '기념 사진 촬영', '어머님께 감사 인사'];
  const has = (id: string) => members.some(m => m.id === id);
  const tasks: GatheringDraft['tasks'] = [
    { text: 'KTX·차량 예약', ...(has('minjun') ? { assigneeId: 'minjun' } : {}) },
    { text: '숙소·식당 예약 (계단 적고 앉아서 먹는 곳)', ...(has('suyeon') ? { assigneeId: 'suyeon' } : {}) },
    { text: '생신 케이크·꽃 준비', ...(has('harin') ? { assigneeId: 'harin' } : has('jieun') ? { assigneeId: 'jieun' } : {}) },
    { text: '어머님 복약·컨디션 챙기기', ...(has('jieun') ? { assigneeId: 'jieun' } : {}) },
  ];
  return {
    title,
    background: bg.join(' '),
    purpose: '어머님 생신을 온 가족이 함께 축하하고, 예전 추억의 장소를 다시 걸으며 새 추억을 만들어요.',
    place,
    agenda,
    tasks,
    notes: '날짜는 타치가 구성원별로 가능한 시간을 물어 정해요. 어머님 무릎을 생각해 계단이 적은 코스로 준비해요.',
  };
}

const ASSIST_POOL: { key: RegExp; text: string; who: string }[] = [
  { key: /휠체어|동선|계단/, text: '휠체어 대여·계단 적은 동선 확인', who: 'minjun' },
  { key: /비상약|혈압약|약/, text: '어머님 혈압약·비상약 여분 챙기기', who: 'jieun' },
  { key: /사진|앨범|인화/, text: '옛 사진 인화해서 가져가기 (1984년 불국사 사진)', who: 'jieun' },
  { key: /촬영|단체/, text: '단체 사진·영상 촬영 담당', who: 'harin' },
  { key: /우천|비\s*오|날씨/, text: '날씨 확인과 우천 대비 계획', who: 'suyeon' },
  { key: /알레르기|메뉴|식단/, text: '식사 메뉴·음식 제한 확인', who: 'suyeon' },
];
export function assistArtifact(artifact: Artifact, members: User[]): { message: string; newTasks: { text: string; assigneeId?: string }[] } {
  const existing = artifact.tasks.map(t => t.text).join(' ') + ' ' + artifact.notes;
  const picks = ASSIST_POOL.filter(p => !p.key.test(existing)).slice(0, 3);
  const newTasks = picks.map(p => ({ text: p.text, ...(members.some(m => m.id === p.who) ? { assigneeId: p.who } : {}) }));
  return {
    message: newTasks.length ? `${artifact.title}에 빠지기 쉬운 준비 ${newTasks.length}가지를 제안했어요. 필요 없으면 지워 주세요.` : '이미 꼼꼼하게 준비하고 계세요. 더 필요한 게 생기면 말씀해 주세요.',
    newTasks,
  };
}

// ── bots ───────────────────────────────────────────────────────────────────
const CALL: Record<string, string> = { jieun: '엄마', minjun: '어머니', suyeon: '어머님', harin: '할머니' };

export function botReply(ctx: BotContext): string {
  const id = ctx.persona.id;
  const kind = ctx.trigger.kind;
  const seed = `${id}|${ctx.trigger.text}|${kind}`;
  const r = hash(seed) % 100;
  const call = CALL[id] ?? '어머님';
  const T = ctx.trigger.text;
  const sat = (arr: string[]) => pick(seed, arr);

  // Join greeting when a relative is invited into the room (system notice).
  if (kind === 'system' && /초대/.test(T)) {
    if (id === 'harin') return '할머니~ 저도 왔어요! 사진 보니까 너무 좋다ㅎㅎ';
    return `초대해 줘서 고마워요. ${call} 소식 여기서 볼게요.`;
  }

  const lines: Record<string, Partial<Record<string, string[]>>> = {
    jieun: {
      share_card: ['엄마 이 사진 처음 봐요… 그때 민준이 진짜 작았네요.', '엄마, 이 이야기 들으니까 아빠 생각나서 울컥했어요.', '엄마 이 사진 너무 좋다. 우리 다시 가요 꼭.'],
      memory_card: ['엄마, 이 사진 정말 귀하다. 고마워요.'],
      artifact: ['엄마 약이랑 컨디션은 제가 맡을게요.'],
      schedule_result: ['좋아요, 그날 봬요!', '그날로 확정이네요. 엄마 모시고 갈게요.'],
      schedule_candidate: ['후보 시간이네요. 정해지면 알려 주세요.'],
      schedule_progress: ['아직 답 안 한 사람들 얼른 답해줘요~'],
      report: ['타치 덕분에 안심돼요. 오늘도 엄마랑 얘기 많이 하셨네요.', '리포트 고마워요. 엄마가 잘 지내셔서 다행이에요.'],
      health_card: ['엄마, 오늘 컨디션은 어떠세요? 제가 한 번 전화드려 볼게요.', '약은 거르지 않게 제가 챙겨 여쭤볼게요.'],
      itinerary: ['일정 너무 좋다. 엄마 무릎 생각해서 짠 거 맞죠?'],
      trip_suggestion: ['경주 좋다! 엄마도 좋아하실 것 같아요.'],
      recall_card: ['엄마 그 사진 진짜 예쁘다.'],
      text: ['네, 알겠어요.', '엄마 오늘도 건강하세요~'],
    },
    minjun: {
      share_card: ['사진 좋네요. 저 어릴 때네요.', '이거 기억나요. 제가 도망갔죠 ㅎㅎ'],
      memory_card: ['좋은 사진이네요.'],
      artifact: ['KTX랑 차는 제가 알아볼게요.', '이동은 제가 맡을게요.'],
      schedule_result: ['알겠어요. 그날 비워둘게요.', '확인했어요.'],
      schedule_candidate: ['후보 시간이네요. 정해지면 알려 주세요.'],
      schedule_progress: ['저는 답했어요.'],
      report: ['확인했어요. 고마워요.'],
      health_card: ['기록 확인했어요. 필요하면 말씀하세요.'],
      itinerary: ['동선 괜찮네요.'],
      trip_suggestion: ['좋네요. 운전은 제가 할게요.'],
      text: ['네.', '알겠어요.'],
    },
    suyeon: {
      share_card: ['어머님, 사진 너무 좋아요. 저도 경주 다시 가고 싶어졌어요.', '어머님 이야기 들으니 마음이 따뜻해져요.'],
      memory_card: ['어머님, 귀한 사진이에요.'],
      artifact: ['숙소랑 식당은 제가 알아볼게요.', '식당은 앉아서 편한 곳으로 찾아볼게요.'],
      schedule_result: ['좋아요, 그날 뵐게요!', '확정됐네요. 준비 잘할게요.'],
      schedule_candidate: ['후보 시간이네요. 정해지면 알려 주세요.'],
      schedule_progress: ['저는 답했어요. 다들 확인해 주세요.'],
      report: ['어머님이 잘 지내시는 것 같아 마음이 놓여요.'],
      health_card: ['어머님 몸 잘 챙기시도록 저도 살필게요.'],
      itinerary: ['일정이 편안해 보여요. 어머님이 좋아하시겠어요.'],
      trip_suggestion: ['경주 좋아요. 어머님 추억의 장소네요.'],
      text: ['네, 알겠어요.', '어머님 오늘도 건강하세요.'],
    },
    harin: {
      share_card: ['할머니 완전 예쁘다ㅋㅋ', '할머니 이 사진 대박. 저도 같이 가고 싶어요ㅋㅋ', '할머니 최고ㅋㅋ 이야기 더 해주세요'],
      memory_card: ['할머니 사진 짱이에요ㅋㅋ'],
      artifact: ['케이크랑 꽃은 제가 맡을게요ㅋㅋ', '사진은 제가 찍어드릴게요ㅋㅋ'],
      schedule_result: ['그날 시간 비워둘게요ㅋㅋ', '좋아요 그날 봬요ㅋㅋ'],
      schedule_candidate: ['후보 시간이네요ㅋㅋ 정해지면 알려 주세요.'],
      schedule_progress: ['저 답했어요ㅋㅋ'],
      report: ['할머니 오늘도 수다 많이 하셨네요ㅋㅋ'],
      health_card: ['할머니 몸 잘 챙기세요ㅋㅋ'],
      itinerary: ['할머니랑 여행이라니 설레요ㅋㅋ'],
      trip_suggestion: ['오 경주! 가고 싶다ㅋㅋ'],
      text: ['할머니 사랑해요ㅋㅋ', '넵ㅋㅋ'],
    },
  };
  const table = lines[id];
  if (!table) {
    const gen: Record<string, string[]> = {
      share_card: [`${call}, 좋은 사진이네요.`], schedule_result: ['네, 확인했습니다.'], system: ['네, 반갑습니다.'], text: ['네, 알겠습니다.'],
    };
    return (gen[kind] ?? gen.text)[hash(seed) % (gen[kind] ?? gen.text).length];
  }
  // Sometimes stay silent for low-signal kinds
  if (['text', 'itinerary', 'recall_card', 'schedule_progress', 'trip_suggestion'].includes(kind) && r % 100 < 35) return '';
  if (['report', 'health_card'].includes(kind) && r < 25) return '';
  if (kind === 'text' && /타치|모임|시간/.test(T) && r < 50) return '';
  const healthText = kind === 'text' && /혈압|건강|약\s*(?:먹|드|챙)|컨디션/.test(T);
  const k = kind === 'schedule_result' && !(/확정/.test(T) && !/후보|미확정|확정되지|확정 전/.test(T)) ? 'schedule_candidate' : healthText ? 'health_card' : kind;
  const arr = table[k] ?? table.text ?? [];
  return arr.length ? sat(arr) : '';
}

/** Reassuring/evaluative wording is banned in bot replies about health. */
export const BANNED_HEALTH_WORDS = /건강하(?:시|셔|세)|안심|안정적|괜찮아서|다행|문제\s*없|좋은\s*수치/;
