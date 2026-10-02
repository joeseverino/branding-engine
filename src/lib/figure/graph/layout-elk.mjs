// Automatic layout through ELK's layered algorithm (the engine behind D2's
// ELK mode). Nodes, groups, node labels and link chips all enter ELK with
// their measured sizes, so the layout reserves room for every piece of text.
import ELK from 'elkjs/lib/elk.bundled.js';
import { rect, rimPoint } from '../geom.mjs';
import { METRICS } from './parts.mjs';

const DIRS = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };
const ROUTING = { orthogonal: 'ORTHOGONAL', straight: 'POLYLINE', curved: 'SPLINES' };
// Which side links enter and leave by, per direction.
const SIDES = { right: ['WEST', 'EAST'], left: ['EAST', 'WEST'], down: ['NORTH', 'SOUTH'], up: ['SOUTH', 'NORTH'] };

// A 1×1 port at the middle of one side of a w×h node, inside the border: ELK
// attaches a link at the port's outer edge, which then lies on the side.
function port(id, side, w, h) {
  const at = { WEST: [0, h / 2 - 0.5], EAST: [w - 1, h / 2 - 0.5], NORTH: [w / 2 - 0.5, 0], SOUTH: [w / 2 - 0.5, h - 1] }[side];
  return { id, width: 1, height: 1, x: at[0], y: at[1], layoutOptions: { 'elk.port.side': side } };
}

// An orthogonal end: on the segment's axis through the node center, `gap`
// past the rim, facing the next point. Ports sit at side midpoints, so the
// segment already runs through the center line.
function rimAlong(n, next, gap) {
  const dx = next.x - n.x, dy = next.y - n.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const half = n.shape === 'box' ? (horizontal ? n.w / 2 : n.h / 2) : n.d / 2;
  return horizontal
    ? { x: n.x + Math.sign(dx) * (half + gap), y: n.y }
    : { x: n.x, y: n.y + Math.sign(dy) * (half + gap) };
}

// Two links whose straight runs share a track and nearly meet end to end read
// as one line. ELK only spaces runs that overlap, so nudge the later link's
// inner run sideways. Runs touching an end (the port segments) stay put, and
// so do fan-outs, which share a trunk by design.
export function separateTouchingRuns(links, { gap = 40, shift = 18 } = {}) {
  const runs = [];
  links.forEach((l, li) => {
    for (let i = 1; i < l.pts.length - 2; i++) {
      const a = l.pts[i], b = l.pts[i + 1];
      const vertical = Math.abs(a.x - b.x) < 0.5, horizontal = Math.abs(a.y - b.y) < 0.5;
      if (vertical || horizontal) runs.push({ li, i, vertical, at: vertical ? a.x : a.y, lo: Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x), hi: Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x) });
    }
  });
  const moved = new Set();
  for (const r of runs) {
    for (const o of runs) {
      if (o.li <= r.li || o.vertical !== r.vertical || moved.has(`${o.li}:${o.i}`)) continue;
      // Links that leave or reach the same node share a trunk on purpose.
      const A = links[r.li], B = links[o.li];
      if (A.from === B.from || A.to === B.to) continue;
      if (Math.abs(o.at - r.at) > 4) continue;
      const apart = Math.max(o.lo - r.hi, r.lo - o.hi);
      if (apart < 0 || apart > gap) continue; // overlapping runs are ELK's to space
      const l = links[o.li];
      const k = o.vertical ? 'x' : 'y';
      // Move away from the other run's far end so the two don't look joined.
      const dir = l.pts[o.i][k] >= r.at ? 1 : -1;
      l.pts[o.i] = { ...l.pts[o.i], [k]: l.pts[o.i][k] + dir * shift };
      l.pts[o.i + 1] = { ...l.pts[o.i + 1], [k]: l.pts[o.i + 1][k] + dir * shift };
      moved.add(`${o.li}:${o.i}`);
    }
  }
}

// An end on a group's border: on the segment's axis through `p` (the port),
// `gap` outside the side it meets, facing `next`.
function borderAlong(r, p, next, gap) {
  const dx = next.x - p.x, dy = next.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx < 0 ? r.x - gap : r.x + r.w + gap, y: p.y };
  }
  return { x: p.x, y: dy < 0 ? r.y - gap : r.y + r.h + gap };
}

// Where a ray from p toward q first meets a circle node (plus `gap`): the rim
// point that faces p.
function circleEntry(n, p, q, gap) {
  const r = n.d / 2 + gap;
  const dx = q.x - p.x, dy = q.y - p.y;
  const fx = p.x - n.x, fy = p.y - n.y;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (!a || disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null; // p is inside the ring
  return { x: p.x + dx * t, y: p.y + dy * t };
}

export async function layoutElk(G, groupPad, direction = G.opts.direction, { wrap = false } = {}) {
  const vertical = direction === 'down' || direction === 'up';
  const routing = ROUTING[G.opts.routing] || 'ORTHOGONAL';
  const ported = routing === 'ORTHOGONAL';
  const [inSide, outSide] = SIDES[direction] || SIDES.right;
  const elkNode = (n) => {
    const out = { id: n.id, layoutOptions: {} };
    const [w, h] = n.shape === 'box' ? [n.w, n.h] : [n.d, n.d];
    Object.assign(out, { width: w, height: h });
    if (n.shape === 'circle') {
      out.labels = [{ text: n.id, width: n.labelSize.w, height: n.labelSize.h }];
      Object.assign(out.layoutOptions, {
        'elk.nodeLabels.placement': vertical ? 'OUTSIDE H_RIGHT V_CENTER' : 'OUTSIDE V_BOTTOM H_CENTER',
        'elk.spacing.labelNode': String(METRICS.labelGap + 6),
      });
    }
    if (ported) {
      // Every link enters and leaves through the middle of a side, so lines meet
      // a circle square-on and fan out from one trunk.
      out.ports = [port(`${n.id}\u241Fin`, inSide, w, h), port(`${n.id}\u241Fout`, outSide, w, h)];
      out.layoutOptions['elk.portConstraints'] = 'FIXED_POS';
    }
    return out;
  };

  // Build the compound tree: groups nest, nodes sit in their group.
  const containers = new Map([['root', { id: 'root', children: [], edges: [] }]]);
  const parentOf = new Map();
  for (const g of G.groups) {
    containers.set(g.id, {
      id: g.id, children: [], edges: [],
      layoutOptions: { 'elk.padding': `[top=${groupPad.top},left=${groupPad.side},bottom=${groupPad.side},right=${groupPad.side}]` },
    });
    parentOf.set(g.id, g.parent || 'root');
  }
  // A group that a link ends at gets ports on its in and out sides; ELK places
  // them along the side and routes the link to the border.
  const linkedGroups = new Set(G.links.flatMap((l) => [l.fromGroup && l.from, l.toGroup && l.to].filter(Boolean)));
  for (const g of G.groups) {
    if (!linkedGroups.has(g.id)) continue;
    const box = containers.get(g.id);
    if (ported) {
      box.ports = [inSide, outSide].map((side, i) => ({ id: `${g.id}\u241F${i ? 'out' : 'in'}`, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } }));
      box.layoutOptions['elk.portConstraints'] = 'FIXED_SIDE';
    }
  }
  for (const g of G.groups) containers.get(parentOf.get(g.id)).children.push(containers.get(g.id));
  for (const n of G.nodes) {
    parentOf.set(n.id, n.group || 'root');
    containers.get(n.group || 'root').children.push(elkNode(n));
  }
  const chain = (id) => { const out = []; for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p); return out; };
  const lca = (a, b) => { const ca = chain(a); const cb = new Set(chain(b)); return ca.find((x) => cb.has(x)) || 'root'; };

  for (const l of G.links) {
    if (l.from === l.to) continue;
    const e = ported
      ? { id: l.id, sources: [`${l.from}\u241Fout`], targets: [`${l.to}\u241Fin`] }
      : { id: l.id, sources: [l.from], targets: [l.to] };
    if (l.label && l.chipSize) {
      e.labels = [{ text: l.id, width: l.chipSize.w, height: l.chipSize.h,
        layoutOptions: { 'elk.edgeLabels.inline': 'true', 'elk.edgeLabels.placement': 'CENTER' } }];
    }
    containers.get(lca(l.from, l.to)).edges.push(e);
  }

  // Spacing is per container in ELK: every group needs it, not just the root.
  const spacing = {
    'elk.spacing.nodeNode': String(Math.round(60 * G.opts.spread)),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.round(110 * G.opts.spread)),
    'elk.layered.spacing.edgeNodeBetweenLayers': '56',
    'elk.spacing.edgeNode': '28',
    'elk.spacing.edgeEdge': '22',
    'elk.spacing.edgeLabel': '4',
  };
  for (const g of G.groups) Object.assign(containers.get(g.id).layoutOptions, spacing);
  const root = containers.get('root');
  root.layoutOptions = {
    ...spacing,
    'elk.algorithm': 'layered',
    'elk.direction': DIRS[direction] || 'RIGHT',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': routing,
    'elk.randomSeed': '1',
    'elk.spacing.componentComponent': '120',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.thoroughness': '20',
  };
  if (wrap) {
    // Break a long run into rows that keep reading left to right.
    Object.assign(root.layoutOptions, { 'elk.layered.wrapping.strategy': 'SINGLE_EDGE', 'elk.aspectRatio': '1.5' });
  }

  const out = await new ELK().layout(root);

  // Absolute positions: ELK coordinates are relative to the parent container.
  const abs = new Map([['root', { x: 0, y: 0 }]]);
  const elkById = new Map();
  const walk = (node, ox, oy) => {
    for (const ch of node.children || []) {
      const x = ox + ch.x, y = oy + ch.y;
      abs.set(ch.id, { x, y });
      elkById.set(ch.id, ch);
      walk(ch, x, y);
    }
  };
  walk(out, 0, 0);

  for (const n of G.nodes) {
    const p = abs.get(n.id), en = elkById.get(n.id);
    n.x = p.x + en.width / 2;
    n.y = p.y + en.height / 2;
    if (n.shape === 'circle') {
      const lb = en.labels[0];
      // ELK can seat an outside label flush against the node; hold the gap.
      const gap = METRICS.labelGap + 4;
      const lx = vertical ? Math.max(lb.x, en.width + gap) : lb.x;
      const ly = vertical ? lb.y : Math.max(lb.y, en.height + gap);
      n.labelRect = rect(p.x + lx, p.y + ly, n.labelSize.w, n.labelSize.h);
      n.labelAlign = vertical ? 'left' : 'center';
    }
  }
  for (const g of G.groups) {
    const p = abs.get(g.id), eg = elkById.get(g.id);
    g.rect = rect(p.x, p.y, eg.width, eg.height);
  }

  const edgesOut = [];
  const collect = (node) => { for (const e of node.edges || []) edgesOut.push(e); for (const ch of node.children || []) collect(ch); };
  collect(out);
  const elkEdge = new Map(edgesOut.map((e) => [e.id, e]));

  // A group end stands in as a box node at the group's rect.
  const endOf = (id, isGroup) => {
    if (!isGroup) return G.byId.get(id);
    const r = G.groupById.get(id).rect;
    return { shape: 'box', isGroup: true, rect: r, x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h };
  };
  for (const l of G.links) {
    const a = endOf(l.from, l.fromGroup), b = endOf(l.to, l.toGroup);
    const e = elkEdge.get(l.id);
    if (!e || !e.sections?.length) { l.pts = []; continue; }
    const o = abs.get(e.container || 'root') || { x: 0, y: 0 };
    const s = e.sections[0];
    const raw = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    const pts = raw;
    const n = pts.length;
    if (ported) {
      // Ports sit on the rim at a side's midpoint: pull each end back off it.
      // A group's port sits anywhere along its side: keep the line where ELK
      // put it and stop just short of the border.
      pts[0] = a.isGroup ? borderAlong(a.rect, pts[0], pts[1], 9) : rimAlong(a, pts[1], 9);
      pts[n - 1] = b.isGroup ? borderAlong(b.rect, pts[n - 1], pts[n - 2], 9) : rimAlong(b, pts[n - 2], 9);
    } else {
      // Free ports land on the bounding square; re-aim each end at the rim.
      if (a.shape === 'circle') pts[0] = circleEntry(a, pts[1], pts[0], 9) || rimPoint(a, pts[1]);
      else pts[0] = rimPoint(a, pts[1]);
      if (b.shape === 'circle') pts[n - 1] = circleEntry(b, pts[n - 2], pts[n - 1], 9) || rimPoint(b, pts[n - 2]);
      else pts[n - 1] = rimPoint(b, pts[n - 2]);
    }
    l.pts = pts;
    l.smooth = routing === 'SPLINES';
    l.rounded = ported;
    if (e.labels?.length && l.chipSize) {
      const lb = e.labels[0];
      l.chipRect = rect(lb.x + o.x, lb.y + o.y, l.chipSize.w, l.chipSize.h);
    }
  }
  if (ported) separateTouchingRuns(G.links.filter((l) => l.pts.length > 3));
}
