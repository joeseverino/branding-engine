// Spec → graph model. Validates every node, link and group, cross-checks ids,
// folds legacy keys into the current ones, and infers the layout.
import { checkObject, FigureSpecError, GROUP, LINK, NODE, suggest } from '../schema.mjs';

// The layout a spec gets: explicit, else star when nodes carry compass `pos`,
// free when they carry `at`, else automatic.
export function graphLayout(spec) {
  const nodes = spec.nodes || [];
  if (spec.layout) return spec.layout;
  if (spec.center || nodes.some((n) => n && n.pos)) return 'star';
  if (nodes.some((n) => n && n.at)) return 'free';
  return 'auto';
}

export const isRadial = (layout) => layout === 'star' || layout === 'ring';

export function normalize(spec) {
  const errors = [];
  const raw = [...(spec.nodes || [])];
  // Legacy `center` (ring layout): a node that sits in the middle.
  if (spec.center) raw.push({ ...spec.center, pos: 'center' });

  const nodes = [];
  const byId = new Map();
  raw.forEach((n, i) => {
    const where = n && typeof n === 'object' && typeof n.id === 'string' ? `node "${n.id}"` : `nodes[${i}]`;
    checkObject(n, NODE, where, errors);
    if (!n || typeof n !== 'object') return;
    if (typeof n.id !== 'string' || !n.id) { errors.push(`${where}: needs an "id"`); return; }
    if (byId.has(n.id)) { errors.push(`${where}: duplicate id`); return; }
    const node = {
      id: n.id,
      label: n.label ?? n.id,
      note: n.note ?? n.addr,
      icon: n.icon,
      shape: n.shape || 'circle',
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
    };
    if (node.shape === 'circle' && !node.icon) node.icon = 'server';
    nodes.push(node);
    byId.set(node.id, node);
  });
  const ids = [...byId.keys()];
  const known = (id, where) => {
    if (byId.has(id)) return true;
    const hint = suggest(id, ids);
    errors.push(`${where}: no node "${id}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
    return false;
  };

  const layout = graphLayout(spec);

  let rawLinks = spec.links;
  if (!rawLinks && layout === 'row') rawLinks = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id, dir: 'to' }));
  const links = [];
  (rawLinks || []).forEach((l, i) => {
    const where = `links[${i}]${l && l.from ? ` (${l.from} → ${l.to})` : ''}`;
    checkObject(l, LINK, where, errors);
    if (!l || typeof l !== 'object') return;
    if (typeof l.from !== 'string' || typeof l.to !== 'string') { errors.push(`${where}: needs "from" and "to"`); return; }
    if (!known(l.from, `${where}.from`) | !known(l.to, `${where}.to`)) return;
    let link = { id: `e${i}`, from: l.from, to: l.to, label: l.label, fromLabel: l.fromLabel, toLabel: l.toLabel,
      dir: l.dir || 'both', style: l.style || 'solid', color: l.color, width: l.width, curve: l.curve };
    // `from` arrows point back at the source; store every link as source → target.
    if (link.dir === 'from') link = { ...link, from: link.to, to: link.from, dir: 'to', fromLabel: link.toLabel, toLabel: link.fromLabel };
    links.push(link);
  });

  const groups = [];
  const groupIds = new Set();
  (spec.groups || []).forEach((g, i) => {
    const where = `groups[${i}]${g && g.label ? ` ("${g.label}")` : ''}`;
    checkObject(g, GROUP, where, errors);
    if (!g || typeof g !== 'object') return;
    const id = g.id || `group${i + 1}`;
    if (groupIds.has(id)) { errors.push(`${where}: duplicate group id "${id}"`); return; }
    groupIds.add(id);
    groups.push({ id, label: g.label || '', nodes: [], style: g.style || 'solid', color: g.color, parent: g.parent });
  });
  const groupById = new Map(groups.map((g) => [g.id, g]));
  (spec.groups || []).forEach((g, i) => {
    const group = groups[i];
    if (!group || !g) return;
    for (const id of g.nodes || []) if (known(id, `groups[${i}].nodes`)) assign(byId.get(id), group.id, `groups[${i}]`);
    if (group.parent && !groupById.has(group.parent)) {
      const hint = suggest(group.parent, [...groupById.keys()]);
      errors.push(`groups[${i}].parent: no group "${group.parent}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
      group.parent = undefined;
    }
  });
  for (const n of nodes) {
    if (n.group && !n.groupAssigned) {
      if (!groupById.has(n.group)) {
        const hint = suggest(n.group, [...groupById.keys()]);
        errors.push(`node "${n.id}".group: no group "${n.group}"${hint ? ` (did you mean "${hint}"?)` : ''}`);
        n.group = undefined;
      } else assign(n, n.group, `node "${n.id}"`);
    }
  }
  function assign(node, gid, where) {
    if (node.groupAssigned && node.group !== gid) { errors.push(`${where}: node "${node.id}" is already in group "${node.group}"`); return; }
    node.group = gid;
    node.groupAssigned = true;
  }
  for (const g of groups) {
    g.nodes = nodes.filter((n) => n.group === g.id).map((n) => n.id);
    const seen = new Set([g.id]);
    for (let p = g.parent; p; p = groupById.get(p)?.parent) {
      if (seen.has(p)) { errors.push(`group "${g.label || g.id}": parent chain loops`); g.parent = undefined; break; }
      seen.add(p);
    }
  }

  if (errors.length) throw new FigureSpecError(errors);
  for (const n of nodes) delete n.groupAssigned;

  return {
    nodes, links, groups, byId,
    opts: {
      layout,
      direction: spec.direction || 'right',
      routing: spec.routing || 'straight',
      title: spec.title,
      subtitle: spec.subtitle,
      size: spec.size,
      fit: spec.fit !== false,
      nodeScale: spec.nodeScale ? (spec.nodeScale < 0.5 ? spec.nodeScale / 0.16 : spec.nodeScale) : 1,
      textScale: spec.textScale || 1,
      spread: spec.spread || 1,
    },
  };
}
