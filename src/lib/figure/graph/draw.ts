// Paint a laid-out graph: groups behind, links, chips and labels, then nodes.
// Everything is drawn in layout units inside one stage that the fit transform
// scales into the canvas.
import { pictogramGlyphSvg } from '../../pictogram.ts';
import { union, type Point, type Rect } from '../geom.ts';
import type { Palette } from '../palette.ts';
import type { Frame } from './frame.ts';
import type { BoxNode, CircleNode, Graph, GraphLink } from './model.ts';
import { boxInnerHtml, boxStyle, chipHtml, colorOf, endLabelHtml, fillOf, groupLabelHtml, nodeLabelHtml, titleHtml } from './parts.ts';

const f = (v: number): number => Math.round(v * 100) / 100;
const at = (r: Rect): string => `position:absolute;left:${f(r.x)}px;top:${f(r.y)}px;width:${f(r.w)}px;height:${f(r.h)}px`;

// Polyline with rounded corners, or a smooth curve through the points.
function pathD(pts: readonly Point[], { rounded, smooth }: { rounded?: boolean; smooth?: boolean }): string {
  if (pts.length < 2) return '';
  const P = (p: Point): string => `${f(p.x)} ${f(p.y)}`;
  if (smooth && pts.length > 2) {
    let d = `M${P(pts[0])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C${P(c1)} ${P(c2)} ${P(p2)}`;
    }
    return d;
  }
  if (!rounded || pts.length < 3) return `M${pts.map(P).join(' L')}`;
  let d = `M${P(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(26, l1 / 2, l2 / 2);
    const p = { x: b.x - ((b.x - a.x) / (l1 || 1)) * r, y: b.y - ((b.y - a.y) / (l1 || 1)) * r };
    const q = { x: b.x + ((c.x - b.x) / (l2 || 1)) * r, y: b.y + ((c.y - b.y) / (l2 || 1)) * r };
    d += ` L${P(p)} Q${P(b)} ${P(q)}`;
  }
  return `${d} L${P(pts[pts.length - 1])}`;
}

function linkSvg(l: GraphLink, c: Palette): string {
  const stroke = colorOf(l.color, c, c.line);
  const w = l.width || (l.color === 'accent' ? 4 : 3);
  const dash = l.style === 'dashed' ? ' stroke-dasharray="11 9"' : l.style === 'dotted' ? ' stroke-dasharray="0.1 9"' : '';
  const cap = l.style === 'solid' ? 'butt' : 'round';
  const end = l.dir === 'to' || l.dir === 'both' ? ' marker-end="url(#arrow)"' : '';
  const start = l.dir === 'both' ? ' marker-start="url(#arrow)"' : '';
  return `<path d="${pathD(l.pts, l)}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"${dash}${end}${start}/>`;
}

function circleNode(n: CircleNode, c: Palette): string {
  const filled = n.role === 'anchor' || n.role === 'attacker';
  const muted = n.role === 'muted';
  const fillTint = fillOf(n.color, c, c.accent);
  const ring = colorOf(n.color, c, c.dark ? c.paper : c.accent);
  const fill = filled ? fillTint : c.paper;
  // A filled node on a dark page wears a paper ring so it doesn't sink into it.
  const border = filled ? `3px solid ${c.dark ? c.paper : (n.color ? fillTint : c.deep)}`
    : muted ? `3px dashed ${c.muted}` : `3px solid ${ring}`;
  const glyph = filled ? c.onAccent : muted ? c.muted : (c.dark && !n.color ? c.deep : fillTint);
  return `<div class="fig-topo-node" style="left:${f(n.x)}px;top:${f(n.y)}px;width:${n.d}px;height:${n.d}px;` +
    `background:${fill};border:${border};box-shadow:${c.nodeShadow}">${pictogramGlyphSvg(n.icon, Math.round(n.d * 0.54), glyph)}</div>`;
}

function boxNode(n: BoxNode, c: Palette, ts: number): string {
  const s = boxStyle(n, c);
  return `<div style="${at({ x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h })};display:flex;align-items:center;justify-content:center;` +
    `background:${s.fill};border:${s.border};border-radius:${18 * ts}px;box-shadow:${c.nodeShadow}">${boxInnerHtml(n, c, ts)}</div>`;
}

export function drawGraph(G: Graph, c: Palette, frame: Frame): string {
  const ts = G.opts.textScale;
  const out: string[] = [];
  for (const g of G.groups) {
    if (!g.rect) continue;
    const border = `2px ${g.style === 'dashed' ? 'dashed' : 'solid'} ${g.color ? colorOf(g.color, c) : c.groupBorder}`;
    out.push(`<div style="${at(g.rect)};border-radius:${30 * ts}px;background:${c.groupFill};border:${border}"></div>`);
    if (g.labelRect) {
      const badge = g.labelBadge
        ? `;background:${c.chipBg};border-radius:${7 * ts}px;box-shadow:${c.nodeShadow};outline:${7 * ts}px solid ${c.chipBg}` : '';
      out.push(`<div style="${at(g.labelRect)}${badge}">${groupLabelHtml(g, c, ts)}</div>`);
    }
  }
  // Quiet links (muted, dashed, dotted) paint first, so a solid link that
  // shares a trunk or a port stays on top.
  const quiet = (l: GraphLink): number => (l.color === 'muted' ? 2 : 0) + (l.style !== 'solid' ? 1 : 0);
  const paths = G.links.filter((l) => l.pts.length > 1).sort((a, b) => quiet(b) - quiet(a) || a.index - b.index);
  const B = union(paths.flatMap((l) => l.pts.map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }))));
  const pad = 60;
  out.push(`<svg style="position:absolute;left:${f(B.x - pad)}px;top:${f(B.y - pad)}px;overflow:visible" width="${f(B.w + pad * 2)}" height="${f(B.h + pad * 2)}" ` +
    `viewBox="${f(B.x - pad)} ${f(B.y - pad)} ${f(B.w + pad * 2)} ${f(B.h + pad * 2)}"><defs>` +
    `<marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto-start-reverse">` +
    `<path d="M0,0 L7,3 L0,6 Z" fill="context-stroke"/></marker></defs>${paths.map((l) => linkSvg(l, c)).join('')}</svg>`);
  for (const l of G.links) {
    if (l.chipRect) out.push(`<div style="${at(l.chipRect)}">${chipHtml(l, c, ts)}</div>`);
    for (const e of l.endRects || []) out.push(`<div style="${at(e.r)}">${endLabelHtml(e.text, c, ts)}</div>`);
  }
  for (const n of G.nodes) {
    out.push(n.shape === 'box' ? boxNode(n, c, ts) : circleNode(n, c));
    if (n.labelRect) {
      const badge = n.labelBadge
        ? `;background:${c.chipBg};border-radius:${9 * ts}px;box-shadow:${c.nodeShadow};outline:${8 * ts}px solid ${c.chipBg}` : '';
      out.push(`<div style="${at(n.labelRect)}${badge}">${nodeLabelHtml(n, c, ts, n.labelAlign)}</div>`);
    }
  }
  const stage = `<div style="position:absolute;left:0;top:0;transform-origin:0 0;` +
    `transform:translate(${f(frame.tx)}px,${f(frame.ty)}px) scale(${f(frame.s * 1000) / 1000})">${out.join('')}</div>`;
  const title = titleHtml(G.opts, c);
  const ts2 = frame.titleScale || 1;
  return stage + (title ? `<div style="position:absolute;left:76px;top:${f(64 * ts2)}px;transform-origin:0 0;transform:scale(${f(ts2 * 1000) / 1000})">${title}</div>` : '');
}
