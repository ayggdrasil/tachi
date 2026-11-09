// Korean places gazetteer + itinerary templates (demo-grade, hand-curated).
export type PlaceKind = 'temple' | 'heritage' | 'nature' | 'beach' | 'market' | 'city' | 'food' | 'museum' | 'park' | 'village';

export interface Place {
  id: string;
  name: string;
  aliases: string[];
  region: string;            // '경주'
  lat: number;
  lng: number;
  kind: PlaceKind;
  seniorNote: string;        // senior-friendly note
  nearby: string[];          // place ids
  travelFromSeoul: string;   // 'KTX 2시간 + 택시 20분'
}

const P = (id: string, name: string, region: string, lat: number, lng: number, kind: PlaceKind, travelFromSeoul: string,
  seniorNote: string, nearby: string[], aliases: string[] = []): Place =>
  ({ id, name, aliases, region, lat, lng, kind, seniorNote, nearby, travelFromSeoul });

const KTX_GJ = 'KTX 신경주역까지 약 2시간 + 택시 25분';
const KTX_BS = 'KTX 부산역까지 약 2시간 40분';

export const PLACES: Place[] = [
  // 경주
  P('gyeongju-bulguksa', '불국사', '경주', 35.7898, 129.3320, 'temple', KTX_GJ, '다보탑·석가탑 앞은 평지라 걷기 편해요. 대웅전 쪽 계단은 천천히 오르세요.', ['gyeongju-seokguram', 'gyeongju-bomun', 'gyeongju-donggung'], ['불국사 절']),
  P('gyeongju-seokguram', '석굴암', '경주', 35.7949, 129.3492, 'temple', KTX_GJ, '셔틀버스로 올라갈 수 있고 마지막 길만 완만하게 걸어요.', ['gyeongju-bulguksa']),
  P('gyeongju-cheomseongdae', '첨성대', '경주', 35.8347, 129.2190, 'heritage', KTX_GJ, '평지 산책로라 휠체어도 편해요.', ['gyeongju-daereungwon', 'gyeongju-hwangridan', 'gyeongju-donggung']),
  P('gyeongju-daereungwon', '대릉원', '경주', 35.8386, 129.2118, 'heritage', KTX_GJ, '길이 평평하고 벤치가 많아요.', ['gyeongju-cheomseongdae', 'gyeongju-hwangridan'], ['천마총']),
  P('gyeongju-bomun', '보문호수', '경주', 35.8412, 129.2833, 'nature', KTX_GJ, '호수 둘레길이 평평해서 천천히 걷기 좋아요.', ['gyeongju-bulguksa'], ['보문단지', '보문']),
  P('gyeongju-donggung', '동궁과 월지', '경주', 35.8344, 129.2267, 'heritage', KTX_GJ, '저녁 야경이 아름다워요. 길이 평탄해요.', ['gyeongju-cheomseongdae', 'gyeongju-daereungwon'], ['안압지', '월지', '동궁']),
  P('gyeongju-hwangridan', '황리단길', '경주', 35.8365, 129.2108, 'food', KTX_GJ, '골목 구경과 쉬어 갈 찻집이 많아요.', ['gyeongju-daereungwon', 'gyeongju-cheomseongdae'], ['황남동']),
  P('gyeongju', '경주', '경주', 35.8562, 129.2247, 'city', KTX_GJ, '천년 고도, 평지 위주라 어르신 여행에 좋아요.', ['gyeongju-bulguksa', 'gyeongju-cheomseongdae', 'gyeongju-daereungwon', 'gyeongju-bomun'], ['신라']),
  // 부산
  P('busan-haeundae', '해운대', '부산', 35.1587, 129.1604, 'beach', KTX_BS, '모래사장 옆 산책로가 평탄해요. 한낮 햇볕은 피하세요.', ['busan-dongbaek', 'busan-gwangalli'], ['해운대 해수욕장', '해운대 바다']),
  P('busan-dongbaek', '동백섬', '부산', 35.1560, 129.1522, 'nature', KTX_BS, '둘레길이 완만하고 바다 구경이 좋아요.', ['busan-haeundae']),
  P('busan-gwangalli', '광안리', '부산', 35.1532, 129.1186, 'beach', KTX_BS, '해변 길이 평평하고 카페가 많아요.', ['busan-haeundae'], ['광안대교']),
  P('busan-jagalchi', '자갈치시장', '부산', 35.0966, 129.0306, 'market', KTX_BS, '실내 시장이라 비 와도 좋지만 바닥이 미끄러울 수 있어요.', ['busan-gamcheon', 'busan-taejongdae'], ['자갈치']),
  P('busan-gamcheon', '감천문화마을', '부산', 35.0975, 129.0106, 'village', KTX_BS, '언덕이 가팔라요. 마을버스를 이용하세요.', ['busan-jagalchi']),
  P('busan-taejongdae', '태종대', '부산', 35.0511, 129.0870, 'nature', KTX_BS, '순환 열차(다누비)로 편하게 돌 수 있어요.', ['busan-jagalchi']),
  P('busan', '부산', '부산', 35.1796, 129.0756, 'city', KTX_BS, '바다 구경과 해산물이 좋은 도시예요.', ['busan-haeundae', 'busan-gwangalli', 'busan-jagalchi'], ['부산 바닷가']),
  // 서울
  P('seoul-myeongdong-cathedral', '명동성당', '서울', 37.5636, 126.9872, 'heritage', '지하철 2호선 + 4호선 약 30분', '입구 경사가 약간 있지만 성당 안은 조용히 쉬기 좋아요.', ['seoul-namsan', 'seoul-deoksugung'], ['명동']),
  P('seoul-sinchon', '신촌', '서울', 37.5551, 126.9368, 'city', '지하철 2호선 신촌역', '대학가라 사람이 많아요. 카페에서 쉬어 가세요.', ['seoul-hangang'], ['신촌역', '이대']),
  P('seoul-namsan', '남산', '서울', 37.5512, 126.9882, 'nature', '지하철 + 케이블카 약 40분', '케이블카로 오르면 무릎이 편해요.', ['seoul-myeongdong-cathedral'], ['남산타워', '서울타워']),
  P('seoul-deoksugung', '덕수궁', '서울', 37.5658, 126.9751, 'heritage', '지하철 1호선 시청역', '돌담길 산책이 평탄해요.', ['seoul-myeongdong-cathedral', 'seoul-gyeongbokgung']),
  P('seoul-gyeongbokgung', '경복궁', '서울', 37.5796, 126.9770, 'heritage', '지하철 3호선 경복궁역', '궁 안이 넓어요. 중간중간 쉬어 가세요.', ['seoul-changgyeonggung', 'seoul-deoksugung']),
  P('seoul-changgyeonggung', '창경궁', '서울', 37.5788, 126.9950, 'heritage', '지하철 4호선 혜화역 + 버스', '고즈넉한 산책이 좋아요.', ['seoul-gyeongbokgung']),
  P('seoul-hangang', '한강공원', '서울', 37.5283, 126.9326, 'park', '지하철 + 도보', '강변 산책로가 평평하고 벤치가 많아요.', ['seoul-sinchon'], ['한강', '여의도']),
  P('seoul', '서울', '서울', 37.5665, 126.9780, 'city', '-', '', ['seoul-sinchon', 'seoul-myeongdong-cathedral']),
  // 제주
  P('jeju-seongsan', '성산일출봉', '제주', 33.4581, 126.9426, 'nature', '비행기 1시간 + 렌터카 1시간', '정상까지 계단이 많아요. 아래에서 바라보는 것만으로도 좋아요.', ['jeju-seopjikoji', 'jeju-udo'], ['일출봉']),
  P('jeju-seopjikoji', '섭지코지', '제주', 33.4244, 126.9306, 'nature', '비행기 1시간 + 렌터카 1시간', '해안 산책로가 완만해요.', ['jeju-seongsan']),
  P('jeju-udo', '우도', '제주', 33.5000, 126.9500, 'nature', '비행기 1시간 + 렌터카 + 배 15분', '배를 타야 해서 날씨를 꼭 확인하세요.', ['jeju-seongsan']),
  P('jeju-hallasan', '한라산', '제주', 33.3617, 126.5292, 'nature', '비행기 1시간 + 렌터카 1시간', '정상 등반은 힘들어요. 영실 휴게소 근처 산책을 권해요.', []),
  P('jeju', '제주', '제주', 33.4996, 126.5312, 'city', '비행기 1시간', '렌터카가 있으면 편해요.', ['jeju-seongsan', 'jeju-seopjikoji'], ['제주도']),
  // 강릉·속초
  P('gangneung-gyeongpo', '경포대', '강릉', 37.7956, 128.8967, 'nature', 'KTX 강릉역 약 2시간', '호수 둘레길이 평탄해요.', ['gangneung-anmok', 'gangneung-ojukheon'], ['경포호', '경포해변']),
  P('gangneung-anmok', '안목해변', '강릉', 37.7727, 128.9475, 'beach', 'KTX 강릉역 약 2시간', '커피거리가 있어 쉬어 가기 좋아요.', ['gangneung-gyeongpo'], ['커피거리']),
  P('gangneung-ojukheon', '오죽헌', '강릉', 37.7792, 128.8791, 'heritage', 'KTX 강릉역 약 2시간', '길이 평탄해요.', ['gangneung-gyeongpo']),
  P('gangneung', '강릉', '강릉', 37.7519, 128.8761, 'city', 'KTX 강릉역 약 2시간', '바다와 커피로 유명해요.', ['gangneung-gyeongpo', 'gangneung-anmok']),
  P('sokcho-seorak', '설악산', '속초', 38.1195, 128.4656, 'nature', '고속버스 약 2시간 30분', '권금성은 케이블카로 오를 수 있어요.', ['sokcho'], ['신흥사', '권금성']),
  P('sokcho', '속초', '속초', 38.2070, 128.5918, 'city', '고속버스 약 2시간 30분', '바다와 시장 구경이 좋아요.', ['sokcho-seorak'], ['속초해변']),
  // 기타
  P('jeonju-hanok', '전주 한옥마을', '전주', 35.8150, 127.1530, 'village', 'KTX 약 1시간 40분', '골목이 평탄해요. 한옥 찻집에서 쉬어 가세요.', ['jeonju'], ['한옥마을', '전주한옥마을']),
  P('jeonju', '전주', '전주', 35.8242, 127.1480, 'city', 'KTX 약 1시간 40분', '비빔밥과 한옥으로 유명해요.', ['jeonju-hanok']),
  P('yeosu-night', '여수 밤바다', '여수', 34.7368, 127.7456, 'beach', 'KTX 약 3시간', '야경 산책로가 평탄해요.', ['yeosu'], ['여수밤바다', '오동도']),
  P('yeosu', '여수', '여수', 34.7604, 127.6622, 'city', 'KTX 약 3시간', '바다 야경이 아름다워요.', ['yeosu-night']),
  P('chuncheon-nami', '남이섬', '춘천', 37.7912, 127.5256, 'park', 'ITX 약 1시간 + 배', '섬 안 길이 평탄하고 단풍이 곱기로 유명해요.', ['chuncheon'], ['춘천 남이섬']),
  P('chuncheon', '춘천', '춘천', 37.8813, 127.7298, 'city', 'ITX 청춘열차 약 1시간', '닭갈비와 호수로 유명해요.', ['chuncheon-nami']),
  P('andong-hahoe', '하회마을', '안동', 36.5392, 128.5183, 'village', 'KTX 안동역 약 2시간 + 버스', '마을 길이 평평한 흙길이에요.', ['andong'], ['안동 하회마을']),
  P('andong', '안동', '안동', 36.5684, 128.7294, 'city', 'KTX 약 2시간', '찜닭과 전통 마을이 있어요.', ['andong-hahoe']),
  P('tongyeong', '통영', '통영', 34.8544, 128.4331, 'city', '고속버스 약 3시간 30분', '케이블카로 미륵산에 오를 수 있어요.', []),
  P('namhae', '남해', '남해', 34.8375, 127.8924, 'nature', '고속버스 약 4시간', '독일마을과 바래길이 아름다워요.', []),
];

const byId = new Map(PLACES.map(p => [p.id, p]));
export function placeById(id: string | undefined): Place | undefined { return id ? byId.get(id) : undefined; }

/** Match places in free text: names & aliases, longest match wins; overlapping shorter matches dropped. */
export function findPlaces(text: string): Place[] {
  const hits: { p: Place; start: number; len: number }[] = [];
  for (const p of PLACES) {
    for (const n of [p.name, ...p.aliases]) {
      const i = text.indexOf(n);
      if (i >= 0) hits.push({ p, start: i, len: n.length });
    }
  }
  hits.sort((a, b) => b.len - a.len);
  const taken: [number, number][] = [];
  const out: { p: Place; start: number }[] = [];
  for (const h of hits) {
    if (out.some(o => o.p.id === h.p.id)) continue;
    if (taken.some(([s, e]) => h.start < e && h.start + h.len > s)) continue;
    taken.push([h.start, h.start + h.len]);
    out.push({ p: h.p, start: h.start });
  }
  return out.sort((a, b) => a.start - b.start).map(o => o.p);
}

/** Best specific place (non-city) first, e.g. 경주 + 불국사 → 불국사. Display name: '경주 불국사'. */
export function resolvePlace(text: string): { place: Place; display: string } | undefined {
  const found = findPlaces(text);
  if (!found.length) return undefined;
  const specific = found.find(p => p.kind !== 'city');
  const city = found.find(p => p.kind === 'city');
  const place = specific ?? found[0];
  let display = place.name;
  if (specific && city && city.region === specific.region && !specific.name.startsWith(city.name) && specific.name !== city.name) {
    display = `${city.name} ${specific.name}`;
  }
  return { place, display };
}

// ── Itinerary templates ────────────────────────────────────────────────────
export interface TemplateStop { time: string; placeId?: string; title: string; description: string; travel?: string; note?: string }
export interface ItineraryTemplate { region: string; destination: string; highlights: string[]; days: { label: string; stops: TemplateStop[] }[]; tips: string[] }

export const ITINERARY_TEMPLATES: Record<string, ItineraryTemplate> = {
  경주: {
    region: '경주', destination: '경주',
    highlights: ['불국사 다보탑', '대릉원 산책', '동궁과 월지 야경', '보문호수'],
    days: [
      { label: '첫째 날', stops: [
        { time: '08:30', title: '서울역 출발', description: 'KTX 타고 편안하게 가요.', travel: 'KTX 신경주역까지 약 2시간', note: '혈압약은 아침 식후에 꼭 챙겨 드세요.' },
        { time: '11:00', title: '신경주역 도착, 점심', description: '경주 한정식으로 든든하게 드셔요.', travel: '택시 20분', note: '앉아서 먹는 식당으로 예약해 둘게요.' },
        { time: '13:00', placeId: 'gyeongju-bulguksa', title: '불국사', description: '다보탑과 석가탑 앞에서 다시 사진을 남겨요.', travel: '택시 15분', note: '평지 위주 · 휠체어 대여 가능 · 계단은 천천히' },
        { time: '15:30', placeId: 'gyeongju-bomun', title: '보문호수 산책', description: '벚나무 길을 천천히 걸어요.', travel: '택시 15분', note: '벤치에서 쉬는 시간 30분' },
        { time: '18:00', placeId: 'gyeongju-donggung', title: '동궁과 월지 야경', description: '저녁 불빛이 아름다워요.', travel: '택시 15분', note: '길이 평탄해요 · 겉옷 챙기기' },
      ] },
      { label: '둘째 날', stops: [
        { time: '09:30', title: '숙소에서 느긋한 아침', description: '아침 식사 후 약 드시고 출발해요.', note: '무리하지 않는 일정이에요.' },
        { time: '10:30', placeId: 'gyeongju-daereungwon', title: '대릉원 산책', description: '고분 사이 평탄한 길을 걸어요.', travel: '택시 10분', note: '벤치가 많아요' },
        { time: '12:00', placeId: 'gyeongju-hwangridan', title: '황리단길 점심', description: '경주 빵과 찻집에서 쉬어 가요.', travel: '도보 5분', note: '앉아 쉴 카페 확인 완료' },
        { time: '14:00', placeId: 'gyeongju-cheomseongdae', title: '첨성대', description: '마지막으로 첨성대 앞 가족 사진!', travel: '도보 10분', note: '평지 산책로' },
        { time: '15:30', title: '신경주역에서 귀가', description: '집에 돌아가는 KTX를 타요.', travel: '택시 25분 + KTX 2시간', note: '피곤하시면 좌석 편히 뒤로 젖혀요.' },
      ] },
    ],
    tips: ['혈압약은 아침 식후에 꼭 챙겨 드세요.', '불국사 대웅전 쪽 계단은 천천히, 난간 잡고 오르세요.', '휠체어 대여는 불국사 입구에서 가능해요.', '두 시간마다 앉아서 쉬는 시간을 넣었어요.'],
  },
  부산: {
    region: '부산', destination: '부산',
    highlights: ['해운대 바다', '동백섬 산책', '광안리 야경', '자갈치시장 회'],
    days: [
      { label: '첫째 날', stops: [
        { time: '08:00', title: '서울역 출발', description: 'KTX로 편하게 가요.', travel: 'KTX 부산역 약 2시간 40분', note: '혈압약은 아침 식후에 챙겨요.' },
        { time: '11:00', placeId: 'busan-jagalchi', title: '자갈치시장 점심', description: '싱싱한 회로 점심을 먹어요.', travel: '지하철 10분', note: '실내 좌석 식당으로 가요.' },
        { time: '14:00', placeId: 'busan-haeundae', title: '해운대 해변', description: '바닷가를 천천히 걸어요.', travel: '택시 30분', note: '평탄한 산책로 · 벤치 많음' },
        { time: '16:00', placeId: 'busan-dongbaek', title: '동백섬 둘레길', description: '완만한 길로 한 바퀴 돌아요.', travel: '도보 10분', note: '쉬는 시간 포함' },
        { time: '18:30', title: '해운대 저녁', description: '조개구이나 국밥으로 따뜻하게.', note: '앉아서 먹는 식당' },
      ] },
      { label: '둘째 날', stops: [
        { time: '09:30', title: '느긋한 아침', description: '약 드시고 천천히 출발해요.' },
        { time: '10:30', placeId: 'busan-gwangalli', title: '광안리 해변', description: '광안대교를 바라보며 산책해요.', travel: '택시 20분', note: '평지' },
        { time: '12:30', title: '광안리 점심', description: '밀면 한 그릇 어때요?', note: '' },
        { time: '14:30', placeId: 'busan-taejongdae', title: '태종대 순환열차', description: '걷지 않고 바다 절경을 구경해요.', travel: '택시 30분', note: '다누비 열차 이용' },
        { time: '16:30', title: '부산역에서 귀가', description: 'KTX로 돌아와요.', travel: '택시 30분 + KTX 2시간 40분' },
      ] },
    ],
    tips: ['혈압약은 아침 식후에 꼭 챙겨 드세요.', '바닷바람이 차요. 겉옷을 챙겨요.', '감천문화마을은 언덕이 많아 이번엔 제외했어요.', '두 시간마다 쉬는 시간을 넣었어요.'],
  },
};

/** Generic template built from a destination name (used for any other region). */
export function genericTemplate(destination: string, place?: Place): ItineraryTemplate {
  const near = place ? place.nearby.map(placeById).filter((p): p is Place => !!p) : [];
  const names = near.length ? near.map(n => n.name) : [`${destination} 중심가`, `${destination} 시장`, `${destination} 공원`];
  const pick = (i: number) => names[i % names.length];
  const travel = place?.travelFromSeoul && place.travelFromSeoul !== '-' ? place.travelFromSeoul : '대중교통 이용';
  return {
    region: destination, destination,
    highlights: names.slice(0, 4),
    days: [
      { label: '첫째 날', stops: [
        { time: '09:00', title: '서울 출발', description: '편한 교통편으로 가요.', travel, note: '혈압약은 아침 식후에 챙겨요.' },
        { time: '12:00', title: `${destination} 도착, 점심`, description: '현지 음식으로 든든하게.', note: '앉아서 먹는 식당' },
        { time: '14:00', placeId: near[0]?.id, title: pick(0), description: '천천히 둘러봐요.', travel: '택시 15분', note: place?.seniorNote || '평탄한 길 위주' },
        { time: '16:30', placeId: near[1]?.id, title: pick(1), description: '쉬엄쉬엄 구경해요.', travel: '택시 15분', note: '벤치 확인' },
        { time: '18:30', title: '저녁과 숙소', description: '일찍 쉬어요.' },
      ] },
      { label: '둘째 날', stops: [
        { time: '09:30', title: '느긋한 아침', description: '약 드시고 천천히 출발해요.' },
        { time: '10:30', placeId: near[2]?.id, title: pick(2), description: '아침 산책을 해요.', travel: '택시 15분', note: '무리하지 않아요' },
        { time: '12:30', title: '점심', description: '지역 맛집에서 한 끼.' },
        { time: '14:30', title: '기념 사진', description: '가족 사진을 남겨요.' },
        { time: '16:00', title: '귀가', description: '집으로 돌아와요.', travel },
      ] },
    ],
    tips: ['혈압약은 아침 식후에 꼭 챙겨 드세요.', '계단이 적은 길로 안내해요.', '두 시간마다 쉬는 시간을 넣었어요.', '휠체어 대여 가능 여부를 미리 확인할게요.'],
  };
}

export function templateFor(destination: string): ItineraryTemplate {
  const found = findPlaces(destination)[0];
  const region = found?.region ?? destination;
  return ITINERARY_TEMPLATES[region] ?? genericTemplate(found?.region ?? destination, found);
}

export function regionCityPlace(region: string): Place | undefined { return PLACES.find(p => p.region === region && p.kind === 'city'); }
