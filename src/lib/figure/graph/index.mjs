// The topology / diagram template: normalize → measure → layout → place →
// fit → draw. `measure` renders HTML fragments in the page and returns their
// sizes, so layout always works from real text metrics.
import { resolveSize } from '../palette.mjs';
import { layoutElk } from './layout-elk.mjs';
import { layoutGeo, routeGroupLinks } from './layout-geo.mjs';
import { isRadial, normalize } from './normalize.mjs';
import { boxInnerHtml, chipHtml, endLabelHtml, groupLabelHtml, nodeLabelHtml, titleHtml } from './parts.mjs';
import { placeChips, placeEndLabels, placeGroupLabels, placeLabels } from './place.mjs';
import { collectWarnings, contentBounds, fitFrame, groupRectsGeo } from './frame.mjs';
import { drawGraph } from './draw.mjs';

export { normalize };

export async function renderGraph(spec, c, measure) {
  const G = normalize(spec);
  const ts = G.opts.textScale;

  // One measuring pass for every piece of text.
  const jobs = [];
  const job = (html, apply) => jobs.push({ html, apply });
  for (const n of G.nodes) {
    if (n.shape === 'box') job(boxInnerHtml(n, c, ts), (s) => { n.w = s.w + 6; n.h = s.h + 6; }); // + the 3px border
    else job(nodeLabelHtml(n, c, ts), (s) => { n.labelSize = s; });
  }
  for (const l of G.links) {
    if (l.label) job(chipHtml(l, c, ts), (s) => { l.chipSize = s; });
    if (l.fromLabel) job(endLabelHtml(l.fromLabel, c, ts), (s) => { l.fromSize = s; });
    if (l.toLabel) job(endLabelHtml(l.toLabel, c, ts), (s) => { l.toSize = s; });
  }
  const groupSizes = new Map();
  for (const g of G.groups) if (g.label) job(groupLabelHtml(g, c, ts), (s) => groupSizes.set(g.id, s));
  let titleSize = { w: 0, h: 0 };
  const title = titleHtml(G.opts, c);
  if (title) job(title, (s) => { titleSize = s; });
  const sizes = await measure(jobs.map((j) => j.html));
  jobs.forEach((j, i) => j.apply(sizes[i]));

  const d = Math.round(150 * G.opts.nodeScale);
  for (const n of G.nodes) if (n.shape === 'circle') n.d = Math.round(d * n.scale);

  const labelH = Math.max(0, ...[...groupSizes.values()].map((s) => s.h));
  const groupPad = { top: Math.round(26 * ts + labelH + 30), side: Math.round(34 * ts) };

  // Radial layouts keep the 3:2 frame they always had; the rest size to content.
  const sizePx = G.opts.size ? resolveSize(G.opts.size) : isRadial(G.opts.layout) ? resolveSize('topo') : null;
  // The title shrinks with the drawing (not below 72%) so it stays in proportion.
  const frameFor = () => {
    const B = contentBounds(G);
    const fit = { sizePx, fit: G.opts.fit };
    if (!titleSize.h) return fitFrame(B, fit, 0);
    const first = fitFrame(B, fit, titleSize.h + 40, titleSize.w);
    const k = Math.min(1, Math.max(0.72, first.s));
    return { ...fitFrame(B, fit, (titleSize.h + 40) * k, titleSize.w * k), titleScale: k };
  };

  if (G.opts.layout === 'auto') {
    // Left to right reads best. When it would shrink the text and the author
    // left the direction open, try top to bottom and keep it if it is clearly
    // larger.
    // The author's direction (left to right by default) first. If that shrinks
    // the text below 70%, wrap it into rows; if the direction was left open,
    // also try top to bottom. A fallback wins only when clearly larger.
    const tries = [{ dir: G.opts.direction }];
    const horizontal = G.opts.direction === 'right' || G.opts.direction === 'left';
    if (horizontal) tries.push({ dir: G.opts.direction, wrap: true });
    if (!G.opts.directionSet) tries.push({ dir: 'down' });
    let best, last;
    for (const t of tries) {
      if (best && best.s >= 0.7) break;
      await layoutElk(G, groupPad, t.dir, t);
      placeEndLabels(G);
      last = t;
      const s = frameFor().s;
      if (!best || s > best.s * 1.12) best = { ...t, s, t };
    }
    if (best.t !== last) {
      await layoutElk(G, groupPad, best.dir, best);
      placeEndLabels(G);
    }
    // Still small: a dense graph. Shrink the circles and the gaps, not the text.
    if (best.s < 0.7) {
      const keep = { spread: G.opts.spread, d: G.nodes.map((n) => n.d) };
      G.opts.spread *= 0.8;
      for (const n of G.nodes) if (n.d) n.d = Math.round(n.d * 0.8);
      await layoutElk(G, groupPad, best.dir, best);
      placeEndLabels(G);
      if (frameFor().s <= best.s * 1.04) {
        G.opts.spread = keep.spread;
        G.nodes.forEach((n, i) => { n.d = keep.d[i]; });
        await layoutElk(G, groupPad, best.dir, best);
        placeEndLabels(G);
      }
    }
    G.opts.direction = best.dir;
    G.opts.wrapped = Boolean(best.wrap);
  } else {
    layoutGeo(G);
    placeChips(G);
    placeLabels(G);
    groupRectsGeo(G, groupPad);
    if (G.links.some((l) => l.fromGroup || l.toGroup)) {
      // Lines to groups need the group borders, and the labels need to know
      // about those lines: route, re-place the labels, settle the borders.
      const toGroup = (l) => l.fromGroup || l.toGroup;
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
  const html = drawGraph(G, c, frame, { group: groupSizes });
  return { html, W: frame.W, H: frame.H, warnings, graph: G, frame };
}
