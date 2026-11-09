import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import type { GraphEdge, GraphNode, GraphNodeLabel } from '../../../../shared/types';
import { useT } from '../../lib/i18n';
import { getState } from '../../lib/store';
import './MemoryGraph.css';

interface SimNode { id: string; label: GraphNodeLabel; name: string; x: number; y: number; fx?: number | null; fy?: number | null; vx?: number; vy?: number }
interface SimLink { id: string; type: string; source: string | SimNode; target: string | SimNode }

const LABELS: GraphNodeLabel[] = ['Memory', 'Person', 'Place', 'Era', 'Event', 'Emotion', 'Topic'];
const REL_IDS = new Set(['APPEARS_IN', 'TAKEN_AT', 'IN_ERA', 'ABOUT', 'EVOKES', 'MENTIONS', 'FAMILY_OF']);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
}

function Shape({ label, r = 1 }: { label: GraphNodeLabel; r?: number }) {
  switch (label) {
    case 'Memory': return <circle r={9 * r} className="mg-memory" />;
    case 'Person': return <circle r={7 * r} className="mg-ring" />;
    case 'Place': return <rect x={-6.5 * r} y={-6.5 * r} width={13 * r} height={13 * r} className="mg-ring" />;
    case 'Era': return <rect x={-6 * r} y={-6 * r} width={12 * r} height={12 * r} transform="rotate(45)" className="mg-ring" />;
    case 'Event': return <rect x={-9 * r} y={-5.5 * r} width={18 * r} height={11 * r} rx={4} className="mg-ring" />;
    case 'Emotion': return <circle r={3.5 * r} className="mg-dot" />;
    case 'Topic': return <circle r={4.5 * r} className="mg-ring mg-thin" />;
  }
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** Rough rendered width of a label: Hangul/CJK are ~full-width, latin ~0.58em. */
const textW = (s: string, fs: number) => [...s].reduce((w, c) => w + (c.charCodeAt(0) > 255 ? fs * 0.98 : fs * 0.58), 0);
const LABEL_ORDER: GraphNodeLabel[] = ['Person', 'Place', 'Era', 'Event', 'Emotion', 'Topic', 'Memory'];

interface LabelPos { x: number; y: number; anchor: 'start' | 'middle' | 'end' }

/** Deterministic memory-centred radial layout: entity nodes evenly spaced on an ellipse, grouped by label, labels outside. */
function radialLayout(nodes: GraphNode[], edges: GraphEdge[], W: number, H: number, fs: number, maxChars: number) {
  const pos = new Map<string, { x: number; y: number }>();
  const labels = new Map<string, LabelPos>();
  const deg = new Map<string, number>();
  edges.forEach(e => { deg.set(e.source, (deg.get(e.source) ?? 0) + 1); deg.set(e.target, (deg.get(e.target) ?? 0) + 1); });
  const mems = nodes.filter(n => n.label === 'Memory').sort((a, b) => (deg.get(b.id) ?? 0) - (deg.get(a.id) ?? 0));
  const center = mems[0];
  const rest = nodes.filter(n => n !== center)
    .sort((a, b) => LABEL_ORDER.indexOf(a.label) - LABEL_ORDER.indexOf(b.label) || a.name.localeCompare(b.name, getState().locale) || a.id.localeCompare(b.id));
  const cx = W / 2, cy = H / 2;
  const maxW = Math.max(40, ...rest.map(n => textW(trunc(n.name, maxChars), fs)));
  const rx = Math.max(46, Math.min(W / 2 - 22 - maxW, 130));
  const ry = Math.max(40, H / 2 - 30);
  if (center) { pos.set(center.id, { x: cx, y: cy }); labels.set(center.id, { x: cx, y: cy + 21, anchor: 'middle' }); }
  const n = rest.length;
  rest.forEach((node, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    pos.set(node.id, { x, y });
    const c = Math.cos(a);
    const anchor = c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle';
    const lx = anchor === 'start' ? x + 12 : anchor === 'end' ? x - 12 : x;
    const ly = anchor === 'middle' ? (Math.sin(a) < 0 ? y - 12 : y + 20) : y + 4;
    labels.set(node.id, { x: lx, y: ly, anchor });
  });
  // Resolve any remaining label overlaps by nudging vertically.
  const boxes = rest.map(node => {
    const l = labels.get(node.id)!; const w = textW(trunc(node.name, maxChars), fs);
    return { id: node.id, w, l };
  });
  const left = (b: { w: number; l: LabelPos }) => (b.l.anchor === 'start' ? b.l.x : b.l.anchor === 'end' ? b.l.x - b.w : b.l.x - b.w / 2);
  for (let it = 0; it < 40; it++) {
    let moved = false;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (left(a) < left(b) + b.w + 2 && left(b) < left(a) + a.w + 2 && Math.abs(a.l.y - b.l.y) < fs + 2) {
        const d = (fs + 2 - Math.abs(a.l.y - b.l.y)) / 2 + 0.5;
        const up = a.l.y <= b.l.y ? -1 : 1;
        a.l.y += up * d; b.l.y -= up * d; moved = true;
      }
    }
    if (!moved) break;
  }
  boxes.forEach(b => { b.l.y = Math.min(H - 3, Math.max(fs, b.l.y)); });
  return { pos, labels };
}

/** Separate node+label rectangles so no two nodes' labels overlap (full/interactive layout). */
function relaxRects(sn: { id: string; name: string; label: GraphNodeLabel; x: number; y: number }[], W: number, H: number, fs: number, pad: number) {
  const w = (n: { name: string; label: GraphNodeLabel }) => Math.max(22, textW(trunc(n.name, n.label === 'Memory' ? 11 : 8), fs));
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = 0; i < sn.length; i++) for (let j = i + 1; j < sn.length; j++) {
      const a = sn[i], b = sn[j];
      const ox = (w(a) + w(b)) / 2 + 6 - Math.abs(a.x - b.x);
      const oy = fs + 20 - Math.abs(a.y - b.y);
      if (ox > 0 && oy > 0) {
        moved = true;
        if (oy < ox) { const s = a.y <= b.y ? -1 : 1; a.y += s * oy / 2; b.y -= s * oy / 2; }
        else { const s = a.x <= b.x ? -1 : 1; a.x += s * ox / 2; b.x -= s * ox / 2; }
      }
    }
    sn.forEach(n => { const hw = w(n) / 2; n.x = Math.min(W - Math.max(pad, hw + 2), Math.max(Math.max(pad, hw + 2), n.x)); n.y = Math.min(H - pad - 6, Math.max(pad, n.y)); });
    if (!moved) break;
  }
}

export function MemoryGraph({ nodes, edges, highlightIds, height, interactive, compact, large, labelMode = 'all' }: {
  nodes: GraphNode[]; edges: GraphEdge[]; highlightIds?: string[]; height?: number; interactive?: boolean; compact?: boolean; large?: boolean; labelMode?: 'all' | 'focus';
}) {
  const t = useT();
  const rel = (type: string) => (REL_IDS.has(type) ? t(`rel.graph.${type}`) : type);
  const H = height ?? (compact ? 220 : 280);
  const fs = large ? (compact ? 14 : 15) : (compact ? 12 : 13);
  const maxChars = large && compact ? 6 : 8;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodes = useRef<SimNode[]>([]);
  const [, force] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const dragging = useRef<string | null>(null);
  const labelRef = useRef<Map<string, LabelPos>>(new Map());

  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(160, el.clientWidth)));
    ro.observe(el); setW(Math.max(160, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const hiKey = (highlightIds ?? []).join('|');
  const hiSet = useMemo(() => new Set(highlightIds ?? []), [hiKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hiKey) { setPulse(false); return; }
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 2200);
    return () => clearTimeout(t);
  }, [hiKey]);

  const graphKey = nodes.map(n => n.id).join('|') + '#' + edges.map(e => e.id).join('|');
  const pad = 26;

  useEffect(() => {
    simRef.current?.stop();
    const ids = new Set(nodes.map(n => n.id));
    if (compact) {
      const { pos: rp, labels } = radialLayout(nodes, edges, W, H, fs, maxChars);
      labelRef.current = labels;
      rp.forEach((p, id) => posRef.current.set(id, p));
      simNodes.current = []; simRef.current = null;
      linksRef.current = edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ id: e.id, type: e.type, source: e.source, target: e.target }));
      force(v => v + 1);
      return;
    }
    const sn: SimNode[] = nodes.map(n => {
      const prev = posRef.current.get(n.id);
      return {
        id: n.id, label: n.label, name: n.name,
        x: prev?.x ?? W / 2 + (hash(n.id) - 0.5) * W * 0.6,
        y: prev?.y ?? H / 2 + (hash(n.id + 'y') - 0.5) * H * 0.6,
      };
    });
    const sl: SimLink[] = edges.filter(e => ids.has(e.source) && ids.has(e.target)).map(e => ({ id: e.id, type: e.type, source: e.source, target: e.target }));
    const dist = compact ? 46 : 62;
    const sim = forceSimulation<SimNode>(sn)
      .force('link', forceLink<SimNode, SimLink>(sl).id(d => d.id).distance(dist).strength(0.6))
      .force('charge', forceManyBody<SimNode>().strength(compact ? -110 : -170))
      .force('x', forceX<SimNode>(W / 2).strength(0.08))
      .force('y', forceY<SimNode>(H / 2).strength(0.12))
      .force('collide', forceCollide<SimNode>(d => Math.min(34, Math.max(20, textW(trunc(d.name, 8), fs) / 2.4))))
      .stop();
    for (let i = 0; i < 260; i++) sim.tick();
    relaxRects(sn, W, H, fs, pad);
    simNodes.current = sn; linksRef.current = sl;
    sn.forEach(n => posRef.current.set(n.id, { x: n.x, y: n.y }));
    sim.on('tick', () => {
      simNodes.current.forEach(n => posRef.current.set(n.id, { x: n.x, y: n.y }));
      force(v => v + 1);
    });
    simRef.current = sim;
    force(v => v + 1);
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, Math.round(W / 40), H, compact, large]);

  const linksRef = useRef<SimLink[]>([]);

  const clamp = useCallback((x: number, y: number) => ({
    x: Math.min(W - pad, Math.max(pad, x)), y: Math.min(H - pad, Math.max(pad, y)),
  }), [W, H]);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    if (!interactive) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragging.current = id;
    const n = simNodes.current.find(x => x.id === id); if (n) { n.fx = n.x; n.fy = n.y; }
    simRef.current?.alphaTarget(0.25).restart();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const id = dragging.current; if (!id) return;
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const p = clamp(e.clientX - rect.left, e.clientY - rect.top);
    const n = simNodes.current.find(x => x.id === id); if (n) { n.fx = p.x; n.fy = p.y; }
  };
  const onPointerUp = () => {
    const id = dragging.current; if (!id) return;
    dragging.current = null;
    const n = simNodes.current.find(x => x.id === id); if (n) { n.fx = null; n.fy = null; }
    simRef.current?.alphaTarget(0);
  };

  const pos = (id: string) => {
    const p = posRef.current.get(id) ?? { x: W / 2, y: H / 2 };
    return clamp(p.x, p.y);
  };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const links = linksRef.current;
  const hovered = hover ? byId.get(hover) : undefined;
  const connectedToHover = new Set<string>();
  if (hover) links.forEach(l => {
    const s = typeof l.source === 'string' ? l.source : l.source.id; const t = typeof l.target === 'string' ? l.target : l.target.id;
    if (s === hover) connectedToHover.add(t); if (t === hover) connectedToHover.add(s);
  });
  const usedLabels = new Set(nodes.map(n => n.label));

  return (
    <div className={`mg ${compact ? 'mg-compact' : ''} ${large ? 'mg-large' : ''} ${interactive ? 'mg-interactive' : ''}`} ref={wrapRef}>
      <svg className="mg-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={t('graph.aria', { nodes: nodes.length, edges: edges.length })}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <g>
          {links.map(l => {
            const s = typeof l.source === 'string' ? l.source : l.source.id; const t = typeof l.target === 'string' ? l.target : l.target.id;
            const a = pos(s), b = pos(t);
            const hi = hiSet.has(l.id);
            const active = hover && (s === hover || t === hover);
            return (
              <g key={l.id} className={hi ? 'mg-fade' : undefined}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`mg-edge ${active ? 'mg-edge-on' : ''} ${hi && pulse ? 'mg-edge-hi' : ''}`} />
                {interactive && active && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 3} className="mg-rel" textAnchor="middle">{rel(l.type)}</text>
                )}
              </g>
            );
          })}
        </g>
        <g>
          {nodes.map(n => {
            const p = pos(n.id);
            const hi = hiSet.has(n.id);
            const dim = hover && hover !== n.id && !connectedToHover.has(n.id);
            const isMem = n.label === 'Memory';
            return (
              <g key={n.id} transform={`translate(${p.x},${p.y})`} className={`mg-node ${hi ? 'mg-fade' : ''} ${dim ? 'mg-dim' : ''} ${interactive ? 'mg-grab' : ''}`}
                onPointerDown={e => onPointerDown(e, n.id)} onPointerEnter={() => interactive && setHover(n.id)} onPointerLeave={() => setHover(null)}>
                {interactive && large && <circle r={16} className="mg-hit" />}
                {hi && pulse && <circle r={16} className="mg-pulse" />}
                <Shape label={n.label} />
                {(() => {
                  const lp = compact ? labelRef.current.get(n.id) : undefined;
                  const cls = isMem ? 'mg-label mg-label-mem' : 'mg-label';
                  const txt = trunc(n.name, compact ? (isMem ? (large ? 9 : 7) : maxChars) : isMem ? 11 : 8);
                  // Compact: the card title above already names the centre memory, so its label never competes for space.
                  if (compact && isMem) return <title>{n.name}</title>;
                  if (labelMode === 'focus' && !isMem && !hi && hover !== n.id) return <title>{n.name}</title>;
                  return lp
                    ? <text x={lp.x - p.x} y={lp.y - p.y} textAnchor={lp.anchor} className={cls}>{txt}<title>{n.name}</title></text>
                    : <text y={isMem ? 22 : n.label === 'Emotion' ? 16 : 20} textAnchor="middle" className={cls}>{txt}<title>{n.name}</title></text>;
                })()}
              </g>
            );
          })}
        </g>
        {interactive && hovered && (() => {
          const p = pos(hovered.id);
          const w = Math.max(40, hovered.name.length * (large ? 13 : 11) + 16);
          const tx = Math.min(W - w / 2 - 2, Math.max(w / 2 + 2, p.x));
          return (
            <g transform={`translate(${tx},${Math.max(14, p.y - 28)})`} pointerEvents="none">
              <rect x={-w / 2} y={-11} width={w} height={22} rx={6} className="mg-tip" />
              <text textAnchor="middle" y={4} className="mg-tip-text">{hovered.name}</text>
            </g>
          );
        })()}
      </svg>
      <ul className="sr-only mg-text" aria-label={t('graph.list')}>
        {edges.map(e => <li key={e.id}>{byId.get(e.source)?.name ?? e.source} → {byId.get(e.target)?.name ?? e.target} ({rel(e.type)})</li>)}
      </ul>
      {nodes.length === 0 && <div className="mg-empty">{t('graph.empty')}</div>}
      {!compact && (
        <ul className="mg-legend" aria-label={t('graph.legend')}>
          {LABELS.filter(l => usedLabels.has(l) || nodes.length === 0).map(l => (
            <li key={l}>
              <svg width="20" height="16" viewBox="-10 -8 20 16" aria-hidden><Shape label={l} r={0.8} /></svg>
              <span>{t(`node.${l}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
