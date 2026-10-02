// The topology / diagram template: normalize → measure → layout → place →
// fit → draw. `measure` renders HTML fragments in the page and returns their
// sizes, so layout always works from real text metrics.
import { resolveSize } from '../palette.mjs';
import { layoutElk } from './layout-elk.mjs';
import { layoutGeo } from './layout-geo.mjs';
import { isRadial, normalize } from './normalize.mjs';
import { boxInnerHtml, chipHtml, endLabelHtml, groupLabelHtml, nodeLabelHtml, titleHtml } from './parts.mjs';
import { placeChips, placeEndLabels, placeLabels } from './place.mjs';
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

  if (G.opts.layout === 'auto') {
    await layoutElk(G, groupPad);
  } else {
    layoutGeo(G);
    placeChips(G);
    placeLabels(G);
    groupRectsGeo(G, groupPad);
  }
  placeEndLabels(G);

  const B = contentBounds(G);
  // Radial layouts keep the 3:2 frame they always had; the rest size to content.
  const sizePx = G.opts.size ? resolveSize(G.opts.size) : isRadial(G.opts.layout) ? resolveSize('topo') : null;
  const titleBand = titleSize.h ? titleSize.h + 40 : 0;
  const frame = fitFrame(B, { sizePx, fit: G.opts.fit }, titleBand);
  const warnings = collectWarnings(G, frame.s);
  const html = drawGraph(G, c, frame, { group: groupSizes });
  return { html, W: frame.W, H: frame.H, warnings, graph: G, frame };
}
