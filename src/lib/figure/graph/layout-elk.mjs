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

  for (const l of G.links) {
    const a = G.byId.get(l.from), b = G.byId.get(l.to);
    const e = elkEdge.get(l.id);
    if (!e || !e.sections?.length) { l.pts = []; continue; }
    const o = abs.get(e.container || 'root') || { x: 0, y: 0 };
    const s = e.sections[0];
    const raw = [s.startPoint, ...(s.bendPoints || []), s.endPoint].map((p) => ({ x: p.x + o.x, y: p.y + o.y }));
    const pts = raw;
    const n = pts.length;
    if (ported) {
      // Ports sit on the rim at a side's midpoint: pull each end back off it.
      pts[0] = rimAlong(a, pts[1], 9);
      pts[n - 1] = rimAlong(b, pts[n - 2], 9);
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
}
