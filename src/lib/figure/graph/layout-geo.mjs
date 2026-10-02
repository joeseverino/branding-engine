// Fixed-geometry layouts: star, ring, row, grid and free. Each sets node
// centers (x, y) in layout units; routing turns links into paths.
import { bend, rimPoint } from '../geom.mjs';
import { resolveSize } from '../palette.mjs';

// A group end stands in as a box at the group's rect.
export function groupEnd(G, id) {
  const r = G.groupById.get(id).rect;
  return { shape: 'box', x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
}

// Links that end at a group, once group rects exist: a straight line between
// the two ends, stopping at the node's rim and just outside the group's border.
export function routeGroupLinks(G) {
  for (const l of G.links) {
    if (!l.fromGroup && !l.toGroup) continue;
    const a = l.fromGroup ? groupEnd(G, l.from) : G.byId.get(l.from);
    const b = l.toGroup ? groupEnd(G, l.to) : G.byId.get(l.to);
    l.pts = [rimPoint(a, b), rimPoint(b, a)];
  }
}

const SPOKES = ['w', 'e', 's', 'n', 'nw', 'ne', 'sw', 'se'];

export const nodeExtent = (n) => (n.shape === 'box' ? { w: n.w, h: n.h } : { w: n.d, h: n.d });

function degree(G) {
  const deg = new Map(G.nodes.map((n) => [n.id, 0]));
  for (const l of G.links) { deg.set(l.from, deg.get(l.from) + 1); deg.set(l.to, deg.get(l.to) + 1); }
  return deg;
}

const widest = (G, f) => Math.max(0, ...G.nodes.map(f));

function star(G, d) {
  const { spread } = G.opts;
  let hub = G.nodes.find((n) => n.pos === 'center');
  const needsSlots = G.nodes.some((n) => !n.pos);
  if (needsSlots) {
    const deg = degree(G);
    hub = hub || G.nodes.find((n) => n.role === 'anchor')
      || [...G.nodes].sort((a, b) => deg.get(b.id) - deg.get(a.id) || a.index - b.index)[0];
    const taken = new Set(G.nodes.map((n) => n.pos).filter(Boolean));
    const free = SPOKES.filter((s) => !taken.has(s));
    const spokes = G.nodes.filter((n) => n !== hub && !n.pos);
    if (spokes.length > free.length) return ring(G, d, hub);
    hub.pos = 'center';
    hub.isCenter = true;
    spokes.forEach((n, i) => { n.pos = free[i]; });
  }
  // Spokes clear the widest label beside the hub, so e/w labels never crowd it.
  // Spokes clear the widest e/w label beside the hub and leave each chip a run
  // of visible line on both sides.
  const chipOn = (axis) => G.links.filter((l) => [l.from, l.to].some((id) => axis.includes(G.byId.get(id).pos)));
  const runX = Math.max(0, ...chipOn(['e', 'w', 'ne', 'nw', 'se', 'sw']).map((l) => (l.chipSize?.w || 0) + 150));
  const runY = Math.max(0, ...chipOn(['n', 's']).map((l) => (l.chipSize?.h || 0) + 130));
  const rx = Math.max(3.2 * d, d * 1.3 + widest(G, (n) => (n.pos === 'e' || n.pos === 'w' ? n.labelSize?.w || 0 : 0)) * 0.5, d * 1.06 + runX) * spread;
  const ry = Math.max(2.05 * d, d * 1.06 + runY) * spread;
  const dgx = 0.97, dgy = 0.92;
  const slot = {
    center: [0, 0], n: [0, -ry], s: [0, ry], e: [rx, 0], w: [-rx, 0],
    ne: [rx * dgx, -ry * dgy], nw: [-rx * dgx, -ry * dgy], se: [rx * dgx, ry * dgy], sw: [-rx * dgx, ry * dgy],
  };
  for (const n of G.nodes) [n.x, n.y] = slot[n.pos] || slot.center;
}

function ring(G, d, hub) {
  const center = hub || G.nodes.find((n) => n.isCenter);
  const around = G.nodes.filter((n) => n !== center);
  const count = Math.max(around.length, 1);
  const r = Math.max(2.3 * d, (count * (d + 120)) / (2 * Math.PI)) * G.opts.spread;
  // Stagger so no node sits straight above or below the center.
  const a0 = -Math.PI / 2 + Math.PI / count;
  around.forEach((n, i) => {
    const a = a0 + (2 * Math.PI * i) / count;
    n.x = r * Math.cos(a);
    n.y = r * Math.sin(a);
  });
  if (center) { center.x = 0; center.y = 0; center.isCenter = true; }
}

function row(G, d) {
  // A short row reads as a banner: bigger circles, same text, like the old row frame.
  const f = Math.min(1.4, Math.max(1, 4 / Math.max(G.nodes.length, 1)));
  if (f > 1) {
    d = Math.round(d * f);
    for (const n of G.nodes) if (n.shape === 'circle') n.d = Math.round(n.d * f);
  }
  // Each link's run between rims holds its chip with air on both sides, plus
  // room for endpoint labels past each arrowhead.
  const run = Math.max(0, ...G.links.map((l) => (l.chipSize?.w || 0)
    + 2 * Math.max(110, (Math.max(l.fromSize?.w || 0, l.toSize?.w || 0)) + 70)));
  let gap = Math.max(3.4 * d, d + run, widest(G, (n) => n.labelSize?.w || nodeExtent(n).w) + 70) * G.opts.spread;
  // Spread a sparse row across the frame at 1:1 instead of letting the fit
  // step blow its text up: 1600 wide less the frame margins.
  const k = G.nodes.length;
  if (k > 1) {
    const half = (n) => Math.max(nodeExtent(n).w, n.labelSize?.w || 0) / 2;
    gap = Math.max(gap, (1448 - half(G.nodes[0]) - half(G.nodes[k - 1])) / (k - 1));
  }
  G.nodes.forEach((n, i) => { n.x = i * gap; n.y = 0; });
}

function grid(G, d) {
  const colGap = Math.max(3.2 * d, widest(G, (n) => n.labelSize?.w || nodeExtent(n).w) + 110) * G.opts.spread;
  const rowGap = Math.max(2.5 * d, d + widest(G, (n) => n.labelSize?.h || 0) + 120) * G.opts.spread;
  let auto = 0;
  const cols = Math.ceil(Math.sqrt(G.nodes.length));
  for (const n of G.nodes) {
    const [c, r] = n.at || [auto % cols, Math.floor(auto / cols)];
    if (!n.at) auto++;
    n.x = c * colGap;
    n.y = r * rowGap;
  }
}

function free(G, d) {
  // `at` fractions of the canvas, in canvas px scaled to layout units.
  const [W, H] = resolveSize(G.opts.size || 'topo');
  const k = d / (Math.min(W, H) * 0.16);
  for (const n of G.nodes) {
    const [fx, fy] = n.at || [0.5, 0.5];
    n.x = fx * W * k;
    n.y = fy * H * k;
  }
}

export function layoutGeo(G) {
  const d = Math.round(150 * G.opts.nodeScale);
  const L = G.opts.layout;
  if (L === 'star') {
    star(G, d);
    // The hub reads as the hub: a touch larger than its spokes.
    for (const n of G.nodes) if (n.isCenter && n.shape === 'circle') n.d = Math.round(n.d * 1.12);
  }
  else if (L === 'ring') ring(G, d);
  else if (L === 'grid') grid(G, d);
  else if (L === 'free') free(G, d);
  else row(G, d);
  routeGeo(G);
}

// Straight spokes, bent only where asked or where two links share a pair.
export function routeGeo(G) {
  const pairs = new Map();
  for (const l of G.links) {
    const key = [l.from, l.to].sort().join('\u0000');
    if (!pairs.has(key)) pairs.set(key, []);
    pairs.get(key).push(l);
  }
  for (const list of pairs.values()) {
    if (list.length < 2) continue;
    list.forEach((l, i) => {
      if (l.curve !== undefined) return;
      const sign = l.from < l.to ? 1 : -1;
      l.curve = (i - (list.length - 1) / 2) * 0.16 * sign;
    });
  }
  for (const l of G.links) {
    // A link to a group waits for the group's border: routeGroupLinks.
    if (l.fromGroup || l.toGroup) { l.pts = []; continue; }
    const a = G.byId.get(l.from), b = G.byId.get(l.to);
    if (a === b) { l.pts = []; continue; }
    if (l.curve) {
      const { control } = bend(a, b, l.curve);
      const p = rimPoint(a, control), q = rimPoint(b, control);
      l.pts = bend(p, q, l.curve).pts;
      l.smooth = true;
    } else {
      l.pts = [rimPoint(a, b), rimPoint(b, a)];
    }
  }
}
