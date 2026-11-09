// Booking deep links built from the gazetteer (no network calls): Naver Map / Kakao Map searches, Korail / SRT reservation pages.
import type { BookingCategory, BookingLink } from '../../shared/types';
import { findPlaces, regionCityPlace, resolvePlace, type Place } from './places';

const enc = encodeURIComponent;

export const naverMapSearch = (q: string): string => `https://map.naver.com/p/search/${enc(q)}`;
export const kakaoMapSearch = (q: string): string => `https://map.kakao.com/?q=${enc(q)}`;

/** The KTX station a place is reached by ('KTX 신경주역까지 …' → '신경주', 'KTX 부산역 …' → '부산'). */
export function stationFor(place?: Place): string | undefined {
  if (!place) return undefined;
  const m = /(?:KTX|ITX|SRT)[^가-힣]*([가-힣]+?)역/.exec(place.travelFromSeoul);
  if (m) return m[1];
  return /KTX|ITX/.test(place.travelFromSeoul) ? place.region : undefined;
}

/** Korail reservation page prefilled with departure / arrival (and the date when known). */
export function korailUrl(from: string, to: string, date?: Date): string {
  const p = new URLSearchParams({ txtGoStart: from, txtGoEnd: to });
  if (date) {
    p.set('selGoYear', String(date.getFullYear()));
    p.set('selGoMonth', String(date.getMonth() + 1).padStart(2, '0'));
    p.set('selGoDay', String(date.getDate()).padStart(2, '0'));
  }
  return `https://www.letskorail.com/ebizprd/EbizPrdTicketpr21100W_pr21110.do?${p.toString()}`;
}

export interface BookingInput {
  category: BookingCategory;
  /** the task text (may name a place itself) */
  taskText: string;
  /** artifact place, e.g. '경주 일대' */
  place?: string;
  /** search noun from the classifier, e.g. '한정식' / '숙소' */
  query?: string;
  /** gathering date (for train links) */
  date?: Date;
  /** departure city for trains */
  from?: string;
}

export interface BookingPlan { query: string; region?: string; placeName?: string; links: BookingLink[] }

/** Build the links for one booking task. The place named in the task wins over the artifact place. */
export function buildBookingLinks(input: BookingInput): BookingPlan {
  const own = resolvePlace(input.taskText);
  const art = resolvePlace(input.place ?? '');
  const hit = own ?? art;
  const region = hit?.place.region ?? findPlaces(input.place ?? '')[0]?.region;
  const near = hit?.place.kind === 'city' || !hit ? undefined : hit.place.name;
  const area = [region, near && near !== region ? near : undefined].filter(Boolean).join(' ');
  const noun = (input.query ?? '').trim() || (input.category === 'lodging' ? '숙소' : input.category === 'restaurant' ? '식당' : input.category === 'car' ? '렌터카' : '예약');
  const query = [area, noun].filter(Boolean).join(' ').trim();

  if (input.category === 'train') {
    const station = stationFor(hit?.place) ?? stationFor(region ? regionCityPlace(region) : undefined) ?? region ?? '';
    const from = input.from ?? '서울';
    const links: BookingLink[] = [
      { label: `코레일 ${from} → ${station || '도착역'}`, url: korailUrl(from, station, input.date), provider: 'korail' },
      { label: 'SRT 예매', url: 'https://etk.srail.kr/hpg/hra/01/selectScheduleList.do', provider: 'srt' },
    ];
    if (station) links.push({ label: `${station}역 길찾기`, url: naverMapSearch(`${station}역`), provider: 'naver' });
    return { query: `${from} → ${station}`.trim(), region, placeName: station || undefined, links };
  }
  const links: BookingLink[] = [
    { label: `네이버 지도 · ${query}`, url: naverMapSearch(query), provider: 'naver' },
    { label: `카카오맵 · ${query}`, url: kakaoMapSearch(query), provider: 'kakao' },
  ];
  return { query, region, placeName: near ?? region, links };
}
