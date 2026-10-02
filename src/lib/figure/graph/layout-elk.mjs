// Automatic layout through ELK's layered algorithm (the engine behind D2's
// ELK mode). Nodes, groups, node labels and link chips all enter ELK with
// their measured sizes, so the layout reserves room for every piece of text.
import ELK from 'elkjs/lib/elk.bundled.js';
import { rect, rimPoint } from '../geom.mjs';
import { METRICS } from './parts.mjs';

const DIRS = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };

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

export async function layoutElk(G, groupPad) {
  const vertical = G.opts.direction === 'down' || G.opts.direction === 'up';
  const routing = G.opts.routing === 'orthogonal' ? 'ORTHOGONAL' : 'POLYLINE';
  const elkNode = (n) => {
    const out = { id: n.id };
    if (n.shape === 'box') Object.assign(out, { width: n.w, height: n.h });
    else {
      Object.assign(out, { width: n.d, height: n.d });
      out.labels = [{ text: n.id, width: n.labelSize.w, height: n.labelSize.h }];
      out.layoutOptions = {
        'elk.nodeLabels.placement': vertical ? 'OUTSIDE H_RIGHT V_CENTER' : 'OUTSIDE V_BOTTOM H_CENTER',
        'elk.spacing.labelNode': String(METRICS.labelGap),
      };
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
    const e = { id: l.id, sources: [l.from], targets: [l.to] };
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
    'elk.direction': DIRS[G.opts.direction] || 'RIGHT',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.edgeRouting': routing,
    'elk.randomSeed': '1',
    'elk.spacing.componentComponent': '120',
    'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    'elk.layered.thoroughness': '20',
  };

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
      n.labelRect = rect(p.x + lb.x, p.y + lb.y, n.labelSize.w, n.labelSize.h);
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
    // ELK's ports sit on the node's side, clear of its outside label; keep its
    // first and last segments and pull each end onto the circle rim.
    const pts = raw;
    const n = pts.length;
    if (a.shape === 'circle') pts[0] = circleEntry(a, pts[1], pts[0], 9) || rimPoint(a, pts[1]);
    if (b.shape === 'circle') pts[n - 1] = circleEntry(b, pts[n - 2], pts[n - 1], 9) || rimPoint(b, pts[n - 2]);
    l.pts = pts;
    l.smooth = routing === 'POLYLINE' && G.opts.routing === 'curved';
    l.rounded = true;
    if (e.labels?.length && l.chipSize) {
      const lb = e.labels[0];
      l.chipRect = rect(lb.x + o.x, lb.y + o.y, l.chipSize.w, l.chipSize.h);
    }
  }
}
