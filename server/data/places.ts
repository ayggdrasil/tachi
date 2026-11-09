import { getLocale } from '../brain/locale';
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
  /** English data (the Korean fields above stay canonical: `region` is the stable key used across the app). */
  nameEn: string;
  aliasesEn: string[];
  regionEn: string;
  seniorNoteEn: string;
  travelEn: string;
}

const P = (id: string, name: string, region: string, lat: number, lng: number, kind: PlaceKind, travelFromSeoul: string,
  seniorNote: string, nearby: string[], aliases: string[] = []): Place =>
  ({ id, name, aliases, region, lat, lng, kind, seniorNote, nearby, travelFromSeoul, nameEn: '', aliasesEn: [], regionEn: '', seniorNoteEn: '', travelEn: '' });

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

// ── English gazetteer data (attached to the Korean entries by id) ───────────
const KTX_GJ_EN = 'KTX to Singyeongju Station (about 2 hours) + 25 min by taxi';
const KTX_BS_EN = 'KTX to Busan Station (about 2 hr 40 min)';
const EN: Record<string, [name: string, region: string, aliases: string[], travel: string, note: string]> = {
  'gyeongju-bulguksa': ['Bulguksa Temple', 'Gyeongju', ['Bulguksa', 'Bulguk Temple', 'Bulguk-sa', 'Pulguksa'], KTX_GJ_EN, 'The area in front of Dabotap and Seokgatap pagodas is flat and easy to walk. Take the steps up to the main hall slowly.'],
  'gyeongju-seokguram': ['Seokguram Grotto', 'Gyeongju', ['Seokguram', 'Seokguram Hermitage'], KTX_GJ_EN, 'A shuttle bus goes up, and only the last stretch is a gentle walk.'],
  'gyeongju-cheomseongdae': ['Cheomseongdae Observatory', 'Gyeongju', ['Cheomseongdae', 'Cheomseong-dae'], KTX_GJ_EN, 'A flat walking path, easy for wheelchairs too.'],
  'gyeongju-daereungwon': ['Daereungwon Tomb Complex', 'Gyeongju', ['Daereungwon', 'Cheonmachong', 'Daereung-won'], KTX_GJ_EN, 'Flat paths with plenty of benches.'],
  'gyeongju-bomun': ['Bomun Lake', 'Gyeongju', ['Bomun', 'Bomun Resort', 'Bomun Lake Resort'], KTX_GJ_EN, 'The lakeside path is flat and lovely for a slow walk.'],
  'gyeongju-donggung': ['Donggung Palace and Wolji Pond', 'Gyeongju', ['Wolji Pond', 'Anapji', 'Anapji Pond', 'Donggung and Wolji', 'Donggung'], KTX_GJ_EN, 'The night view is beautiful in the evening, and the path is flat.'],
  'gyeongju-hwangridan': ['Hwangnidan-gil', 'Gyeongju', ['Hwangridan-gil', 'Hwangridan', 'Hwangnidan', 'Hwangnam-dong'], KTX_GJ_EN, 'Lots of little alleys to browse and tea houses to rest in.'],
  'gyeongju': ['Gyeongju', 'Gyeongju', ['Silla'], KTX_GJ_EN, 'The thousand-year-old capital. Mostly flat, which is great for older travelers.'],
  'busan-haeundae': ['Haeundae Beach', 'Busan', ['Haeundae', 'Haeundae Sea'], KTX_BS_EN, 'The promenade beside the sand is flat. Avoid the midday sun.'],
  'busan-dongbaek': ['Dongbaek Island', 'Busan', ['Dongbaekseom'], KTX_BS_EN, 'A gentle loop trail with lovely sea views.'],
  'busan-gwangalli': ['Gwangalli Beach', 'Busan', ['Gwangalli', 'Gwangan Bridge', 'Gwangandaegyo'], KTX_BS_EN, 'The beach road is flat, with many cafes.'],
  'busan-jagalchi': ['Jagalchi Market', 'Busan', ['Jagalchi'], KTX_BS_EN, 'An indoor market that works in the rain, though the floor can be slippery.'],
  'busan-gamcheon': ['Gamcheon Culture Village', 'Busan', ['Gamcheon Village', 'Gamcheon'], KTX_BS_EN, 'The hills are steep. Use the village bus.'],
  'busan-taejongdae': ['Taejongdae Park', 'Busan', ['Taejongdae'], KTX_BS_EN, 'The Danubi tram lets you go around comfortably.'],
  'busan': ['Busan', 'Busan', ['Pusan'], KTX_BS_EN, 'A city known for sea views and fresh seafood.'],
  'seoul-myeongdong-cathedral': ['Myeongdong Cathedral', 'Seoul', ['Myeongdong'], 'About 30 min by subway (Line 2 + Line 4)', 'The entrance has a slight slope, but the sanctuary is a quiet place to rest.'],
  'seoul-sinchon': ['Sinchon', 'Seoul', ['Sinchon Station', 'Ewha'], 'Subway Line 2, Sinchon Station', 'A busy university district. Rest at a cafe.'],
  'seoul-namsan': ['Namsan', 'Seoul', ['Namsan Tower', 'N Seoul Tower', 'Seoul Tower'], 'About 40 min by subway + cable car', 'Take the cable car up and spare your knees.'],
  'seoul-deoksugung': ['Deoksugung Palace', 'Seoul', ['Deoksugung'], 'Subway Line 1, City Hall Station', 'The stone-wall walkway is flat.'],
  'seoul-gyeongbokgung': ['Gyeongbokgung Palace', 'Seoul', ['Gyeongbokgung'], 'Subway Line 3, Gyeongbokgung Station', 'The palace grounds are large. Rest along the way.'],
  'seoul-changgyeonggung': ['Changgyeonggung Palace', 'Seoul', ['Changgyeonggung'], 'Subway Line 4, Hyehwa Station + bus', 'A quiet, peaceful stroll.'],
  'seoul-hangang': ['Hangang Park', 'Seoul', ['Han River', 'Hangang', 'Yeouido'], 'Subway + a short walk', 'The riverside path is flat with plenty of benches.'],
  'seoul': ['Seoul', 'Seoul', [], '-', ''],
  'jeju-seongsan': ['Seongsan Ilchulbong', 'Jeju', ['Ilchulbong', 'Sunrise Peak', 'Seongsan Sunrise Peak'], '1 hour by plane + 1 hour by rental car', 'Many steps up to the summit. Looking up from below is lovely too.'],
  'jeju-seopjikoji': ['Seopjikoji', 'Jeju', [], '1 hour by plane + 1 hour by rental car', 'The coastal path is gentle.'],
  'jeju-udo': ['Udo Island', 'Jeju', ['Udo'], '1 hour by plane + rental car + 15 min by ferry', 'You need a ferry, so check the weather.'],
  'jeju-hallasan': ['Hallasan', 'Jeju', ['Mount Halla', 'Halla Mountain'], '1 hour by plane + 1 hour by rental car', 'The summit hike is tough. Try the walks near Yeongsil instead.'],
  'jeju': ['Jeju', 'Jeju', ['Jeju Island', 'Jejudo'], '1 hour by plane', 'A rental car makes it easy.'],
  'gangneung-gyeongpo': ['Gyeongpo Beach', 'Gangneung', ['Gyeongpodae', 'Gyeongpo Lake', 'Gyeongpo'], 'About 2 hours by KTX to Gangneung Station', 'The lakeside path is flat.'],
  'gangneung-anmok': ['Anmok Beach', 'Gangneung', ['Anmok', 'Coffee Street'], 'About 2 hours by KTX to Gangneung Station', 'Coffee Street is a nice place to rest.'],
  'gangneung-ojukheon': ['Ojukheon House', 'Gangneung', ['Ojukheon'], 'About 2 hours by KTX to Gangneung Station', 'The paths are flat.'],
  'gangneung': ['Gangneung', 'Gangneung', [], 'About 2 hours by KTX to Gangneung Station', 'Famous for its sea and coffee.'],
  'sokcho-seorak': ['Seoraksan', 'Sokcho', ['Mount Seorak', 'Seorak Mountain', 'Seoraksan National Park', 'Seorak'], 'About 2 hr 30 min by express bus', 'You can reach Gwongeumseong by cable car.'],
  'sokcho': ['Sokcho', 'Sokcho', [], 'About 2 hr 30 min by express bus', 'Great for sea views and the market.'],
  'jeonju-hanok': ['Jeonju Hanok Village', 'Jeonju', ['Hanok Village'], 'About 1 hr 40 min by KTX', 'The alleys are flat. Rest at a hanok tea house.'],
  'jeonju': ['Jeonju', 'Jeonju', [], 'About 1 hr 40 min by KTX', 'Famous for bibimbap and hanok houses.'],
  'yeosu-night': ['Yeosu Night Sea', 'Yeosu', ['Yeosu Night Sea View', 'Odongdo'], 'About 3 hours by KTX', 'The night-view walkway is flat.'],
  'yeosu': ['Yeosu', 'Yeosu', [], 'About 3 hours by KTX', 'Beautiful night views over the sea.'],
  'chuncheon-nami': ['Nami Island', 'Chuncheon', ['Namiseom'], 'About 1 hour by ITX + a ferry', 'The paths on the island are flat, and it is famous for autumn leaves.'],
  'chuncheon': ['Chuncheon', 'Chuncheon', [], 'About 1 hour by ITX', 'Famous for dakgalbi and lakes.'],
  'andong-hahoe': ['Hahoe Folk Village', 'Andong', ['Hahoe Village', 'Hahoe'], 'About 2 hours by KTX to Andong Station + bus', 'The village paths are flat dirt roads.'],
  'andong': ['Andong', 'Andong', [], 'About 2 hours by KTX', 'Known for jjimdak and a traditional village.'],
  'tongyeong': ['Tongyeong', 'Tongyeong', [], 'About 3 hr 30 min by express bus', 'A cable car goes up Mireuksan.'],
  'namhae': ['Namhae', 'Namhae', [], 'About 4 hours by express bus', 'The German Village and Barae trail are lovely.'],
};
for (const p of PLACES) {
  const e = EN[p.id];
  if (e) { p.nameEn = e[0]; p.regionEn = e[1]; p.aliasesEn = e[2]; p.travelEn = e[3]; p.seniorNoteEn = e[4]; }
  else { p.nameEn = p.name; p.regionEn = p.region; p.travelEn = p.travelFromSeoul; p.seniorNoteEn = p.seniorNote; }
}

/** Locale-aware labels (the Korean fields stay the canonical keys). */
export const placeName = (p: Place): string => (getLocale() === 'en' ? p.nameEn : p.name);
export const placeRegion = (p: Place): string => (getLocale() === 'en' ? p.regionEn : p.region);
export const placeNote = (p: Place): string => (getLocale() === 'en' ? p.seniorNoteEn : p.seniorNote);
export const placeTravel = (p: Place): string => (getLocale() === 'en' ? p.travelEn : p.travelFromSeoul);
/** Region label for a canonical (Korean) region key. */
export function regionLabel(region: string): string {
  if (getLocale() !== 'en') return region;
  return PLACES.find(p => p.region === region)?.regionEn ?? region;
}

const byId = new Map(PLACES.map(p => [p.id, p]));
export function placeById(id: string | undefined): Place | undefined { return id ? byId.get(id) : undefined; }

const escRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Case-insensitive, word-bounded match of an English name; returns [start, len] of the first hit. */
function findEn(text: string, name: string): [number, number] | undefined {
  const m = new RegExp(`(?<![A-Za-z])${escRe(name).replace(/\s+/g, '[\\s-]+')}(?![A-Za-z])`, 'i').exec(text);
  return m ? [m.index, m[0].length] : undefined;
}

/** Match places in free text (Korean or English names & aliases): longest match wins; overlapping shorter matches dropped. */
export function findPlaces(text: string): Place[] {
  const hits: { p: Place; start: number; len: number }[] = [];
  for (const p of PLACES) {
    for (const n of [p.name, ...p.aliases]) {
      const i = text.indexOf(n);
      if (i >= 0) hits.push({ p, start: i, len: n.length });
    }
    if (/[A-Za-z]/.test(text)) {
      for (const n of [p.nameEn, ...p.aliasesEn]) {
        if (!n || n === p.name) continue;
        const h = findEn(text, n);
        if (h) hits.push({ p, start: h[0], len: h[1] });
      }
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

/** Best specific place (non-city) first, e.g. 경주 + 불국사 → 불국사. Display: '경주 불국사' (ko) / 'Bulguksa Temple, Gyeongju' (en). */
export function resolvePlace(text: string): { place: Place; display: string } | undefined {
  const found = findPlaces(text);
  if (!found.length) return undefined;
  const specific = found.find(p => p.kind !== 'city');
  const city = found.find(p => p.kind === 'city');
  const place = specific ?? found[0];
  if (getLocale() === 'en') {
    let display = place.nameEn;
    if (specific && city && city.region === specific.region && !specific.nameEn.startsWith(city.nameEn) && specific.nameEn !== city.nameEn) display = `${specific.nameEn}, ${city.nameEn}`;
    return { place, display };
  }
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
        { time: '08:30', title: '서울역 출발', description: 'KTX 타고 편안하게 가요.', travel: 'KTX 신경주역까지 약 2시간', note: '평소 복용 시간표대로 약을 챙기세요.' },
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
    tips: ['평소 복용 시간표대로 약을 챙기세요.', '불국사 대웅전 쪽 계단은 천천히, 난간 잡고 오르세요.', '휠체어 대여는 불국사 입구에서 가능해요.', '두 시간마다 앉아서 쉬는 시간을 넣었어요.'],
  },
  부산: {
    region: '부산', destination: '부산',
    highlights: ['해운대 바다', '동백섬 산책', '광안리 야경', '자갈치시장 회'],
    days: [
      { label: '첫째 날', stops: [
        { time: '08:00', title: '서울역 출발', description: 'KTX로 편하게 가요.', travel: 'KTX 부산역 약 2시간 40분', note: '평소 복용 시간표대로 약을 챙기세요.' },
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
    tips: ['평소 복용 시간표대로 약을 챙기세요.', '바닷바람이 차요. 겉옷을 챙겨요.', '감천문화마을은 언덕이 많아 이번엔 제외했어요.', '두 시간마다 쉬는 시간을 넣었어요.'],
  },
};

export const ITINERARY_TEMPLATES_EN: Record<string, ItineraryTemplate> = {
  경주: {
    region: 'Gyeongju', destination: 'Gyeongju',
    highlights: ['Bulguksa Temple and Dabotap Pagoda', 'A stroll through Daereungwon', 'Donggung Palace and Wolji Pond at night', 'Bomun Lake'],
    days: [
      { label: 'Day 1', stops: [
        { time: '08:30', title: 'Depart Seoul Station', description: 'Ride the KTX in comfort.', travel: 'About 2 hours by KTX to Singyeongju Station', note: 'Bring your medicine, taken on your usual schedule.' },
        { time: '11:00', title: 'Arrive at Singyeongju Station, lunch', description: 'A hearty Gyeongju set meal.', travel: '20 min by taxi', note: 'We will book a restaurant with seated dining.' },
        { time: '13:00', placeId: 'gyeongju-bulguksa', title: 'Bulguksa Temple', description: 'Take a photo in front of Dabotap and Seokgatap pagodas again.', travel: '15 min by taxi', note: 'Mostly flat · wheelchair rental available · take stairs slowly' },
        { time: '15:30', placeId: 'gyeongju-bomun', title: 'Walk around Bomun Lake', description: 'Stroll slowly along the cherry tree path.', travel: '15 min by taxi', note: '30-minute rest on a bench' },
        { time: '18:00', placeId: 'gyeongju-donggung', title: 'Donggung Palace and Wolji Pond at night', description: 'Enjoy the evening lights.', travel: '15 min by taxi', note: 'Flat path · bring a light jacket' },
      ] },
      { label: 'Day 2', stops: [
        { time: '09:30', title: 'A slow morning at the hotel', description: 'Have breakfast, take your medicine, then head out.', note: 'An unhurried schedule.' },
        { time: '10:30', placeId: 'gyeongju-daereungwon', title: 'Walk through Daereungwon', description: 'A flat path among the ancient tombs.', travel: '10 min by taxi', note: 'Plenty of benches' },
        { time: '12:00', placeId: 'gyeongju-hwangridan', title: 'Lunch on Hwangnidan-gil', description: 'Gyeongju bread and a rest at a tea house.', travel: '5 min on foot', note: 'Seated cafe confirmed' },
        { time: '14:00', placeId: 'gyeongju-cheomseongdae', title: 'Cheomseongdae', description: 'One last family photo in front of Cheomseongdae!', travel: '10 min on foot', note: 'Flat walking path' },
        { time: '15:30', title: 'Head home from Singyeongju Station', description: 'Catch the KTX home.', travel: '25 min by taxi + 2 hours by KTX', note: 'If you are tired, recline your seat.' },
      ] },
    ],
    tips: ['Bring your medicine, taken on your usual schedule.', 'Take the stairs to the main hall at Bulguksa slowly, holding the railing.', 'Wheelchairs can be rented at the Bulguksa entrance.', 'We built in a seated rest every two hours.'],
  },
  부산: {
    region: 'Busan', destination: 'Busan',
    highlights: ['Haeundae Beach', 'A walk around Dongbaek Island', 'Gwangalli at night', 'Fresh sashimi at Jagalchi Market'],
    days: [
      { label: 'Day 1', stops: [
        { time: '08:00', title: 'Depart Seoul Station', description: 'Ride the KTX in comfort.', travel: 'About 2 hr 40 min by KTX to Busan Station', note: 'Bring your medicine, taken on your usual schedule.' },
        { time: '11:00', placeId: 'busan-jagalchi', title: 'Lunch at Jagalchi Market', description: 'Fresh sashimi for lunch.', travel: '10 min by subway', note: 'We will pick an indoor, seated restaurant.' },
        { time: '14:00', placeId: 'busan-haeundae', title: 'Haeundae Beach', description: 'Walk slowly along the shore.', travel: '30 min by taxi', note: 'Flat promenade · many benches' },
        { time: '16:00', placeId: 'busan-dongbaek', title: 'Dongbaek Island loop', description: 'A gentle walk all the way around.', travel: '10 min on foot', note: 'Rests included' },
        { time: '18:30', title: 'Dinner in Haeundae', description: 'Grilled clams or a warm rice soup.', note: 'Seated restaurant' },
      ] },
      { label: 'Day 2', stops: [
        { time: '09:30', title: 'A slow morning', description: 'Take your medicine and head out at an easy pace.' },
        { time: '10:30', placeId: 'busan-gwangalli', title: 'Gwangalli Beach', description: 'Stroll with Gwangan Bridge in view.', travel: '20 min by taxi', note: 'Flat ground' },
        { time: '12:30', title: 'Lunch at Gwangalli', description: 'How about a bowl of milmyeon?', note: '' },
        { time: '14:30', placeId: 'busan-taejongdae', title: 'Taejongdae tram', description: 'See the coastal cliffs without walking much.', travel: '30 min by taxi', note: 'Take the Danubi tram' },
        { time: '16:30', title: 'Head home from Busan Station', description: 'Ride the KTX back.', travel: '30 min by taxi + 2 hr 40 min by KTX' },
      ] },
    ],
    tips: ['Bring your medicine, taken on your usual schedule.', 'The sea breeze is cool, so bring a jacket.', 'We left out Gamcheon Culture Village this time because of the hills.', 'We built in rest breaks every two hours.'],
  },
};

export function genericTemplateEn(destination: string, place?: Place): ItineraryTemplate {
  const near = place ? place.nearby.map(placeById).filter((p): p is Place => !!p) : [];
  const names = near.length ? near.map(n => n.nameEn) : [`Downtown ${destination}`, `${destination} market`, `${destination} park`];
  const pick = (i: number) => names[i % names.length];
  const travel = place?.travelEn && place.travelEn !== '-' ? place.travelEn : 'Public transport';
  return {
    region: destination, destination,
    highlights: names.slice(0, 4),
    days: [
      { label: 'Day 1', stops: [
        { time: '09:00', title: 'Depart Seoul', description: 'Travel in comfort.', travel, note: 'Bring your medicine, taken on your usual schedule.' },
        { time: '12:00', title: `Arrive in ${destination}, lunch`, description: 'A hearty local meal.', note: 'Seated restaurant' },
        { time: '14:00', placeId: near[0]?.id, title: pick(0), description: 'Take a slow look around.', travel: '15 min by taxi', note: place?.seniorNoteEn || 'Mostly flat paths' },
        { time: '16:30', placeId: near[1]?.id, title: pick(1), description: 'Sightsee at a relaxed pace.', travel: '15 min by taxi', note: 'Benches checked' },
        { time: '18:30', title: 'Dinner and hotel', description: 'Rest early.' },
      ] },
      { label: 'Day 2', stops: [
        { time: '09:30', title: 'A slow morning', description: 'Take your medicine and head out at an easy pace.' },
        { time: '10:30', placeId: near[2]?.id, title: pick(2), description: 'Take a morning walk.', travel: '15 min by taxi', note: 'No rushing' },
        { time: '12:30', title: 'Lunch', description: 'A meal at a local favorite.' },
        { time: '14:30', title: 'Family photos', description: 'Take some family pictures.' },
        { time: '16:00', title: 'Head home', description: 'Travel back home.', travel },
      ] },
    ],
    tips: ['Bring your medicine, taken on your usual schedule.', 'We will guide you along routes with few stairs.', 'We built in rest breaks every two hours.', 'We will check in advance whether wheelchairs can be rented.'],
  };
}

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
        { time: '09:00', title: '서울 출발', description: '편한 교통편으로 가요.', travel, note: '평소 복용 시간표대로 약을 챙기세요.' },
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
    tips: ['평소 복용 시간표대로 약을 챙기세요.', '계단이 적은 길로 안내해요.', '두 시간마다 쉬는 시간을 넣었어요.', '휠체어 대여 가능 여부를 미리 확인할게요.'],
  };
}

export function templateFor(destination: string): ItineraryTemplate {
  const found = findPlaces(destination)[0];
  const region = found?.region ?? destination;
  if (getLocale() === 'en') return ITINERARY_TEMPLATES_EN[region] ?? genericTemplateEn(found?.regionEn ?? destination, found);
  return ITINERARY_TEMPLATES[region] ?? genericTemplate(found?.region ?? destination, found);
}

export function regionCityPlace(region: string): Place | undefined { return PLACES.find(p => p.region === region && p.kind === 'city'); }
