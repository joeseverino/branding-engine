// Label placement for the fixed-geometry layouts: link chips slide along their
// link, then each node label takes the candidate spot that collides with the
// least (paths, nodes, chips, other labels) and faces away from its links.
import { required } from '../../guards.ts';
import { angleGap, angleOf, inflate, overlapArea, pathHitsRect, pathLength, pointAlong, rect, segments, type Rect, type Size } from '../geom.ts';
import type { LabelPos } from '../spec.ts';
import type { Graph, GraphGroup, GraphLink, GraphNode } from './model.ts';
import { METRICS } from './parts.ts';

export const nodeRect = (n: GraphNode): Rect => (n.shape === 'box'
  ? rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h)
  : rect(n.x - n.d / 2, n.y - n.d / 2, n.d, n.d));

function cheapest<T extends { cost: number }>(candidates: readonly T[]): T {
  return candidates.reduce((best, c) => (c.cost < best.cost ? c : best));
}

const T_STEPS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];

export function placeChips(G: Graph, { only }: { only?: (l: GraphLink) => boolean } = {}): void {
  const placed = G.links.flatMap((l) => (l.chipRect && !(only && only(l)) ? [l.chipRect] : []));
  const nodeRects = G.nodes.map((n) => inflate(nodeRect(n), 10));
  for (const l of G.links) {
    if (only && !only(l)) continue;
    if (!l.label || !l.chipSize || l.pts.length < 2) continue;
    const { w, h } = l.chipSize;
    const best = cheapest(T_STEPS.map((t) => {
      const p = pointAlong(l.pts, t);
      const r = rect(p.x - w / 2, p.y - h / 2, w, h);
      let cost = Math.abs(t - 0.5) * 60;
      for (const nr of nodeRects) { const a = overlapArea(r, nr); if (a) cost += 1000 + a; }
      for (const pr of placed) { const a = overlapArea(inflate(r, 6), pr); if (a) cost += 1000 + a; }
      for (const o of G.links) if (o !== l && o.pts.length > 1 && pathHitsRect(o.pts, r)) cost += 300;
      return { cost, r };
    }));
    l.chipRect = best.r;
    placed.push(best.r);
  }
}

// Candidate spots around a node: [name, direction angle, base preference].
type Spot = Exclude<LabelPos, 'auto'>;
type Align = 'left' | 'center' | 'right';
const CANDIDATES: ReadonlyArray<readonly [name: Spot, angle: number, preference: number]> = [
  ['below', Math.PI / 2, 0], ['above', -Math.PI / 2, 4], ['right', 0, 6], ['left', Math.PI, 6],
  ['se', Math.PI / 4, 9], ['sw', (3 * Math.PI) / 4, 9], ['ne', -Math.PI / 4, 9], ['nw', (-3 * Math.PI) / 4, 9],
];

function labelRectAt(n: GraphNode, pos: Spot): { r: Rect; align: Align } {
  const { w, h } = required(n.labelSize, `the label size of "${n.id}"`);
  const g = METRICS.labelGap;
  const hw = n.shape === 'box' ? n.w / 2 : n.d / 2;
  const hh = n.shape === 'box' ? n.h / 2 : n.d / 2;
  const k = n.shape === 'box' ? 1 : Math.SQRT1_2; // circle diagonals touch the rim at 45°
  switch (pos) {
    case 'above': return { r: rect(n.x - w / 2, n.y - hh - g - h, w, h), align: 'center' };
    case 'right': return { r: rect(n.x + hw + g, n.y - h / 2, w, h), align: 'left' };
    case 'left': return { r: rect(n.x - hw - g - w, n.y - h / 2, w, h), align: 'right' };
    case 'se': return { r: rect(n.x + hw * k + g * 0.4, n.y + hh * k + g * 0.4, w, h), align: 'left' };
    case 'sw': return { r: rect(n.x - hw * k - g * 0.4 - w, n.y + hh * k + g * 0.4, w, h), align: 'right' };
    case 'ne': return { r: rect(n.x + hw * k + g * 0.4, n.y - hh * k - g * 0.4 - h, w, h), align: 'left' };
    case 'nw': return { r: rect(n.x - hw * k - g * 0.4 - w, n.y - hh * k - g * 0.4 - h, w, h), align: 'right' };
    case 'below': return { r: rect(n.x - w / 2, n.y + hh + g, w, h), align: 'center' };
  }
}

function linkAngles(G: Graph, n: GraphNode): number[] {
  const out: number[] = [];
  for (const l of G.links) {
    const [, second] = l.pts;
    const penultimate = l.pts.at(-2);
    if (!second || !penultimate) continue;
    if (l.from === n.id) out.push(angleOf(n, second));
    if (l.to === n.id) out.push(angleOf(n, penultimate));
  }
  return out;
}

export function placeLabels(G: Graph): void {
  const labelled = G.nodes.filter((n) => n.shape === 'circle' && n.labelSize);
  const nodeRects = new Map(G.nodes.map((n) => [n.id, inflate(nodeRect(n), 6)]));
  const chips = G.links.flatMap((l) => (l.chipRect ? [inflate(l.chipRect, 6)] : []));
  const placed: Rect[] = [];
  const deg = (n: GraphNode): number => G.links.filter((l) => l.from === n.id || l.to === n.id).length;
  const order = labelled.toSorted((a, b) => deg(b) - deg(a) || a.index - b.index);

  for (const n of order) {
    if (n.labelAt) {
      const { w, h } = required(n.labelSize, `the label size of "${n.id}"`);
      n.labelRect = rect(n.x + n.labelAt[0] - w / 2, n.y + n.labelAt[1] - h / 2, w, h);
      n.labelAlign = 'center';
      placed.push(n.labelRect);
      continue;
    }
    n.labelBadge = false;
    const angles = linkAngles(G, n);
    const score = (candidates: typeof CANDIDATES, linePenalty: number) => cheapest(candidates.map(([name, dirAngle, pref]) => {
      const { r, align } = labelRectAt(n, name);
      const probe = inflate(r, 8);
      let cost = pref;
      if (angles.length) cost += ((Math.PI - Math.min(...angles.map((a) => angleGap(a, dirAngle)))) / Math.PI) * 8;
      for (const l of G.links) if (l.pts.length > 1 && pathHitsRect(l.pts, probe)) cost += linePenalty;
      for (const [id, nr] of nodeRects) { if (id === n.id) continue; const a = overlapArea(probe, nr); if (a) cost += 800 + a; }
      for (const cr of chips) { const a = overlapArea(probe, cr); if (a) cost += 800 + a; }
      for (const pr of placed) { const a = overlapArea(probe, pr); if (a) cost += 800 + a; }
      return { cost, r, align };
    }));
    let best = score(n.labelPos ? CANDIDATES.filter(([name]) => name === n.labelPos) : CANDIDATES, 1000);
    // No spot clears every line (a crowded hub): drop the line penalty, take the
    // spot that clears nodes, chips and labels, and give the label a chip
    // background so it reads over the line beneath it.
    if (best.cost >= 1000 && !n.labelPos) {
      const alt = score(CANDIDATES, 20);
      if (alt.cost < 800) { best = alt; n.labelBadge = true; }
    }
    n.labelRect = best.r;
    n.labelAlign = best.align;
    placed.push(best.r);
  }
}

// Endpoint labels (an address under each end of a link) sit just past the
// arrowhead on the side of the line that faces down (or right, if vertical).
export function placeEndLabels(G: Graph): void {
  for (const l of G.links) {
    l.endRects = [];
    if (l.pts.length < 2) continue;
    const ends: Array<[string | undefined, Size | undefined, number, number]> = [[l.fromLabel, l.fromSize, 0.0, 1], [l.toLabel, l.toSize, 1.0, -1]];
    for (const [text, size, t, sgn] of ends) {
      if (!text || !size) continue;
      const total = pathLength(l.pts) || 1;
      const p = pointAlong(l.pts, Math.min(Math.max(t + (sgn * (size.w / 2 + 18)) / total, 0), 1));
      let nx = -p.uy, ny = p.ux;
      if (ny < -0.2 || (Math.abs(ny) <= 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
      const off = 12 + Math.abs(nx) * (size.w / 2) + Math.abs(ny) * (size.h / 2);
      const cx = p.x + nx * off, cy = p.y + ny * off;
      l.endRects.push({ text, r: rect(cx - size.w / 2, cy - size.h / 2, size.w, size.h) });
    }
  }
}

// A group's label sits in the band along its top edge, as far left as it can
// without a link crossing it. With no clear spot it stays at the left and gets
// a chip background, the same treatment as a crowded node label.
export interface LabelledGroups {
  groups: Array<Pick<GraphGroup, 'id' | 'label' | 'rect' | 'labelRect' | 'labelBadge'>>;
  links: Array<Pick<GraphLink, 'pts'>>;
}

export function placeGroupLabels(G: LabelledGroups, sizes: ReadonlyMap<string, Size>, ts: number): void {
  const inset = 30 * ts, top = 26 * ts, pad = 14;
  const paths = G.links.filter((l) => l.pts.length > 1);
  for (const g of G.groups) {
    g.labelRect = undefined;
    g.labelBadge = false;
    if (!g.rect || !g.label || !sizes.has(g.id)) continue;
    const { w, h } = required(sizes.get(g.id), `the label size of group "${g.id}"`);
    const x0 = g.rect.x + inset, x1 = g.rect.x + g.rect.w - inset - w;
    const y = g.rect.y + top;
    const at = (x: number): Rect => rect(x, y, w, h);
    const clear = (x: number): boolean => !paths.some((l) => pathHitsRect(l.pts, inflate(at(x), pad, 6)));
    // Candidate lefts: the inset, and just past each place a link crosses the band.
    const band = rect(x0, y - 6, Math.max(x1 - x0, 0) + w, h + 12);
    const xs: number[] = [x0];
    for (const l of paths) {
      for (const [p, q] of segments(l.pts)) {
        if (!pathHitsRect([p, q], band)) continue;
        xs.push(Math.max(p.x, q.x) + pad + 2);
      }
    }
    const x = xs.filter((v) => v <= x1 + 0.5).sort((a, b) => a - b).find(clear);
    if (x !== undefined) g.labelRect = at(x);
    else { g.labelRect = at(x0); g.labelBadge = true; }
  }
}
