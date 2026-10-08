// Plain 2D geometry for figure layout. Rects are { x, y, w, h } with a top-left
// origin; points are { x, y }.
import { required } from '../guards.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

/** A point on a path with the unit direction of travel there. */
export interface PathPoint extends Point {
  ux: number;
  uy: number;
}

/** What a link end attaches to: a circle node or a box (a box node or a group). */
export type Body =
  | (Point & { shape: 'circle'; d: number })
  | (Point & { shape: 'box'; w: number; h: number });

export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

export const inflate = (r: Rect, px: number, py = px): Rect => ({ x: r.x - px, y: r.y - py, w: r.w + px * 2, h: r.h + py * 2 });

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function union(rects: ReadonlyArray<Rect | undefined>): Rect {
  const list = rects.filter((r): r is Rect => r !== undefined);
  if (!list.length) return rect(0, 0, 0, 0);
  const x0 = Math.min(...list.map((r) => r.x));
  const y0 = Math.min(...list.map((r) => r.y));
  const x1 = Math.max(...list.map((r) => r.x + r.w));
  const y1 = Math.max(...list.map((r) => r.y + r.h));
  return rect(x0, y0, x1 - x0, y1 - y0);
}

// Liang-Barsky: does segment p→q pass through rect r?
export function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  const edges: Array<[number, number]> = [[-dx, p.x - r.x], [dx, r.x + r.w - p.x], [-dy, p.y - r.y], [dy, r.y + r.h - p.y]];
  for (const [pp, qq] of edges) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const t = qq / pp;
    if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

export function* segments(pts: readonly Point[]): Generator<readonly [from: Point, to: Point]> {
  let prev: Point | undefined;
  for (const p of pts) {
    if (prev) yield [prev, p];
    prev = p;
  }
}

export function pathHitsRect(pts: readonly Point[], r: Rect): boolean {
  for (const [p, q] of segments(pts)) if (segmentHitsRect(p, q, r)) return true;
  return false;
}

export function pathLength(pts: readonly Point[]): number {
  let sum = 0;
  for (const [a, b] of segments(pts)) sum += Math.hypot(b.x - a.x, b.y - a.y);
  return sum;
}

export function pointAlong(pts: readonly Point[], t: number): PathPoint {
  const total = pathLength(pts) || 1;
  let left = total * t;
  const legs = [...segments(pts)];
  for (const [i, [a, b]] of legs.entries()) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || i === legs.length - 1) {
      const f = len ? Math.min(left / len, 1) : 0;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, ux: len ? (b.x - a.x) / len : 1, uy: len ? (b.y - a.y) / len : 0 };
    }
    left -= len;
  }
  const first = required(pts[0], 'a path with at least one point');
  return { x: first.x, y: first.y, ux: 1, uy: 0 };
}

// Where a ray from a node's center toward `to` leaves the node, plus `gap`.
export function rimPoint(node: Body, to: Point, gap = 9): Point {
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
export function bend(a: Point, b: Point, curve: number, steps = 24): { pts: Point[]; control: Point } {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  const c = { x: mx + nx * curve * len * 2, y: my + ny * curve * len * 2 };
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return { pts: out, control: c };
}

export const angleOf = (from: Point, to: Point): number => Math.atan2(to.y - from.y, to.x - from.x);

export function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}
