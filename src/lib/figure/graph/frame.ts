// After layout: group containers for the fixed layouts, the fit of the whole
// drawing into the canvas, and the warnings a reviewer would otherwise only
// catch by looking.
import { inflate, overlapArea, pathHitsRect, rect, union, type Rect } from '../geom.ts';
import type { Dimensions } from '../palette.ts';
import type { Graph, GraphGroup, GraphNode } from './model.ts';
import { nodeRect } from './place.ts';

export interface GroupPad {
  top: number;
  side: number;
}

export function groupRectsGeo(G: Graph, pad: GroupPad): void {
  const depth = (g: GraphGroup): number => { let d = 0; for (let p = g.parent; p; p = G.groups.find((x) => x.id === p)?.parent) d++; return d; };
  const order = G.groups.toSorted((a, b) => depth(b) - depth(a));
  for (const g of order) {
    const members = G.nodes.filter((n) => n.group === g.id).flatMap((n) => [nodeRect(n), n.labelRect]);
    const kids = G.groups.filter((k) => k.parent === g.id).map((k) => k.rect);
    const inner = union([...members, ...kids]);
    g.rect = rect(inner.x - pad.side, inner.y - pad.top, inner.w + pad.side * 2, inner.h + pad.top + pad.side);
  }
}

// Every painted rect, plus the link paths, in layout units.
export function contentBounds(G: Graph): Rect {
  const rects: Rect[] = [];
  for (const n of G.nodes) { rects.push(nodeRect(n)); if (n.labelRect) rects.push(n.labelRect); }
  for (const l of G.links) {
    if (l.chipRect) rects.push(l.chipRect);
    for (const e of l.endRects || []) rects.push(e.r);
    for (const p of l.pts) rects.push(rect(p.x - 6, p.y - 6, 12, 12));
  }
  for (const g of G.groups) if (g.rect) rects.push(g.rect);
  return union(rects);
}

// Scale and center the drawing. An explicit size is a frame to fit into. With
// no size the drawing sets the canvas: up to 1600 wide (no narrower than 1100)
// and as tall as it needs, up to 2000.
const FRAME = { margin: 76, maxW: 1600, minW: 1100, minH: 440, maxH: 2000 };

export interface FitOptions {
  sizePx: Dimensions | null;
  fit: boolean;
}

export interface Frame {
  W: number;
  H: number;
  /** Scale of the drawing into the canvas. */
  s: number;
  tx: number;
  ty: number;
  titleScale?: number;
}

export function fitFrame(B: Rect, opts: FitOptions, titleBand: number, titleW = 0): Frame {
  const m = FRAME.margin;
  const bw = Math.max(B.w, 1), bh = Math.max(B.h, 1);
  if (opts.sizePx) {
    const [W, H] = opts.sizePx;
    const aw = W - m * 2, ah = H - m * 2 - titleBand;
    const s = opts.fit ? Math.min(aw / bw, ah / bh, 1.35) : 1;
    return { W, H, s, tx: m + (aw - bw * s) / 2 - B.x * s, ty: m + titleBand + (ah - bh * s) / 2 - B.y * s };
  }
  let s = Math.min(1.15, (FRAME.maxW - m * 2) / bw);
  if (bh * s + m * 2 + titleBand > FRAME.maxH) s = (FRAME.maxH - m * 2 - titleBand) / bh;
  const W = Math.round(Math.min(FRAME.maxW, Math.max(FRAME.minW, bw * s + m * 2, titleW + m * 2)));
  const H = Math.round(Math.max(FRAME.minH, bh * s + m * 2 + titleBand));
  const ah = H - m * 2 - titleBand;
  return { W, H, s, tx: (W - bw * s) / 2 - B.x * s, ty: m + titleBand + (ah - bh * s) / 2 - B.y * s };
}

export function collectWarnings(G: Graph, s: number): string[] {
  const warn: string[] = [];
  const name = (n: GraphNode): string => `"${n.label.split('\n')[0]}"`;
  const lname = (l: { from: string; to: string }): string => `${l.from} → ${l.to}`;
  const labels = G.nodes.flatMap((n) => (n.labelRect ? [{ n, r: n.labelRect }] : []));
  for (const [i, { n, r }] of labels.entries()) {
    for (const other of labels.slice(i + 1)) {
      if (overlapArea(r, other.r) > 4) warn.push(`labels ${name(n)} and ${name(other.n)} overlap`);
    }
    const probe = inflate(r, -2);
    if (!n.labelBadge) for (const l of G.links) if (l.pts.length > 1 && pathHitsRect(l.pts, probe)) warn.push(`label ${name(n)} crosses link ${lname(l)}`);
    for (const o of G.nodes) if (o !== n && overlapArea(probe, nodeRect(o)) > 4) warn.push(`label ${name(n)} overlaps node ${name(o)}`);
  }
  const chipped = G.links.flatMap((l) => (l.chipRect ? [{ l, r: l.chipRect }] : []));
  for (const { l, r } of chipped) {
    const probe = inflate(r, -2);
    for (const o of G.nodes) {
      if (overlapArea(probe, nodeRect(o)) > 4) warn.push(`label on ${lname(l)} overlaps node ${name(o)}`);
      if (o.labelRect && overlapArea(probe, o.labelRect) > 4) warn.push(`label on ${lname(l)} overlaps label ${name(o)}`);
    }
    for (const k of chipped) if (k.l !== l && k.l.id > l.id && overlapArea(probe, k.r) > 4) warn.push(`labels on ${lname(l)} and ${lname(k.l)} overlap`);
  }
  const ends = G.links.flatMap((l) => (l.endRects || []).map((e) => ({ ...e, l })));
  for (const e of ends) {
    const probe = inflate(e.r, -2);
    for (const { l, r } of chipped) if (overlapArea(probe, r) > 4) warn.push(`endpoint label "${e.text}" overlaps the label on ${lname(l)}`);
    for (const n of G.nodes) {
      if (overlapArea(probe, nodeRect(n)) > 4) warn.push(`endpoint label "${e.text}" overlaps node ${name(n)}`);
      if (n.labelRect && overlapArea(probe, n.labelRect) > 4) warn.push(`endpoint label "${e.text}" overlaps label ${name(n)}`);
    }
  }
  for (const g of G.groups) {
    if (!g.labelRect || g.labelBadge) continue;
    const probe = inflate(g.labelRect, -1);
    for (const l of G.links) if (l.pts.length > 1 && pathHitsRect(l.pts, probe)) warn.push(`group label "${g.label}" crosses link ${lname(l)}`);
  }
  for (const g of G.groups) {
    if (!g.rect) continue;
    const inside = (n: GraphNode): boolean => { for (let p = n.group; p; p = G.groups.find((x) => x.id === p)?.parent) if (p === g.id) return true; return false; };
    for (const n of G.nodes) if (!inside(n) && overlapArea(inflate(g.rect, -2), nodeRect(n)) > 4) warn.push(`group "${g.label}" covers node ${name(n)}, which is not in it`);
  }
  warn.push(...(G.notes || []));
  if (s < 0.7) warn.push(`text renders at ${Math.round(s * 100)}% to fit the frame; drop the size, shorten labels, or split the figure`);
  return [...new Set(warn)];
}
