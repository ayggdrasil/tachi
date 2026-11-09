// Places & routes over the local gazetteer (server/data/places.ts). Deterministic estimates, no network calls.
import { PLACES, findPlaces, placeById, resolvePlace, type Place } from '../data/places';
import type { Tool } from './types';
import { ToolError } from './types';

/** The senior's home (서울 마포, 망원동 부근). */
export const HOME = { id: 'home', name: '집(서울 마포)', region: '서울', lat: 37.5563, lng: 126.9019 };
type Point = { id: string; name: string; region: string; lat: number; lng: number; place?: Place };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function resolvePoint(text: string): Point | undefined {
  const t = text.trim();
  if (!t || /^(집|우리\s*집|home|자택|어머님\s*댁|엄마\s*집|할머니\s*댁|마포)$/i.test(t)) return HOME;
  const p = placeById(t) ?? resolvePlace(t)?.place ?? findPlaces(t)[0];
  return p ? { id: p.id, name: p.name, region: p.region, lat: p.lat, lng: p.lng, place: p } : undefined;
}

export type Mode = 'walk' | 'subway' | 'bus' | 'car' | 'ktx';
const MODE_LABEL: Record<Mode, string> = { walk: '도보', subway: '지하철', bus: '버스', car: '자동차', ktx: 'KTX + 택시' };

/** Senior-paced estimate (slower walking, transfer buffers, road detour factor). */
export function estimateRoute(from: Point, to: Point, mode: Mode | 'auto' = 'auto') {
  const km = haversineKm(from, to);
  const ktxRegion = /KTX/.test(to.place?.travelFromSeoul ?? '') && from.region !== to.region;
  const chosen: Mode = mode !== 'auto' ? mode : km < 1.2 ? 'walk' : km < 25 ? 'subway' : ktxRegion ? 'ktx' : 'car';
  const roadKm = km * 1.3;
  const minutes = Math.round(
    chosen === 'walk' ? (km * 1.25 / 3.5) * 60
      : chosen === 'subway' ? 15 + (roadKm / 28) * 60
        : chosen === 'bus' ? 12 + (roadKm / 20) * 60
          : chosen === 'car' ? 10 + (roadKm / (km > 40 ? 80 : 30)) * 60
            : 70 + (km * 1.1 / 220) * 60,
  );
  const notes: string[] = [];
  if (chosen === 'walk' && km > 0.6) notes.push('중간에 벤치에서 한 번 쉬어 가세요.');
  if (chosen === 'subway') notes.push('엘리베이터가 있는 출구를 이용하시고, 경로석에 앉으세요.', '출퇴근 시간(8–9시, 18–19시)은 피하면 편해요.');
  if (chosen === 'bus') notes.push('저상버스를 기다리면 오르내리기 편해요.');
  if (chosen === 'car') notes.push(km > 100 ? '두 시간마다 휴게소에서 쉬어 가세요.' : '도착지 근처 주차장을 미리 확인해 두세요.');
  if (chosen === 'ktx') notes.push('서울역까지는 택시가 편해요. 역에서는 휠체어·도우미 서비스(1544-7788)를 미리 신청할 수 있어요.', '창가 좌석, 화장실 가까운 칸으로 예약하세요.');
  if (to.place?.seniorNote) notes.push(to.place.seniorNote);
  const hours = Math.floor(minutes / 60), mins = minutes % 60;
  return {
    from: from.name, to: to.name, distanceKm: Math.round(km * 10) / 10, mode: chosen, modeLabel: MODE_LABEL[chosen], minutes,
    durationLabel: hours ? `약 ${hours}시간${mins ? ` ${mins}분` : ''}` : `약 ${Math.max(1, mins)}분`,
    ...(to.place?.travelFromSeoul && to.place.travelFromSeoul !== '-' && from.id === HOME.id ? { typical: to.place.travelFromSeoul } : {}),
    seniorNotes: notes.slice(0, 4),
  };
}

export const transitRoute: Tool<{ to: string; from?: string; mode?: Mode | 'auto' }> = {
  name: 'transit_route',
  label: '길찾기',
  description: '두 장소 사이의 이동 방법과 예상 시간을 어르신 눈높이로 알려줍니다. Estimate a senior-friendly route (mode, distance, duration, notes) '
    + 'between two places from the local gazetteer. from defaults to the senior\'s home (서울 마포). mode: auto | walk | subway | bus | car | ktx.',
  audiences: ['senior', 'family'],
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['to'],
    properties: {
      to: { type: 'string', minLength: 1, maxLength: 40 },
      from: { type: 'string', maxLength: 40, default: '집' },
      mode: { type: 'string', enum: ['auto', 'walk', 'subway', 'bus', 'car', 'ktx'], default: 'auto' },
    },
  },
  execute(args) {
    const from = resolvePoint(args.from ?? '집');
    const to = resolvePoint(args.to);
    if (!from) throw new ToolError('not_found', `unknown place: ${args.from}`);
    if (!to) throw new ToolError('not_found', `unknown place: ${args.to}`);
    const r = estimateRoute(from, to, args.mode ?? 'auto');
    return { data: r, summary: `${r.from} → ${r.to} ${r.modeLabel} ${r.durationLabel} (${r.distanceKm}km)` };
  },
};

export const mapSearch: Tool<{ query?: string; near?: string; kind?: string; limit: number }> = {
  name: 'map_search',
  label: '장소 검색',
  description: '장소를 찾거나 어떤 장소 근처의 가볼 만한 곳을 찾습니다. Search the local places gazetteer by name/region, or list places near a place, '
    + 'with distance and senior-friendly notes. kind: temple | heritage | nature | beach | market | city | food | museum | park | village.',
  audiences: ['senior', 'family'],
  inputSchema: {
    type: 'object', additionalProperties: false,
    properties: {
      query: { type: 'string', maxLength: 40 },
      near: { type: 'string', maxLength: 40 },
      kind: { type: 'string', enum: ['temple', 'heritage', 'nature', 'beach', 'market', 'city', 'food', 'museum', 'park', 'village'] },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    },
  },
  execute(args) {
    if (!args.query && !args.near) throw new ToolError('invalid', 'give query or near');
    const center = args.near ? resolvePoint(args.near) : undefined;
    if (args.near && !center) throw new ToolError('not_found', `unknown place: ${args.near}`);
    let pool: Place[];
    if (args.query) {
      const q = args.query.trim();
      pool = findPlaces(q);
      if (!pool.length) pool = PLACES.filter(p => p.region === q || p.name.includes(q) || p.aliases.some(a => a.includes(q)) || q.includes(p.region));
    } else {
      const c = center!;
      const nearIds = c.place?.nearby ?? [];
      pool = PLACES.filter(p => p.id !== c.id && p.kind !== 'city' && (nearIds.includes(p.id) || haversineKm(c, p) < 15));
    }
    if (args.kind) pool = pool.filter(p => p.kind === args.kind);
    const rows = pool.map(p => ({
      id: p.id, name: p.name, region: p.region, kind: p.kind, seniorNote: p.seniorNote,
      ...(center ? { distanceKm: Math.round(haversineKm(center, p) * 10) / 10 } : {}),
    })).sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0)).slice(0, args.limit);
    return { data: { center: center?.name, places: rows }, summary: `장소 ${rows.length}곳${center ? ` (${center.name} 근처)` : ''}` };
  },
};
