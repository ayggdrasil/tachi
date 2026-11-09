// graph_search: memory graph lookup with the same visibility rules as the rest of the server.
import type { Tool } from './types';
import { ToolError } from './types';

export const graphSearch: Tool<{ keywords: string[]; limit: number }> = {
  name: 'graph_search',
  label: '추억 그래프',
  labelEn: 'memory graph',
  description: '어머님의 추억 그래프(장소·인물·시기·사건·감정)에서 기억을 찾습니다. Search the senior\'s memory graph by keywords '
    + '(places, people, years/decades, events, emotions, topics). Family-facing calls only ever see memories the senior shared with the family.',
  audiences: ['senior', 'family'],
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['keywords'],
    properties: {
      keywords: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 20 }, minItems: 1, maxItems: 6 },
      limit: { type: 'integer', minimum: 1, maximum: 5, default: 3 },
    },
  },
  async execute(args, ctx) {
    const family = ctx.audience === 'family';
    if (family && ctx.privacy().memory !== 'family') throw new ToolError('forbidden', '어머님이 추억 이야기를 비공개로 두셨어요 (memory category is private).');
    const saved = ctx.db.memories.all().filter(m => m.status === 'saved');
    const allowed = family ? saved.filter(m => ctx.memoryVisibleToFamily(m.id)) : saved;
    if (!allowed.length) return { data: { results: [] }, summary: '추억 0건' };
    const hits = await ctx.graph.search(args.keywords, { visibleMemoryIds: allowed.map(m => m.id), limit: args.limit + 2 });
    const byId = new Map(allowed.map(m => [m.id, m]));
    // defence in depth: re-check every hit against the allow-list even though the store already filtered
    const results = hits.filter(h => byId.has(h.memoryId)).slice(0, args.limit).map(h => {
      const m = byId.get(h.memoryId)!;
      return {
        memoryId: m.id, title: m.title, summary: m.summary, year: m.year, season: m.season, place: m.place,
        people: m.people.map(p => (p.relation ? `${p.name}(${p.relation})` : p.name)), event: m.event, emotions: m.emotions,
        matched: h.matched, ...(family ? {} : { story: m.story }),
      };
    });
    return {
      data: { results },
      summary: `추억 ${results.length}건${results[0] ? `: ${results[0].title}` : ''}`,
      provenance: results.length ? { memoryIds: results.map(r => r.memoryId), categories: family ? ['memory'] : [] } : undefined,
    };
  },
};
