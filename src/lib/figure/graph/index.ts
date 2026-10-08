// The topology / diagram template: normalize → measure → layout → place →
// fit → draw. `measure` renders HTML fragments in the page and returns their
// sizes, so layout always works from real text metrics.
import { required } from '../../guards.ts';
import type { Size } from '../geom.ts';
import { resolveSize, type Palette } from '../palette.ts';
import type { GraphDirection, GraphSpec } from '../spec.ts';
import { drawGraph } from './draw.ts';
import { collectWarnings, contentBounds, fitFrame, groupRectsGeo, type Frame } from './frame.ts';
import { layoutElk } from './layout-elk.ts';
import { layoutGeo, routeGroupLinks } from './layout-geo.ts';
import type { Graph, GraphLink } from './model.ts';
import { isRadial, normalize } from './normalize.ts';
import { boxInnerHtml, chipHtml, endLabelHtml, groupLabelHtml, nodeLabelHtml, titleHtml } from './parts.ts';
import { placeChips, placeEndLabels, placeGroupLabels, placeLabels } from './place.ts';

export { normalize };

/** Renders HTML fragments in the page and returns the box each one occupies. */
export type Measure = (fragments: string[]) => Promise<Size[]>;

export interface GraphRender {
  html: string;
  W: number;
  H: number;
  warnings: string[];
  graph: Graph;
  frame: Frame;
}

interface Attempt {
  dir: GraphDirection;
  wrap?: boolean;
}

export async function renderGraph(spec: GraphSpec, c: Palette, measure: Measure): Promise<GraphRender> {
  const G = normalize(spec);
  const ts = G.opts.textScale;

  // One measuring pass for every piece of text.
  const jobs: Array<{ html: string; apply: (size: Size) => void }> = [];
  const job = (html: string, apply: (size: Size) => void): void => { jobs.push({ html, apply }); };
  for (const n of G.nodes) {
    if (n.shape === 'box') job(boxInnerHtml(n, c, ts), (s) => { n.w = s.w + 6; n.h = s.h + 6; }); // + the 3px border
    else job(nodeLabelHtml(n, c, ts), (s) => { n.labelSize = s; });
  }
  for (const l of G.links) {
    if (l.label) job(chipHtml(l, c, ts), (s) => { l.chipSize = s; });
    if (l.fromLabel) job(endLabelHtml(l.fromLabel, c, ts), (s) => { l.fromSize = s; });
    if (l.toLabel) job(endLabelHtml(l.toLabel, c, ts), (s) => { l.toSize = s; });
  }
  const groupSizes = new Map<string, Size>();
  for (const g of G.groups) if (g.label) job(groupLabelHtml(g, c, ts), (s) => groupSizes.set(g.id, s));
  let titleSize: Size = { w: 0, h: 0 };
  const title = titleHtml(G.opts, c);
  if (title) job(title, (s) => { titleSize = s; });
  const sizes = await measure(jobs.map((j) => j.html));
  jobs.forEach((j, i) => j.apply(required(sizes[i], `the measured size of text fragment ${i}`)));

  const d = Math.round(150 * G.opts.nodeScale);
  for (const n of G.nodes) if (n.shape === 'circle') n.d = Math.round(d * n.scale);

  const labelH = Math.max(0, ...[...groupSizes.values()].map((s) => s.h));
  const groupPad = { top: Math.round(26 * ts + labelH + 30), side: Math.round(34 * ts) };

  // Radial layouts keep the 3:2 frame they always had; the rest size to content.
  const sizePx = G.opts.size ? resolveSize(G.opts.size) : isRadial(G.opts.layout) ? resolveSize('topo') : null;
  // The title shrinks with the drawing (not below 72%) so it stays in proportion.
  const frameFor = (): Frame => {
    const B = contentBounds(G);
    const fit = { sizePx, fit: G.opts.fit };
    if (!titleSize.h) return fitFrame(B, fit, 0);
    const first = fitFrame(B, fit, titleSize.h + 40, titleSize.w);
    const k = Math.min(1, Math.max(0.72, first.s));
    return { ...fitFrame(B, fit, (titleSize.h + 40) * k, titleSize.w * k), titleScale: k };
  };

  if (G.opts.layout === 'auto') {
    // The author's direction (left to right by default) first. If that shrinks
    // the text below 70%, wrap it into rows; if the direction was left open,
    // also try top to bottom. A fallback wins only when clearly larger.
    const tries: Attempt[] = [{ dir: G.opts.direction }];
    const horizontal = G.opts.direction === 'right' || G.opts.direction === 'left';
    if (horizontal) tries.push({ dir: G.opts.direction, wrap: true });
    if (!G.opts.directionSet) tries.push({ dir: 'down' });
    let best: (Attempt & { s: number; t: Attempt }) | undefined;
    let last: Attempt | undefined;
    for (const t of tries) {
      if (best && best.s >= 0.7) break;
      try {
        await layoutElk(G, groupPad, t.dir, t);
      } catch (error) {
        // ELK's row wrapping throws on some compound graphs. It only ever
        // improves a layout that already exists, so that layout stands.
        if (!t.wrap || !best) throw error;
        continue;
      }
      placeEndLabels(G);
      last = t;
      const s = frameFor().s;
      if (!best || s > best.s * 1.12) best = { ...t, s, t };
    }
    const chosen = required(best, 'a layout attempt');
    if (chosen.t !== last) {
      await layoutElk(G, groupPad, chosen.dir, chosen);
      placeEndLabels(G);
    }
    // Still small: a dense graph. Shrink the circles and the gaps, not the text.
    if (chosen.s < 0.7) {
      const keep = { spread: G.opts.spread, circles: G.nodes.flatMap((n) => (n.shape === 'circle' ? [{ n, d: n.d }] : [])) };
      G.opts.spread *= 0.8;
      for (const { n } of keep.circles) n.d = Math.round(n.d * 0.8);
      await layoutElk(G, groupPad, chosen.dir, chosen);
      placeEndLabels(G);
      if (frameFor().s <= chosen.s * 1.04) {
        G.opts.spread = keep.spread;
        for (const { n, d } of keep.circles) n.d = d;
        await layoutElk(G, groupPad, chosen.dir, chosen);
        placeEndLabels(G);
      }
    }
    G.opts.direction = chosen.dir;
    G.opts.wrapped = Boolean(chosen.wrap);
  } else {
    layoutGeo(G);
    placeChips(G);
    placeLabels(G);
    groupRectsGeo(G, groupPad);
    if (G.links.some((l) => l.fromGroup || l.toGroup)) {
      // Lines to groups need the group borders, and the labels need to know
      // about those lines: route, re-place the labels, settle the borders.
      const toGroup = (l: GraphLink): boolean => l.fromGroup || l.toGroup;
      for (let pass = 0; pass < 2; pass++) {
        routeGroupLinks(G);
        placeChips(G, { only: toGroup });
        placeLabels(G);
        groupRectsGeo(G, groupPad);
      }
      routeGroupLinks(G);
      placeChips(G, { only: toGroup });
    }
    placeEndLabels(G);
  }

  placeGroupLabels(G, groupSizes, ts);
  const frame = frameFor();
  const warnings = collectWarnings(G, frame.s);
  const html = drawGraph(G, c, frame);
  return { html, W: frame.W, H: frame.H, warnings, graph: G, frame };
}
