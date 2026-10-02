// Plain 2D geometry for figure layout. Rects are { x, y, w, h } with a top-left
// origin; points are { x, y }.

export const rect = (x, y, w, h) => ({ x, y, w, h });

export const inflate = (r, px, py = px) => ({ x: r.x - px, y: r.y - py, w: r.w + px * 2, h: r.h + py * 2 });

export function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function union(rects) {
  const list = rects.filter(Boolean);
  if (!list.length) return rect(0, 0, 0, 0);
  const x0 = Math.min(...list.map((r) => r.x));
  const y0 = Math.min(...list.map((r) => r.y));
  const x1 = Math.max(...list.map((r) => r.x + r.w));
  const y1 = Math.max(...list.map((r) => r.y + r.h));
  return rect(x0, y0, x1 - x0, y1 - y0);
}

// Liang-Barsky: does segment p→q pass through rect r?
export function segmentHitsRect(p, q, r) {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const edges = [[-dx, p.x - r.x], [dx, r.x + r.w - p.x], [-dy, p.y - r.y], [dy, r.y + r.h - p.y]];
  for (const [pp, qq] of edges) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export const pathHitsRect = (pts, r) => pts.some((p, i) => i > 0 && segmentHitsRect(pts[i - 1], p, r));

export const pathLength = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);

// The point at fraction t of a polyline's length, plus the unit direction there.
export function pointAlong(pts, t) {
  const total = pathLength(pts) || 1;
  let left = total * t;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i === pts.length - 1) {
      const f = len ? Math.min(left / len, 1) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ux: len ? (b.x - a.x) / len : 1, uy: len ? (b.y - a.y) / len : 0 };
    }
    left -= len;
  }
  return { x: pts[0].x, y: pts[0].y, ux: 1, uy: 0 };
}

// Where a ray from a node's center toward `to` leaves the node, plus `gap`.
export function rimPoint(node, to, gap = 9) {
  const dx = to.x - node.x, dy = to.y - node.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  if (node.shape === 'box') {
    const hw = node.w / 2, hh = node.h / 2;
    const t = Math.min(ux ? hw / Math.abs(ux) : Infinity, uy ? hh / Math.abs(uy) : Infinity);
    return { x: node.x + ux * (t + gap), y: node.y + uy * (t + gap) };
  }
  const r = node.d / 2 + gap;
  return { x: node.x + ux * r, y: node.y + uy * r };
}

// A quadratic bend through the perpendicular offset `curve` (fraction of the
// chord length), sampled as a polyline so every consumer treats it as a path.
export function bend(a, b, curve, steps = 24) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const c = { x: mx + nx * curve * len * 2, y: my + ny * curve * len * 2 };
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return { pts: out, control: c };
}

export const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

export function angleGap(a, b) {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}
