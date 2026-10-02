// Label placement for the fixed-geometry layouts: link chips slide along their
// link, then each node label takes the candidate spot that collides with the
// least (paths, nodes, chips, other labels) and faces away from its links.
import { angleGap, angleOf, inflate, overlapArea, pathHitsRect, pointAlong, rect } from '../geom.mjs';
import { METRICS } from './parts.mjs';

export const nodeRect = (n) => (n.shape === 'box'
  ? rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h)
  : rect(n.x - n.d / 2, n.y - n.d / 2, n.d, n.d));

const T_STEPS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74];

export function placeChips(G) {
  const placed = [];
  const nodeRects = G.nodes.map((n) => inflate(nodeRect(n), 10));
  for (const l of G.links) {
    if (!l.label || !l.chipSize || l.pts.length < 2) continue;
    let best;
    for (const t of T_STEPS) {
      const p = pointAlong(l.pts, t);
      const r = rect(p.x - l.chipSize.w / 2, p.y - l.chipSize.h / 2, l.chipSize.w, l.chipSize.h);
      let cost = Math.abs(t - 0.5) * 60;
      for (const nr of nodeRects) { const a = overlapArea(r, nr); if (a) cost += 1000 + a; }
      for (const pr of placed) { const a = overlapArea(inflate(r, 6), pr); if (a) cost += 1000 + a; }
      for (const o of G.links) if (o !== l && o.pts.length > 1 && pathHitsRect(o.pts, r)) cost += 300;
      if (!best || cost < best.cost) best = { cost, r };
    }
    l.chipRect = best.r;
    placed.push(best.r);
  }
}

// Candidate spots around a node: [name, direction angle, base preference].
const CANDIDATES = [
  ['below', Math.PI / 2, 0], ['above', -Math.PI / 2, 4], ['right', 0, 6], ['left', Math.PI, 6],
  ['se', Math.PI / 4, 9], ['sw', (3 * Math.PI) / 4, 9], ['ne', -Math.PI / 4, 9], ['nw', (-3 * Math.PI) / 4, 9],
];

export function labelRectAt(n, pos) {
  const { w, h } = n.labelSize;
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
    default: return { r: rect(n.x - w / 2, n.y + hh + g, w, h), align: 'center' };
  }
}

function linkAngles(G, n) {
  const out = [];
  for (const l of G.links) {
    if (l.pts.length < 2) continue;
    if (l.from === n.id) out.push(angleOf(n, l.pts[Math.min(1, l.pts.length - 1)]));
    if (l.to === n.id) out.push(angleOf(n, l.pts[Math.max(l.pts.length - 2, 0)]));
  }
  return out;
}

export function placeLabels(G) {
  const labelled = G.nodes.filter((n) => n.shape === 'circle' && n.labelSize);
  const nodeRects = new Map(G.nodes.map((n) => [n.id, inflate(nodeRect(n), 6)]));
  const chips = G.links.filter((l) => l.chipRect).map((l) => inflate(l.chipRect, 6));
  const placed = [];
  const deg = (n) => G.links.filter((l) => l.from === n.id || l.to === n.id).length;
  const order = [...labelled].sort((a, b) => deg(b) - deg(a) || a.index - b.index);

  for (const n of order) {
    if (n.labelAt) {
      const { w, h } = n.labelSize;
      n.labelRect = rect(n.x + n.labelAt[0] - w / 2, n.y + n.labelAt[1] - h / 2, w, h);
      n.labelAlign = 'center';
      placed.push(n.labelRect);
      continue;
    }
    const angles = linkAngles(G, n);
    const options = n.labelPos ? CANDIDATES.filter(([name]) => name === n.labelPos) : CANDIDATES;
    let best;
    for (const [name, dirAngle, pref] of options) {
      const { r, align } = labelRectAt(n, name);
      const probe = inflate(r, 8);
      let cost = pref;
      if (angles.length) cost += ((Math.PI - Math.min(...angles.map((a) => angleGap(a, dirAngle)))) / Math.PI) * 8;
      for (const l of G.links) if (l.pts.length > 1 && pathHitsRect(l.pts, probe)) cost += 1000;
      for (const [id, nr] of nodeRects) { if (id === n.id) continue; const a = overlapArea(probe, nr); if (a) cost += 800 + a; }
      for (const cr of chips) { const a = overlapArea(probe, cr); if (a) cost += 800 + a; }
      for (const pr of placed) { const a = overlapArea(probe, pr); if (a) cost += 800 + a; }
      if (!best || cost < best.cost) best = { cost, r, align };
    }
    n.labelRect = best.r;
    n.labelAlign = best.align;
    placed.push(best.r);
  }
}

// Endpoint labels (an address under each end of a link) sit just past the
// arrowhead on the side of the line that faces down (or right, if vertical).
export function placeEndLabels(G) {
  for (const l of G.links) {
    l.endRects = [];
    if (l.pts.length < 2) continue;
    const ends = [[l.fromLabel, l.fromSize, 0.0, 1], [l.toLabel, l.toSize, 1.0, -1]];
    for (const [text, size, t, sgn] of ends) {
      if (!text || !size) continue;
      const total = l.pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - l.pts[i - 1].x, p.y - l.pts[i - 1].y) : 0), 0) || 1;
      const p = pointAlong(l.pts, Math.min(Math.max(t + (sgn * (size.w / 2 + 18)) / total, 0), 1));
      let nx = -p.uy, ny = p.ux;
      if (ny < -0.2 || (Math.abs(ny) <= 0.2 && nx < 0)) { nx = -nx; ny = -ny; }
      const off = 12 + Math.abs(nx) * (size.w / 2) + Math.abs(ny) * (size.h / 2);
      const cx = p.x + nx * off, cy = p.y + ny * off;
      l.endRects.push({ text, r: rect(cx - size.w / 2, cy - size.h / 2, size.w, size.h) });
    }
  }
}
