// After layout: group containers for the fixed layouts, the fit of the whole
// drawing into the canvas, and the warnings a reviewer would otherwise only
// catch by looking.
import { inflate, overlapArea, pathHitsRect, rect, union } from '../geom.mjs';
import { nodeRect } from './place.mjs';

export function groupRectsGeo(G, pad) {
  const depth = (g) => { let d = 0; for (let p = g.parent; p; p = G.groups.find((x) => x.id === p)?.parent) d++; return d; };
  const order = [...G.groups].sort((a, b) => depth(b) - depth(a));
  for (const g of order) {
    const members = G.nodes.filter((n) => n.group === g.id).flatMap((n) => [nodeRect(n), n.labelRect]);
    const kids = G.groups.filter((k) => k.parent === g.id).map((k) => k.rect);
    const inner = union([...members, ...kids]);
    g.rect = rect(inner.x - pad.side, inner.y - pad.top, inner.w + pad.side * 2, inner.h + pad.top + pad.side);
  }
}

// Every painted rect, plus the link paths, in layout units.
export function contentBounds(G) {
  const rects = [];
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
export const FRAME = { margin: 76, maxW: 1600, minW: 1100, minH: 440, maxH: 2000 };

export function fitFrame(B, opts, titleBand, titleW = 0) {
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

export function collectWarnings(G, s) {
  const warn = [];
  const name = (n) => `"${n.label.split('\n')[0]}"`;
  const lname = (l) => `${l.from} → ${l.to}`;
  const labels = G.nodes.filter((n) => n.labelRect);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (overlapArea(labels[i].labelRect, labels[j].labelRect) > 4) warn.push(`labels ${name(labels[i])} and ${name(labels[j])} overlap`);
    }
    const n = labels[i];
    const probe = inflate(n.labelRect, -2);
    if (!n.labelBadge) for (const l of G.links) if (l.pts.length > 1 && pathHitsRect(l.pts, probe)) warn.push(`label ${name(n)} crosses link ${lname(l)}`);
    for (const o of G.nodes) if (o !== n && overlapArea(probe, nodeRect(o)) > 4) warn.push(`label ${name(n)} overlaps node ${name(o)}`);
  }
  const chipped = G.links.filter((l) => l.chipRect);
  for (const l of chipped) {
    const probe = inflate(l.chipRect, -2);
    for (const o of G.nodes) {
      if (overlapArea(probe, nodeRect(o)) > 4) warn.push(`label on ${lname(l)} overlaps node ${name(o)}`);
      if (o.labelRect && overlapArea(probe, o.labelRect) > 4) warn.push(`label on ${lname(l)} overlaps label ${name(o)}`);
    }
    for (const k of chipped) if (k !== l && k.id > l.id && overlapArea(probe, k.chipRect) > 4) warn.push(`labels on ${lname(l)} and ${lname(k)} overlap`);
  }
  const ends = G.links.flatMap((l) => (l.endRects || []).map((e) => ({ ...e, l })));
  for (const e of ends) {
    const probe = inflate(e.r, -2);
    for (const l of chipped) if (overlapArea(probe, l.chipRect) > 4) warn.push(`endpoint label "${e.text}" overlaps the label on ${lname(l)}`);
    for (const n of G.nodes) {
      if (overlapArea(probe, nodeRect(n)) > 4) warn.push(`endpoint label "${e.text}" overlaps node ${name(n)}`);
      if (n.labelRect && overlapArea(probe, n.labelRect) > 4) warn.push(`endpoint label "${e.text}" overlaps label ${name(n)}`);
    }
  }
  for (const g of G.groups) {
    if (!g.rect) continue;
    const inside = (n) => { for (let p = n.group; p; p = G.groups.find((x) => x.id === p)?.parent) if (p === g.id) return true; return false; };
    for (const n of G.nodes) if (!inside(n) && overlapArea(inflate(g.rect, -2), nodeRect(n)) > 4) warn.push(`group "${g.label}" covers node ${name(n)}, which is not in it`);
  }
  warn.push(...(G.notes || []));
  if (s < 0.7) warn.push(`text renders at ${Math.round(s * 100)}% to fit the frame; drop the size, shorten labels, or split the figure`);
  return [...new Set(warn)];
}
