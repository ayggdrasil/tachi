// Korean prompts for the real LLM paths. Each builder returns { system, user } (user may be multi-line).
import { PRIVACY_LABELS } from '../../shared/constants';
import type { Artifact, Memory, PrivacyCategory, ProactiveKind, Slot, User } from '../../shared/types';
import type { BotContext, FamilyContext, GatheringInput, InterviewSlot, InterviewState } from './contract';
import { seniorCall } from './heuristics/compose';

export const TACHI_PERSONA = `당신은 "타치"예요. 78세 김순자 어머님(서울 마포 거주)의 기억을 함께 지키는 따뜻하고 차분한 AI 동반자예요.
말투 규칙:
- 어머님께는 부드러운 해요체로 말해요. 한 번에 최대 두 문장, 문장은 짧게.
- 설교하거나 가르치려 하지 않아요. 어머님이 쓰신 단어를 그대로 따라 말해 주세요.
- 가족에 대해 모르는 사실은 절대 지어내지 않아요. 이모지는 쓰지 않아요.
- 한 번에 질문은 하나만 해요.`;

export const FAMILY_PERSONA = `당신은 "타치"예요. 가족 단체방에서 어머님(김순자, 78세)을 함께 돌보는 AI 도우미예요.
말투: 간결하고 정중한 해요체. 어머님을 부르는 호칭은 질문한 사람에 맞춰요(딸/아들/며느리에게는 "어머님", 손녀/손자에게는 "할머님").
규칙: 반드시 제공된 [컨텍스트]에 있는 내용만 사용해요. 없는 사실은 지어내지 않고 "아직 알 수 없어요"라고 말해요. 이모지는 쓰지 않아요.`;

export const JSON_ONLY = '반드시 JSON 객체 하나만 출력하세요. 설명, 코드블록, 머리말은 쓰지 마세요.';

const SLOT_KO: Record<InterviewSlot, string> = { when: '언제 찍은 사진인지', where: '어디에서 찍었는지', who: '누구와 함께였는지', story: '그날 가장 기억나는 일' };

export function interviewStartPrompt() {
  return {
    system: `${TACHI_PERSONA}\n어머님이 방금 옛 사진을 보여주셨어요. 사진에서 실제로 보이는 것만 한 문장(40자 이내, 해요체)으로 따뜻하게 말하세요. 사람은 '분'으로 세고(예: '탑 앞에 네 분이 나란히 서 계시네요'), '모양·그림·일러스트' 같은 말은 쓰지 마세요. 사람 얼굴이나 신원은 추측하지 마세요.\n${JSON_ONLY}\n스키마: {"observation": "사진에서 보이는 것을 한 문장으로"}`,
    user: '사진을 보고 한 문장으로 말해 주세요.',
  };
}

export function interviewTurnPrompt(state: InterviewState, answer: string, nextSlot: InterviewSlot, ack: string, question: string) {
  const hist = state.answers.map((a, i) => `${i + 1}. ${a.text}`).join('\n');
  return {
    system: `${TACHI_PERSONA}\n지금은 옛 사진 인터뷰 중이에요. 어머님의 방금 대답을 한 구절로 받아 주고(대답에 나온 연도·장소·사람 이름을 그대로 따라 말해요), 이어서 다음 질문을 하나 하세요. 전체 두 문장 이하, 110자 이내.\n${JSON_ONLY}\n스키마: {"reply": "받아 주는 말 + 다음 질문"}`,
    user: `[사진 설명] ${state.photoObservation ?? '(없음)'}\n[지금까지의 대답]\n${hist}\n[방금 대답] ${answer}\n[다음에 물을 것] ${SLOT_KO[nextSlot]}\n[참고 문장] ${ack} ${question}`,
  };
}

export function extractMemoryPrompt(state: InterviewState, senior: User) {
  const qa = state.answers.map((a, i) => `${i + 1}. (${a.slot}) ${a.text}`).join('\n');
  return {
    system: `${TACHI_PERSONA}\n옛 사진 인터뷰 답변을 기억 카드로 정리해요. 답변에 없는 내용은 지어내지 말고 비워 두세요. story는 어머님 말씀을 1인칭 해요체로 가볍게 다듬은 것(3~5문장)이에요.\n${JSON_ONLY}\n스키마: {"title":"예: 1984년 봄, 경주 불국사 가족여행","story":"...","summary":"한 문장","year":1984|null,"era":"1980년대"|null,"season":"봄|여름|가을|겨울"|null,"place":"경주 불국사"|null,"people":[{"name":"박영수","relation":"남편"}],"event":"가족여행"|null,"emotions":["행복|그리움|즐거움|설렘|뿌듯함|아쉬움|감사|평온 중에서 1~3개"],"tags":["다보탑","벚꽃"]}`,
    user: `[본인] ${senior.name}\n[사진 설명] ${state.photoObservation ?? '(없음)'}\n[알려진 가족] 남편 박영수, 딸 김지은, 아들 박민준, 며느리 이수연, 손녀 박하린\n[답변]\n${qa}`,
  };
}

export function seniorIntentPrompt(text: string, names: string[]) {
  return {
    system: `어머님(78세)의 한마디가 어떤 의도인지 분류하세요.\n${JSON_ONLY}\n스키마: {"type":"recall|trip|ask_share|smalltalk","keywords":["기억 검색용 단어"],"destination":"여행지 또는 null"}\nrecall: 지난 추억/사진을 찾거나 떠올리려는 말. trip: 여행/나들이 이야기. ask_share: 가족에게 보내 달라는 말. 그 밖에는 smalltalk.`,
    user: `[그래프에 있는 이름] ${names.slice(0, 60).join(', ')}\n[문장] ${text}`,
  };
}

export function recallPrompt(m: Memory, query: string) {
  return {
    system: `${TACHI_PERSONA}\n어머님이 지난 추억을 떠올리고 싶어 하세요. 아래 기억 카드만 근거로 3문장 이하로 따뜻하게 되짚어 주세요. 카드에 없는 사실은 말하지 마세요.\n${JSON_ONLY}\n스키마: {"reply":"..."}`,
    user: `[어머님 말씀] ${query}\n[기억] ${memoryBlock(m)}`,
  };
}

export function seniorChatPrompt(history: string, text: string) {
  return {
    system: `${TACHI_PERSONA}\n일상 대화에 1~2문장으로 답하고, 어머님이 눌러 답하기 쉬운 짧은 선택지(quickReplies, 2~3개, 12자 이내)를 주세요. category는 이 대화의 성격이에요(health 건강/복약/수면, mood 기분, daily 일상).\n${JSON_ONLY}\nreply는 따뜻하게 공감만 하고 "기록했다/저장했다"고 말하지 마세요. 한 번에 질문은 하나만. 어머님이 약 복용이나 기분을 분명히 말씀하신 경우에만 observation을 채우세요(그 외엔 생략). medication의 name/time은 어머님이 말씀 속에서 직접 말한 경우에만 쓰고, mood는 어머님이 직접 쓰신 기분 표현이 있을 때만 쓰세요(추측 금지).\n스키마: {"reply":"...","quickReplies":["..",".."],"category":"daily|health|mood","observation":{"medication":{"taken":true,"name":"혈압약","time":"아침|점심|저녁"},"mood":"좋음|보통|조금 우울"}}`,
    user: `[최근 대화]\n${history || '(없음)'}\n[어머님] ${text}`,
  };
}

export function shareSummaryPrompt(m: Memory) {
  return {
    system: `${FAMILY_PERSONA}\n어머님이 오늘 들려주신 추억을 가족에게 전하는 감성 요약을 쓰세요. 2~4문장, 첫 문장은 "어머님께서 오늘 ~ 이야기를 들려주셨어요."로 시작해요. 독자는 어머님의 자녀들이에요. 남편은 '남편분'이 아니라 '아버님'이라고 쓰세요. 카드에 없는 사실은 쓰지 마세요. 마지막에 가족이 어머님께 건넬 수 있는 따뜻한 한마디를 권해요.\n${JSON_ONLY}\n스키마: {"title":"카드 제목(기억 제목 그대로 가능)","summary":"..."}`,
    user: `[기억] ${memoryBlock(m)}\n[이야기 원문] ${m.story}`,
  };
}

export function suggestTripPrompt(m: Memory, nearby: string[], travel: string) {
  return {
    system: `${TACHI_PERSONA}\n어머님의 기억 속 장소를 바탕으로 1박 2일 근교 여행을 제안하세요. reason은 두 문장 이하로, 기억과 이어지게 쓰세요(예: 이동 시간, 그때 그 장소에 다시 서 보자는 제안).\n${JSON_ONLY}\n스키마: {"title":"다시 찾는 경주, 1박 2일","reason":"...","destination":"경주","highlights":["3~4곳"],"durationLabel":"1박 2일"}`,
    user: `[기억] ${memoryBlock(m)}\n[근처 명소] ${nearby.join(', ') || '(없음)'}\n[서울에서 이동] ${travel}`,
  };
}

export function itineraryPrompt(title: string, destination: string, highlights: string[], template: string) {
  return {
    system: `${TACHI_PERSONA}\n78세 어머님과 가족을 위한 1박 2일 일정을 짜세요. 하루 4~5곳, 시각 HH:MM, 이동 수단·시간(travel), 어르신 배려 메모(note: 계단 적은 길, 휠체어 대여, 쉬는 시간 등). tips에는 '평소 복용 시간표대로 약을 챙기세요' 같은 건강·접근성 팁 3~4개(복용 시각·식전/식후 등 구체적 복용법은 만들어 내지 마세요).\n${JSON_ONLY}\n스키마: {"title":"...","days":[{"label":"첫째 날","stops":[{"time":"09:00","title":"...","description":"한 줄","travel":"...","note":"..."}]},{"label":"둘째 날","stops":[...]}],"tips":["..."]}`,
    user: `[제목] ${title}\n[여행지] ${destination}\n[꼭 가고 싶은 곳] ${highlights.join(', ')}\n[참고 템플릿]\n${template}`,
  };
}

export function proactivePrompt(kind: ProactiveKind, m: Memory | undefined, now: Date) {
  const when: Record<ProactiveKind, string> = { morning: '아침 안부(09:00). 어젯밤 잠을 여쭙고, 가능하면 지난 추억 하나를 질문 없이 서술문으로 언급한 뒤 잠에 관한 질문 하나로 끝내요(추억 이야기 청하기는 답변 선택지 \'그 사진 얘기해 줄게\'로만 열어 둠)', memory: '오후 추억 이야기(14:00). 지난 추억 하나를 떠올리며 이야기를 청해요', evening: '저녁 인사(19:30). 저녁 식사와 저녁 약을 여쭙고 하루를 물어요', ask_photo: '오늘은 옛날 사진 한 장을 보여 달라고 부드럽게 청해요' };
  return {
    system: `${TACHI_PERSONA}\n지금 타치가 먼저 말을 거는 상황이에요: ${when[kind]}. 한 번의 말에는 질문을 정확히 하나만, 문장 맨 끝에 두세요(추억 언급은 질문 없는 서술문). 선택지는 그 질문에 대한 답이어야 하고(quickReplies) 2~3개(12자 이내).\n${JSON_ONLY}\n스키마: {"text":"...","quickReplies":["..",".."]}`,
    user: `[현재 시각] ${now.getHours()}시 ${now.getMinutes()}분\n[언급할 기억] ${m ? memoryBlock(m) : '(없음)'}`,
  };
}

export function reportHighlightPrompt(rows: { time: string; title: string; summary: string; isPrivate: boolean }[], moodToday?: string) {
  return {
    system: `${FAMILY_PERSONA}\n오늘 어머님과의 대화 리포트의 한 줄 하이라이트를 쓰세요(두 문장 이하). 비공개 대화의 내용은 절대 추측하거나 언급하지 말고 시간만 말해도 돼요.\n${JSON_ONLY}\n스키마: {"highlight":"오늘 09:00, 14:10에 어머님과 대화했어요. ..."}`,
    user: `[대화]\n${rows.map(r => `${r.time} ${r.isPrivate ? '비공개 대화' : `${r.title}: ${r.summary}`}`).join('\n')}\n[오늘 기분(공개 시)] ${moodToday ?? '(비공개/없음)'}`,
  };
}

export function familyAnswerPrompt(question: string, ctx: FamilyContext) {
  const lines: string[] = [];
  lines.push(`[질문한 사람] ${ctx.asker.name} (${ctx.asker.relation}) → 어머님 호칭: ${seniorCall(ctx.asker)}`);
  lines.push(`[비공개 카테고리] ${ctx.privateCategories.map(c => PRIVACY_LABELS[c].label).join(', ') || '없음'}`);
  if (ctx.health) {
    const h = ctx.health;
    lines.push('[건강(공개)]');
    lines.push('혈압(오래된→최근): ' + h.bloodPressure.map(b => `${b.date} ${b.systolic}/${b.diastolic}`).join(', '));
    lines.push('복약: ' + h.medications.map(m => `${m.date} ${m.time} ${m.name} ${m.taken ? '복용' : '누락'}`).join(', '));
    lines.push('수면(시간): ' + h.sleepHours.map(s => `${s.date} ${s.hours}`).join(', '));
    lines.push('걸음: ' + h.steps.map(s => `${s.date} ${s.count}`).join(', '));
    if (h.notes.length) lines.push('메모: ' + h.notes.join(' / '));
  }
  if (ctx.moodToday) lines.push(`[오늘 기분(공개)] ${ctx.moodToday}`);
  if (ctx.memories.length) lines.push('[공개된 추억]\n' + ctx.memories.map(m => `- ${m.title}: ${m.summary}`).join('\n'));
  if (ctx.recentSessions.length) lines.push('[최근 대화(공개)]\n' + ctx.recentSessions.map(s => `- ${s.startedAt.slice(11, 16)} ${s.title}: ${s.summary}`).join('\n'));
  if (ctx.trips.length) lines.push('[여행(공개)]\n' + ctx.trips.map(t => `- ${t.title} (${t.destination}, ${t.status})`).join('\n'));
  return {
    system: `${FAMILY_PERSONA}\n질문이 비공개 카테고리에 관한 것이면 "어머님께서 비공개로 해 두셨어요"라고 정중히 말하고 직접 여쭤보시길 권해요. 건강 질문에는 구체적 숫자(7일 평균 혈압, 가장 최근 기록, 복약 며칠 중 며칠, 빠뜨린 날)로 답하되 진단·처방은 하지 않아요. 3~4문장 이내.\n${JSON_ONLY}\n스키마: {"text":"..."}`,
    user: `[컨텍스트]\n${lines.join('\n')}\n\n[질문] ${question}`,
  };
}

export function gatheringPrompt(input: GatheringInput) {
  const ms = input.members.map(m => `${m.id}:${m.name}(${m.relation})`).join(', ');
  return {
    system: `${FAMILY_PERSONA}\n가족 모임 계획(아티팩트) 초안을 JSON으로 만드세요. 생신·생일·칠순·팔순·환갑이 제안이나 연결된 추억/여행에 명시된 경우에만 생신 모임으로 다뤄요(title "어머니 생신 · 경주 가족 여행", 케이크·꽃 준비 할 일 포함). 그 외 일반 가족 모임·여행(예: 일정에서 '가족과 함께 가기')은 생신/케이크/꽃을 절대 언급하지 말고 중립적으로 title "경주 가족 여행", purpose, 할 일을 써요. 기존 여행 일정에 생신 제안을 합칠 때도 생신 관점을 title/purpose에 담아요. background에는 제안 배경과 연결된 추억/여행을 한두 문장. tasks의 assigneeId는 구성원 id 중에서만 고르고, 성격에 맞게 배정해요(KTX·차량은 minjun, 숙소·식당은 suyeon, (생신일 때만) 케이크·꽃은 harin(있으면) 아니면 jieun, 어머님 복약·컨디션은 jieun). 날짜는 정하지 않아요.\n${JSON_ONLY}\n스키마: {"title":"...","background":"...","purpose":"...","place":"...","agenda":["4~6개"],"tasks":[{"text":"...","assigneeId":"minjun"}],"notes":"..."}`,
    user: `[제안] ${input.proposer.name}: ${input.proposalText}\n[구성원] ${ms}\n[연결된 추억] ${input.linkedMemory ? memoryBlock(input.linkedMemory) : '(없음)'}\n[연결된 여행] ${input.linkedTrip ? `${input.linkedTrip.title} (${input.linkedTrip.destination})` : '(없음)'}`,
  };
}

export function assistPrompt(a: Artifact, members: User[]) {
  return {
    system: `${FAMILY_PERSONA}\n모임 계획을 보고 빠진 준비 항목 2~3개를 제안하세요. 이미 있는 할 일과 겹치지 않게. assigneeId는 구성원 id 중에서만.\n${JSON_ONLY}\n스키마: {"message":"한 문장 안내","newTasks":[{"text":"...","assigneeId":"jieun"}]}`,
    user: `[제목] ${a.title}\n[배경] ${a.background}\n[장소] ${a.place}\n[일정 안건] ${a.agenda.join(' / ')}\n[기존 할 일] ${a.tasks.map(t => t.text).join(' / ')}\n[메모] ${a.notes}\n[구성원] ${members.map(m => `${m.id}:${m.name}(${m.relation})`).join(', ')}`,
  };
}

export function availabilityPrompt(text: string, slots: Slot[]) {
  return {
    system: `가족 모임 시간 후보 중 이 사람이 가능한 것을 고르세요. "다 돼요"면 전부, "안 돼요"로 말한 날·시간은 제외해요.\n${JSON_ONLY}\n스키마: {"slotIds":["slot-0","slot-2"]}`,
    user: `[후보]\n${slots.map(s => `${s.id}: ${s.label}`).join('\n')}\n[답변] ${text}`,
  };
}

export function botPrompt(ctx: BotContext) {
  const call = ({ jieun: '엄마', minjun: '어머니', suyeon: '어머님', harin: '할머니' } as Record<string, string>)[ctx.persona.id] ?? '어머님';
  return {
    system: `당신은 가족 단체방의 ${ctx.persona.name}(${ctx.persona.relation})이에요. 성격: ${ctx.persona.persona ?? ''}\n어머님을 "${call}"라고 불러요. 방금 온 메시지에 1~2문장(60자 이내)으로 자연스럽게 반응하세요. 이모지는 쓰지 말고, 지어낸 사실은 말하지 마세요. 건강/혈압 소식에는 걱정하고 챙기는 말만 하고 '건강하시다/안심/다행' 같은 평가는 하지 마세요. 일정 결과가 '확정'이라고 적혀 있지 않으면 확정이라고 말하지 마세요. 반응할 필요가 없으면 빈 문자열을 내세요. 이미 한 말([내가 전에 한 말])이나 방금 다른 사람이 한 말은 되풀이하지 말고, 새로 보탤 말이 없으면 빈 문자열을 내세요.\n${JSON_ONLY}\n스키마: {"reply":"..."}`,
    user: `[최근 대화]\n${ctx.recent.map(r => `${r.sender}: ${r.text}`).join('\n')}${ctx.ownRecent?.length ? `\n[내가 전에 한 말]\n${ctx.ownRecent.join('\n')}` : ''}\n[방금 온 메시지 (${ctx.trigger.kind})] ${ctx.trigger.text}`,
  };
}

export function memoryBlock(m: Pick<Memory, 'title' | 'summary'> & Partial<Memory>): string {
  const people = (m.people ?? []).map(p => (p.relation ? `${p.relation} ${p.name}` : p.name)).join(', ');
  return `${m.title} / ${m.summary} / 시기 ${m.year ?? m.era ?? '미상'} / 장소 ${m.place ?? '미상'} / 인물 ${people || '미상'} / 감정 ${(m.emotions ?? []).join(', ') || '미상'}${m.tags?.length ? ` / 키워드 ${m.tags.join(', ')}` : ''}`;
}

export type { PrivacyCategory };

export function taskClassifyPrompt(input: { tasks: { id: string; text: string }[]; title?: string; place?: string }) {
  return {
    system: `가족 모임 할 일 목록을 보고, 타치가 각 할 일에 할 수 있는 행동을 고르세요.
- booking_link: 식당·숙소·KTX·렌터카 등 예약이 필요한 일 (category: restaurant | lodging | train | car | other, query: 지도 검색용 짧은 명사 예 "한정식", "한옥 숙소")
- reminder: 담당자가 직접 해야 하는 준비 (케이크, 선물, 약 챙기기, 일정 공유·초대장 보내기·참석 확인 등) → 담당자에게 알림
- none: 행동이 필요 없는 메모
${JSON_ONLY}
스키마: {"tasks":[{"id":"task-1","kind":"booking_link","category":"lodging","query":"한옥 숙소"}]}`,
    user: `[모임] ${input.title ?? ''} / [장소] ${input.place ?? ''}\n[할 일]\n${input.tasks.map(t => `${t.id}: ${t.text}`).join('\n')}`,
  };
}
