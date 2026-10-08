// Spec → graph model. Validates every node, link and group, cross-checks ids,
// folds legacy keys into the current ones, and infers the layout.
import { isRecord } from '../../guards.ts';
import { checkObject, FigureSpecError, GROUP, LINK, NODE, suggest } from '../schema.ts';
import type { GraphLayoutName, GraphSpec, GroupSpec, LinkSpec, NodeSpec } from '../spec.ts';
import type { Graph, GraphGroup, GraphLink, GraphNode } from './model.ts';

// The layout a spec gets: explicit, else star when nodes carry compass `pos`,
// free when they carry `at`, a chained row when the spec has no `links` at all
// (the original topology default), else automatic.
export function graphLayout(spec: GraphSpec): GraphLayoutName {
  const nodes = spec.nodes || [];
  const has = (key: 'pos' | 'at'): boolean => nodes.some((n) => isRecord(n) && Boolean(n[key]));
  if (spec.layout) return spec.layout;
  if (spec.center || has('pos')) return 'star';
  if (has('at')) return 'free';
  if (spec.links === undefined) return 'row';
  return 'auto';
}

// Fixed layouts in `topology` specs read a nodeScale under 0.5 the old way, as
// a fraction of the canvas where 0.16 was the default size.
const LEGACY_SCALE: readonly GraphLayoutName[] = ['star', 'ring', 'row', 'free'];

export const isRadial = (layout: GraphLayoutName): boolean => layout === 'star' || layout === 'ring';

export function normalize(spec: GraphSpec): Graph {
  const errors: string[] = [];
  const notes: string[] = [];
  const raw: unknown[] = [...(spec.nodes || [])];
  // Legacy `center` (ring layout): a node that sits in the middle.
  if (spec.center) raw.push({ ...spec.center, pos: 'center' });

  const nodes: GraphNode[] = [];
  const byId = new Map<string, GraphNode>();
  raw.forEach((entry, i) => {
    const where = isRecord(entry) && typeof entry.id === 'string' ? `node "${entry.id}"` : `nodes[${i}]`;
    const valid = checkObject<NodeSpec>(entry, NODE, where, errors);
    if (!isRecord(entry)) return;
    const { id } = entry;
    if (typeof id !== 'string' || !id) { errors.push(`${where}: needs an "id"`); return; }
    if (byId.has(id)) { errors.push(`${where}: duplicate id`); return; }
    // A node with a bad key still registers by id, so links to it do not cascade.
    const n: NodeSpec = valid ? entry : { id };
    const shared = {
      id,
      label: n.label ?? id,
      note: n.note ?? n.addr,
      role: n.role,
      color: n.color,
      pos: n.pos,
      at: n.at,
      scale: n.scale || 1,
      labelPos: n.labelPos && n.labelPos !== 'auto' ? n.labelPos : undefined,
      labelAt: n.labelAt,
      labelW: n.labelW,
      group: n.group,
      isCenter: n.pos === 'center',
      index: nodes.length,
      x: 0,
      y: 0,
    };
    const node: GraphNode = n.shape === 'box'
      ? { ...shared, shape: 'box', icon: n.icon, w: 0, h: 0 }
      : { ...shared, shape: 'circle', icon: n.icon ?? 'server', d: 0 };
    nodes.push(node);
    byId.set(node.id, node);
  });
  if (!nodes.length && !errors.length) errors.push('spec.nodes: a graph needs at least one node');
  const ids = [...byId.keys()];
  const known = (id: string, where: string): boolean => {
    if (byId.has(id)) return true;
    const hint = suggest(id, ids);
    errors.push(`${where}: no node "${id}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
    return false;
  };

  const layout = graphLayout(spec);

  const groups: GraphGroup[] = [];
  const groupIds = new Set<string>();
  // Each accepted group with the spec entry (and its index) it came from, so a
  // skipped entry never shifts the ones after it.
  const declared: Array<{ group: GraphGroup; spec: GroupSpec; index: number }> = [];
  (spec.groups || []).forEach((entry, i) => {
    const where = `groups[${i}]${isRecord(entry) && entry.label ? ` ("${String(entry.label)}")` : ''}`;
    const valid = checkObject<GroupSpec>(entry, GROUP, where, errors);
    if (!isRecord(entry)) return;
    const g: GroupSpec = valid ? entry : {};
    const id = g.id || `group${i + 1}`;
    if (groupIds.has(id)) { errors.push(`${where}: duplicate group id "${id}"`); return; }
    groupIds.add(id);
    const group: GraphGroup = { id, label: g.label || '', nodes: [], style: g.style || 'solid', color: g.color, parent: g.parent };
    groups.push(group);
    declared.push({ group, spec: g, index: i });
  });
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const assigned = new Set<string>();
  const assign = (node: GraphNode, gid: string, where: string): void => {
    if (assigned.has(node.id) && node.group !== gid) { errors.push(`${where}: node "${node.id}" is already in group "${node.group}"`); return; }
    node.group = gid;
    assigned.add(node.id);
  };
  for (const { group, spec: g, index } of declared) {
    for (const id of g.nodes || []) {
      const member = byId.get(id);
      if (member) assign(member, group.id, `groups[${index}]`);
      else known(id, `groups[${index}].nodes`);
    }
    if (group.parent && !groupById.has(group.parent)) {
      const hint = suggest(group.parent, [...groupById.keys()]);
      errors.push(`groups[${index}].parent: no group "${group.parent}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
      group.parent = undefined;
    }
  }
  for (const n of nodes) {
    if (n.group && !assigned.has(n.id)) {
      if (!groupById.has(n.group)) {
        const hint = suggest(n.group, [...groupById.keys()]);
        errors.push(`node "${n.id}".group: no group "${n.group}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
        n.group = undefined;
      } else assign(n, n.group, `node "${n.id}"`);
    }
  }
  for (const g of groups) {
    g.nodes = nodes.filter((n) => n.group === g.id).map((n) => n.id);
    const seen = new Set([g.id]);
    for (let p = g.parent; p; p = groupById.get(p)?.parent) {
      if (seen.has(p)) { errors.push(`group "${g.label || g.id}": parent chain loops`); g.parent = undefined; break; }
      seen.add(p);
    }
  }

  const hasContent = (g: GraphGroup): boolean => g.nodes.length > 0 || groups.some((k) => k.parent === g.id && hasContent(k));
  // A link end is a node or a group (its border). A name that is both is
  // ambiguous; a link between a group and something inside it has no border to
  // cross.
  const groupKnown = (id: string): boolean => groupById.has(id);
  const endpoint = (id: string, where: string): boolean => {
    if (byId.has(id) && groupKnown(id)) { errors.push(`${where}: "${id}" names both a node and a group; rename one`); return false; }
    const group = groupById.get(id);
    if (group) {
      if (!hasContent(group)) { errors.push(`${where}: group "${group.label || id}" has no nodes to link to`); return false; }
      return true;
    }
    if (byId.has(id)) return true;
    const hint = suggest(id, [...ids, ...groupById.keys()]);
    errors.push(`${where}: no node or group "${id}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
    return false;
  };
  const ancestors = (id: string): string[] => {
    const out: string[] = [];
    const node = byId.get(id);
    let p = node ? node.group : groupById.get(id)?.parent;
    for (const seen = new Set<string>(); p && !seen.has(p); p = groupById.get(p)?.parent) { seen.add(p); out.push(p); }
    return out;
  };
  const nestingOk = (a: string, b: string, where: string): boolean => {
    const label = (id: string): string => (groupKnown(id) ? `group "${groupById.get(id)?.label || id}"` : `"${id}"`);
    if (ancestors(a).includes(b) || ancestors(b).includes(a)) {
      const [inner, outer] = ancestors(a).includes(b) ? [a, b] : [b, a];
      errors.push(`${where}: ${label(inner)} sits inside ${label(outer)}, so a link between them has no border to cross`);
      return false;
    }
    return true;
  };

  const rawLinks: readonly unknown[] = spec.links
    ?? (layout === 'row' ? nodes.slice(1).map((n, i): LinkSpec => ({ from: nodes[i].id, to: n.id, dir: 'to' })) : []);
  const links: GraphLink[] = [];
  rawLinks.forEach((entry, i) => {
    const where = `links[${i}]${isRecord(entry) && entry.from ? ` (${String(entry.from)} → ${String(entry.to)})` : ''}`;
    const valid = checkObject<LinkSpec>(entry, LINK, where, errors);
    if (!isRecord(entry)) return;
    const { from, to } = entry;
    if (typeof from !== 'string' || typeof to !== 'string') { errors.push(`${where}: needs "from" and "to"`); return; }
    const fromOk = endpoint(from, `${where}.from`);
    const toOk = endpoint(to, `${where}.to`);
    if (!fromOk || !toOk) return;
    if (from === to) { notes.push(`link ${from} → ${to} joins a node to itself and is not drawn`); return; }
    if (!nestingOk(from, to, where)) return;
    const l: LinkSpec = valid ? entry : {};
    const dir = l.dir || 'both';
    const fromGroup = groupKnown(from), toGroup = groupKnown(to);
    const common = { id: `e${i}`, index: i, label: l.label, style: l.style || 'solid', color: l.color, width: l.width, curve: l.curve, pts: [] };
    // `from` arrows point back at the source; store every link as source → target.
    links.push(dir === 'from'
      ? { ...common, from: to, to: from, fromGroup: toGroup, toGroup: fromGroup, dir: 'to', fromLabel: l.toLabel, toLabel: l.fromLabel }
      : { ...common, from, to, fromGroup, toGroup, dir, fromLabel: l.fromLabel, toLabel: l.toLabel });
  });

  if (errors.length) throw new FigureSpecError(errors);

  // A group with nothing in it (directly or through its children) isn't drawn.
  const drawn = groups.filter((g): boolean => {
    if (hasContent(g)) return true;
    notes.push(`group "${g.label || g.id}" has no nodes and is not drawn`);
    return false;
  });

  const legacy = spec.template === 'topology' && LEGACY_SCALE.includes(layout) && spec.nodeScale !== undefined && spec.nodeScale < 0.5;

  return {
    nodes, links, groups: drawn, byId, groupById: new Map(drawn.map((g) => [g.id, g])), notes,
    opts: {
      layout,
      direction: spec.direction || 'right',
      directionSet: Boolean(spec.direction),
      routing: spec.routing || 'orthogonal',
      title: spec.title,
      subtitle: spec.subtitle,
      size: spec.size,
      fit: spec.fit !== false,
      nodeScale: spec.nodeScale ? (legacy ? spec.nodeScale / 0.16 : spec.nodeScale) : 1,
      textScale: spec.textScale || 1,
      spread: spec.spread || 1,
    },
  };
}
