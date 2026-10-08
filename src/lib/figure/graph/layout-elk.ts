// Automatic layout through ELK's layered algorithm (the engine behind D2's
// ELK mode). Nodes, groups, node labels and link chips all enter ELK with
// their measured sizes, so the layout reserves room for every piece of text.
import elkModule, { type ElkExtendedEdge, type ElkNode, type ElkPort } from 'elkjs/lib/elk.bundled.js';
import { required } from '../../guards.ts';
import { rect, rimPoint, segments, type Body, type Point, type Rect } from '../geom.ts';
import type { GraphDirection, GraphRouting } from '../spec.ts';
import type { GroupPad } from './frame.ts';
import type { Graph, GraphLink, GraphNode } from './model.ts';
import { METRICS } from './parts.ts';

type Side = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';

const DIRS: Readonly<Record<GraphDirection, string>> = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' };
const ROUTING: Readonly<Record<GraphRouting, string>> = { orthogonal: 'ORTHOGONAL', straight: 'POLYLINE', curved: 'SPLINES' };
// Which side links enter and leave by, per direction.
const SIDES: Readonly<Record<GraphDirection, readonly [inSide: Side, outSide: Side]>> = {
  right: ['WEST', 'EAST'], left: ['EAST', 'WEST'], down: ['NORTH', 'SOUTH'], up: ['SOUTH', 'NORTH'],
};

// A 1×1 port at the middle of one side of a w×h node, inside the border: ELK
// attaches a link at the port's outer edge, which then lies on the side.
function port(id: string, side: Side, w: number, h: number): ElkPort {
  const corner: Record<Side, readonly [number, number]> = { WEST: [0, h / 2 - 0.5], EAST: [w - 1, h / 2 - 0.5], NORTH: [w / 2 - 0.5, 0], SOUTH: [w / 2 - 0.5, h - 1] };
  const [x, y] = corner[side];
  return { id, width: 1, height: 1, x, y, layoutOptions: { 'elk.port.side': side } };
}

// An orthogonal end: on the segment's axis through the node center, `gap`
// past the rim, facing the next point. Ports sit at side midpoints, so the
// segment already runs through the center line.
function rimAlong(n: Body, next: Point, gap: number): Point {
  const dx = next.x - n.x, dy = next.y - n.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const half = n.shape === 'box' ? (horizontal ? n.w / 2 : n.h / 2) : n.d / 2;
  return horizontal
    ? { x: n.x + Math.sign(dx) * (half + gap), y: n.y }
    : { x: n.x, y: n.y + Math.sign(dy) * (half + gap) };
}

const pointAt = (pts: readonly Point[], i: number): Point => required(pts[i], `point ${i} of a link`);

// Two links whose straight runs share a track and nearly meet end to end read
// as one line. ELK only spaces runs that overlap, so nudge the later link's
// inner run sideways. Runs touching an end (the port segments) stay put, and
// so do fan-outs, which share a trunk by design.
type PathLink = Pick<GraphLink, 'pts'>;

interface Run {
  li: number;
  link: Pick<GraphLink, 'from' | 'to' | 'pts'>;
  i: number;
  vertical: boolean;
  at: number;
  lo: number;
  hi: number;
}

export function separateTouchingRuns(links: Array<Pick<GraphLink, 'from' | 'to' | 'pts'>>, { gap = 40, shift = 18 } = {}): void {
  const runs: Run[] = [];
  links.forEach((l, li) => {
    const inner = [...segments(l.pts)].slice(1, -1);
    for (const [k, [a, b]] of inner.entries()) {
      const i = k + 1;
      const vertical = Math.abs(a.x - b.x) < 0.5, horizontal = Math.abs(a.y - b.y) < 0.5;
      if (vertical || horizontal) runs.push({ li, link: l, i, vertical, at: vertical ? a.x : a.y, lo: Math.min(vertical ? a.y : a.x, vertical ? b.y : b.x), hi: Math.max(vertical ? a.y : a.x, vertical ? b.y : b.x) });
    }
  });
  const moved = new Set<string>();
  for (const r of runs) {
    for (const o of runs) {
      if (o.li <= r.li || o.vertical !== r.vertical || moved.has(`${o.li}:${o.i}`)) continue;
      // Links that leave or reach the same node share a trunk on purpose.
      if (r.link.from === o.link.from || r.link.to === o.link.to) continue;
      if (Math.abs(o.at - r.at) > 4) continue;
      const apart = Math.max(o.lo - r.hi, r.lo - o.hi);
      if (apart < 0 || apart > gap) continue; // overlapping runs are ELK's to space
      const l = o.link;
      const k = o.vertical ? 'x' : 'y';
      const here = pointAt(l.pts, o.i), next = pointAt(l.pts, o.i + 1);
      // Move away from the other run's far end so the two don't look joined.
      const dir = here[k] >= r.at ? 1 : -1;
      l.pts[o.i] = { ...here, [k]: here[k] + dir * shift };
      l.pts[o.i + 1] = { ...next, [k]: next[k] + dir * shift };
      moved.add(`${o.li}:${o.i}`);
    }
  }
}

// ELK places connected nodes a few pixels apart on the cross axis, and a link
// that ends square-on at each center then steps by those pixels just before
// its arrow. Snap the run after a short step onto the run before it, so the
// line stays straight and meets its end a hair off center.
export function straightenJogs(links: Array<PathLink & Pick<GraphLink, 'chipRect'>>, { tolerance = 14 } = {}): void {
  for (const l of links) {
    const pts = l.pts;
    for (let i = 1; i < pts.length - 2; i++) {
      const [a, b, c, d] = pts.slice(i - 1, i + 3);
      if (!a || !b || !c || !d) break;
      const vertical = Math.abs(b.x - c.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(c.y - d.y) < 0.5;
      const horizontal = Math.abs(b.y - c.y) < 0.5 && Math.abs(a.x - b.x) < 0.5 && Math.abs(c.x - d.x) < 0.5;
      if (!vertical && !horizontal) continue;
      const k = vertical ? 'y' : 'x';
      const step = c[k] - b[k];
      if (!step || Math.abs(step) > tolerance) continue;
      const chip = l.chipRect, size = k === 'y' ? 'h' : 'w';
      if (chip && Math.abs(chip[k] + chip[size] / 2 - c[k]) < 1) l.chipRect = { ...chip, [k]: chip[k] - step };
      for (let j = i + 1; j < pts.length; j++) {
        const p = pts[j];
        if (!p || Math.abs(p[k] - c[k]) >= 0.5) break;
        pts[j] = { ...p, [k]: b[k] };
      }
      pts.splice(i, 2);
      i = Math.max(0, i - 2);
    }
  }
}

// An end on a group's border: on the segment's axis through `p` (the port),
// `gap` outside the side it meets, facing `next`.
function borderAlong(r: Rect, p: Point, next: Point, gap: number): Point {
  const dx = next.x - p.x, dy = next.y - p.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx < 0 ? r.x - gap : r.x + r.w + gap, y: p.y };
  }
  return { x: p.x, y: dy < 0 ? r.y - gap : r.y + r.h + gap };
}

// Where a ray from p toward q first meets a circle node (plus `gap`): the rim
// point that faces p.
function circleEntry(n: { x: number; y: number; d: number }, p: Point, q: Point, gap: number): Point | null {
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

type End =
  | { kind: 'node'; node: GraphNode }
  | { kind: 'group'; rect: Rect; body: Body };

const bodyOf = (end: End): Body => (end.kind === 'node' ? end.node : end.body);

export async function layoutElk(
  G: Graph,
  groupPad: GroupPad,
  direction: GraphDirection = G.opts.direction,
  { wrap = false }: { wrap?: boolean } = {},
): Promise<void> {
  const vertical = direction === 'down' || direction === 'up';
  const routing = ROUTING[G.opts.routing];
  const ported = routing === 'ORTHOGONAL';
  const [inSide, outSide] = SIDES[direction];
  const elkNode = (n: GraphNode): ElkNode => {
    const [w, h] = n.shape === 'box' ? [n.w, n.h] : [n.d, n.d];
    const layoutOptions: Record<string, string> = {};
    const out: ElkNode = { id: n.id, width: w, height: h, layoutOptions };
    if (n.shape === 'circle') {
      const label = required(n.labelSize, `the label size of "${n.id}"`);
      out.labels = [{ text: n.id, width: label.w, height: label.h }];
      Object.assign(layoutOptions, {
        'elk.nodeLabels.placement': vertical ? 'OUTSIDE H_RIGHT V_CENTER' : 'OUTSIDE V_BOTTOM H_CENTER',
        'elk.spacing.labelNode': String(METRICS.labelGap + 6),
      });
    }
    if (ported) {
      // Every link enters and leaves through the middle of a side, so lines meet
      // a circle square-on and fan out from one trunk.
      out.ports = [port(`${n.id}\u241Fin`, inSide, w, h), port(`${n.id}\u241Fout`, outSide, w, h)];
      layoutOptions['elk.portConstraints'] = 'FIXED_POS';
    }
    return out;
  };

  // Build the compound tree: groups nest, nodes sit in their group.
  const root: ElkNode = { id: 'root', children: [], edges: [] };
  const containers = new Map<string, ElkNode>([['root', root]]);
  const container = (id: string): ElkNode => required(containers.get(id), `ELK container "${id}"`);
  const parentOf = new Map<string, string>();
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
    const box = container(g.id);
    if (ported) {
      box.ports = [inSide, outSide].map((side, i) => ({ id: `${g.id}\u241F${i ? 'out' : 'in'}`, width: 1, height: 1, layoutOptions: { 'elk.port.side': side } }));
      Object.assign(box.layoutOptions ?? {}, { 'elk.portConstraints': 'FIXED_SIDE' });
    }
  }
  for (const g of G.groups) container(parentOf.get(g.id) ?? 'root').children?.push(container(g.id));
  for (const n of G.nodes) {
    parentOf.set(n.id, n.group || 'root');
    container(n.group || 'root').children?.push(elkNode(n));
  }
  const chain = (id: string): string[] => { const out: string[] = []; for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p); return out; };
  const lca = (a: string, b: string): string => { const ca = chain(a); const cb = new Set(chain(b)); return ca.find((x) => cb.has(x)) || 'root'; };

  for (const l of G.links) {
    if (l.from === l.to) continue;
    const e: ElkExtendedEdge = ported
      ? { id: l.id, sources: [`${l.from}\u241Fout`], targets: [`${l.to}\u241Fin`] }
      : { id: l.id, sources: [l.from], targets: [l.to] };
    if (l.label && l.chipSize) {
      e.labels = [{ text: l.id, width: l.chipSize.w, height: l.chipSize.h,
        layoutOptions: { 'elk.edgeLabels.inline': 'true', 'elk.edgeLabels.placement': 'CENTER' } }];
    }
    container(lca(l.from, l.to)).edges?.push(e);
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
  for (const g of G.groups) Object.assign(container(g.id).layoutOptions ?? {}, spacing);
  root.layoutOptions = {
    ...spacing,
    'elk.algorithm': 'layered',
    'elk.direction': DIRS[direction],
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

  const out = await new elkModule.default().layout(root);

  // Absolute positions: ELK coordinates are relative to the parent container.
  const abs = new Map<string, Point>([['root', { x: 0, y: 0 }]]);
  const elkById = new Map<string, ElkNode>();
  const walk = (node: ElkNode, ox: number, oy: number): void => {
    for (const ch of node.children || []) {
      const x = ox + (ch.x ?? 0), y = oy + (ch.y ?? 0);
      abs.set(ch.id, { x, y });
      elkById.set(ch.id, ch);
      walk(ch, x, y);
    }
  };
  walk(out, 0, 0);
  const placed = (id: string): { p: Point; w: number; h: number; elk: ElkNode } => {
    const elk = required(elkById.get(id), `ELK node "${id}"`);
    return { p: required(abs.get(id), `the position of "${id}"`), w: elk.width ?? 0, h: elk.height ?? 0, elk };
  };

  for (const n of G.nodes) {
    const { p, w, h, elk } = placed(n.id);
    n.x = p.x + w / 2;
    n.y = p.y + h / 2;
    if (n.shape === 'circle') {
      const lb = required(elk.labels?.[0], `the label of "${n.id}"`);
      const label = required(n.labelSize, `the label size of "${n.id}"`);
      // ELK can seat an outside label flush against the node; hold the gap.
      const gap = METRICS.labelGap + 4;
      const lx = vertical ? Math.max(lb.x ?? 0, w + gap) : (lb.x ?? 0);
      const ly = vertical ? (lb.y ?? 0) : Math.max(lb.y ?? 0, h + gap);
      n.labelRect = rect(p.x + lx, p.y + ly, label.w, label.h);
      n.labelAlign = vertical ? 'left' : 'center';
    }
  }
  for (const g of G.groups) {
    const { p, w, h } = placed(g.id);
    g.rect = rect(p.x, p.y, w, h);
  }

  const edgesOut: ElkExtendedEdge[] = [];
  const collect = (node: ElkNode): void => { edgesOut.push(...(node.edges || [])); for (const ch of node.children || []) collect(ch); };
  collect(out);
  const elkEdge = new Map(edgesOut.map((e) => [e.id, e]));

  const endOf = (id: string, isGroup: boolean): End => {
    if (!isGroup) return { kind: 'node', node: required(G.byId.get(id), `node "${id}"`) };
    const r = required(required(G.groupById.get(id), `group "${id}"`).rect, `the rect of group "${id}"`);
    return { kind: 'group', rect: r, body: { shape: 'box', x: r.x + r.w / 2, y: r.y + r.h / 2, w: r.w, h: r.h } };
  };
  for (const l of G.links) {
    const a = endOf(l.from, l.fromGroup), b = endOf(l.to, l.toGroup);
    const e = elkEdge.get(l.id);
    const section = e?.sections?.[0];
    if (!e || !section) { l.pts = []; continue; }
    const o = abs.get(e.container || 'root') || { x: 0, y: 0 };
    const place = (p: Point): Point => ({ x: p.x + o.x, y: p.y + o.y });
    const start = place(section.startPoint), end = place(section.endPoint);
    const bends = (section.bendPoints || []).map(place);
    const afterStart = bends[0] ?? end;
    let first: Point, last: Point;
    if (ported) {
      // Ports sit on the rim at a side's midpoint: pull each end back off it.
      // A group's port sits anywhere along its side: keep the line where ELK
      // put it and stop just short of the border.
      first = a.kind === 'group' ? borderAlong(a.rect, start, afterStart, 9) : rimAlong(a.node, afterStart, 9);
      const beforeEnd = bends.at(-1) ?? first;
      last = b.kind === 'group' ? borderAlong(b.rect, end, beforeEnd, 9) : rimAlong(b.node, beforeEnd, 9);
    } else {
      // Free ports land on the bounding square; re-aim each end at the rim.
      const [from, to] = [bodyOf(a), bodyOf(b)];
      first = (from.shape === 'circle' && circleEntry(from, afterStart, start, 9)) || rimPoint(from, afterStart);
      const beforeEnd = bends.at(-1) ?? first;
      last = (to.shape === 'circle' && circleEntry(to, beforeEnd, end, 9)) || rimPoint(to, beforeEnd);
    }
    const pts = [first, ...bends, last];
    l.pts = pts;
    l.smooth = routing === 'SPLINES';
    l.rounded = ported;
    const chip = e.labels?.[0];
    if (chip && l.chipSize) {
      l.chipRect = rect((chip.x ?? 0) + o.x, (chip.y ?? 0) + o.y, l.chipSize.w, l.chipSize.h);
    }
  }
  if (ported) {
    straightenJogs(G.links.filter((l) => l.pts.length > 3));
    separateTouchingRuns(G.links.filter((l) => l.pts.length > 3));
  }
}
