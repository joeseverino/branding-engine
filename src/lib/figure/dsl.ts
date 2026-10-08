// The .fig text format: a terse way to write a topology spec.
//
//   title: Request path
//   layout: auto                    # auto | star | ring | row | grid | free
//   direction: right                # auto layout only
//
//   Laptop [icon: laptop]
//   Gateway [icon: shield, anchor, note: auth + TLS]
//
//   Private network [dashed] {      # a group; nest freely
//     app-server [icon: server]
//     Database [icon: database]
//   }
//
//   Laptop > Gateway: HTTPS
//   Gateway > app-server > Database
//
// Arrows: >  <  <>  -   (solid)   -->  <--  <-->  --   (dashed)
// `->`, `<-` and `<->` are accepted as aliases. Operators need spaces around
// them, so `app-server` is one name. Quote a name that contains an operator,
// a comma or a colon: "Build > Test". A name used in a link before it is
// declared becomes a plain node; only a declaration (the name on its own line,
// or with [props]) puts a node in the group it sits in. Comments start with #
// or // at the start of a line or after a space. Everything compiles to the
// JSON spec the topology template takes, and every problem in the file is
// reported at once, with its line number.
import { checkObject, FigureSpecError, GROUP, LINK, NODE, suggest, validateSpec, type Check } from './schema.ts';
import type { GroupSpec, LinkDir, LinkSpec, NodeSpec, TopologySpec } from './spec.ts';

export interface ParsedFig extends TopologySpec {
  nodes: NodeSpec[];
  links: LinkSpec[];
  groups?: GroupSpec[];
}


const DIRECTIVES = ['title', 'subtitle', 'layout', 'direction', 'theme', 'size', 'routing', 'textScale', 'nodeScale', 'spread'];
// Directives that may also be written without a colon: `layout star`.
const BARE = ['layout', 'direction', 'theme', 'size', 'routing'];
type Operator = readonly [token: string, dir: LinkDir, style?: 'dashed'];
const OPERATORS: readonly Operator[] = [
  ['<-->', 'both', 'dashed'], ['-->', 'to', 'dashed'], ['<--', 'from', 'dashed'],
  ['<->', 'both'], ['<>', 'both'], ['->', 'to'], ['<-', 'from'],
  ['--', 'none', 'dashed'], ['>', 'to'], ['<', 'from'], ['-', 'none'],
];

type Flags = Readonly<Record<string, readonly [key: string, value: string]>>;

const NODE_FLAGS: Flags = {
  anchor: ['role', 'anchor'], attacker: ['role', 'attacker'], muted: ['role', 'muted'],
  box: ['shape', 'box'], circle: ['shape', 'circle'],
};
const LINK_FLAGS: Flags = {
  dashed: ['style', 'dashed'], dotted: ['style', 'dotted'], solid: ['style', 'solid'],
  accent: ['color', 'accent'], muted: ['color', 'muted'],
};
const GROUP_FLAGS: Flags = { dashed: ['style', 'dashed'], solid: ['style', 'solid'] };

const { id: _nodeId, group: _nodeGroup, ...NODE_PROPS } = NODE;
const { from: _linkFrom, to: _linkTo, ...LINK_PROPS } = LINK;
const { id: _groupId, nodes: _groupNodes, parent: _groupParent, ...GROUP_PROPS } = GROUP;

type Kind = 'node' | 'link' | 'group';
const KINDS: Readonly<Record<Kind, { flags: Flags; keys: Readonly<Record<string, Check>> }>> = {
  node: { flags: NODE_FLAGS, keys: NODE_PROPS },
  link: { flags: LINK_FLAGS, keys: LINK_PROPS },
  group: { flags: GROUP_FLAGS, keys: GROUP_PROPS },
};

const unescape = (s: string): string => s.replace(/\\n/g, '\n').replace(/\\"/g, '"');
const unquote = (s: string): string => {
  const t = s.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? unescape(t.slice(1, -1)) : unescape(t);
};

// Walk `s` outside quotes and brackets, calling fn(i) at each top-level index;
// fn returns a number of characters to skip, or undefined.
function walkTop(s: string, fn: (i: number) => number | false | undefined): void {
  let depth = 0, quote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === '"') quote = false;
      continue;
    }
    if (ch === '"') { quote = true; continue; }
    if (ch === '[' || ch === '(') { depth++; continue; }
    if (ch === ']' || ch === ')') { depth--; continue; }
    if (depth === 0) {
      const skip = fn(i);
      if (skip === false) return;
      if (skip) i += skip - 1;
    }
  }
}

function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let from = 0;
  walkTop(s, (i) => {
    if (!s.startsWith(sep, i)) return undefined;
    out.push(s.slice(from, i));
    from = i + sep.length;
    return sep.length;
  });
  out.push(s.slice(from));
  return out;
}

function stripComment(line: string): string {
  let cut = line.length;
  walkTop(line, (i) => {
    const start = i === 0 || /\s/.test(line.charAt(i - 1));
    if (start && (line[i] === '#' || line.startsWith('//', i))) { cut = i; return false; }
    return undefined;
  });
  return line.slice(0, cut);
}

// Operators at top level with whitespace on both sides. Returns the pieces
// between them, the operators, and whether one dangles at either end.
interface SplitOps {
  parts: string[];
  ops: Operator[];
  dangling: boolean;
}

function splitOps(s: string): SplitOps {
  const t = ` ${s} `;
  const parts: string[] = [], ops: Operator[] = [];
  let from = 0;
  walkTop(t, (i) => {
    if (!/\s/.test(t.charAt(i))) return undefined;
    for (const op of OPERATORS) {
      const end = i + 1 + op[0].length;
      if (t.startsWith(op[0], i + 1) && /\s/.test(t[end] || '')) {
        parts.push(t.slice(from, i));
        ops.push(op);
        from = end;
        return op[0].length + 1;
      }
    }
    return undefined;
  });
  parts.push(t.slice(from));
  const trimmed = parts.map((p) => p.trim());
  return { parts: trimmed, ops, dangling: ops.length > 0 && (!trimmed.at(0) || !trimmed.at(-1)) };
}

function parseValue(raw: string): unknown {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return unescape(v.slice(1, -1));
  if (v.startsWith('[') && v.endsWith(']')) return splitTop(v.slice(1, -1), ',').map((x) => parseValue(x));
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return unescape(v);
}

// The keys and flags in a [props] body, without resolving them.
const propNames = (body: string): string[] => splitTop(body, ',').map((p) => p.trim()).filter(Boolean).map((p) => (splitTop(p, ':')[0] ?? '').trim());

// "[a: 1, b: "x, y", flag]" → { a: 1, b: 'x, y' }, flags resolved for `kind`.
function parseProps(body: string, kind: Kind, where: string, errors: string[]): Record<string, unknown> {
  const { flags, keys } = KINDS[kind];
  const out: Record<string, unknown> = {};
  for (const part of splitTop(body, ',')) {
    const p = part.trim();
    if (!p) continue;
    const [k = '', ...rest] = splitTop(p, ':');
    if (rest.length) {
      out[k.trim()] = parseValue(rest.join(':'));
    } else if (flags[p]) {
      const [key, val] = flags[p];
      out[key] = val;
    } else if (keys[p]) {
      errors.push(`${where}: "${p}" needs a value, like [${p}: …]`);
    } else {
      const other = Object.entries(KINDS).find(([k, v]) => k !== kind && v.flags[p]);
      const hint = suggest(p, [...Object.keys(flags), ...Object.keys(keys)]);
      errors.push(other
        ? `${where}: "${p}" is a ${other[0]} flag, not a ${kind} flag`
        : `${where}: unknown ${kind} flag "${p}"${hint ? ` (did you mean "${hint}"?)` : ''}; flags: ${Object.keys(flags).join(', ')}`);
    }
  }
  return out;
}

// Peel a trailing [props] off a fragment: 'Mac [icon: laptop]' → ['Mac', 'icon: laptop'].
function peel(s: string): [name: string, body: string | null] {
  const t = s.trim();
  if (!t.endsWith(']')) return [t, null];
  // The last bracket opened at depth 0 is the one that closes at the end.
  let open = -1, depth = 0, quote = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quote) { if (ch === '\\') i++; else if (ch === '"') quote = false; continue; }
    if (ch === '"') quote = true;
    else if (ch === '[') { if (depth === 0) open = i; depth++; }
    else if (ch === ']') depth--;
  }
  return open >= 0 ? [t.slice(0, open).trim(), t.slice(open + 1, -1)] : [t, null];
}

// Group ids carry a character an unquoted name can't start with.
const groupId = (n: number): string => `#g${n}`;

// An arrow written without spaces ("A->B", "A<>B", "A=>B"), or one hanging off
// either end of a name.
const looksLikeArrow = (name: string): boolean => ['->', '<-', '<>', '=>'].some((op) => name.includes(op))
  || /^[<>]|[<>]$/.test(name);

interface DraftNode extends NodeSpec {
  id: string;
  groupWhere?: string;
  groupBy?: 'decl' | 'ref';
}

interface DraftGroup extends GroupSpec {
  id: string;
  label: string;
  nodes: string[];
}

interface LinkEnd {
  id: string;
  label?: string;
}

export function parseFig(text: string): ParsedFig {
  const errors: string[] = [];
  const directives: Record<string, unknown> = {};
  const draftNodes: DraftNode[] = [];
  const links: LinkSpec[] = [];
  const groups: DraftGroup[] = [];
  const nodes = new Map<string, DraftNode>();
  const stack: DraftGroup[] = [];
  let groupSeq = 0;

  const checkName = (name: string, where: string): boolean => {
    if (!name) { errors.push(`${where}: empty node name`); return false; }
    return true;
  };

  // A node, created on first mention. `declare` marks a declaration, which is
  // what places a node in the group it is written in.
  const node = (fragment: string, where: string, { declare = false, props = null }: { declare?: boolean; props?: Record<string, unknown> | null } = {}): DraftNode | null => {
    const [rawName, body] = props === null ? peel(fragment) : [fragment, null];
    const quoted = rawName.trim().startsWith('"');
    const name = unquote(rawName);
    if (!checkName(name, where)) return null;
    if (!quoted && looksLikeArrow(name)) {
      errors.push(`${where}: "${name}" looks like a link written without spaces; put spaces around the arrow ("A -> B"), or quote the name`);
      return null;
    }
    if (!quoted && /:\s/.test(name)) {
      errors.push(`${where}: "${name}" is not a node name, a directive, or a link; quote it if it is a name`);
      return null;
    }
    let n = nodes.get(name);
    const created = !n;
    if (!n) {
      n = { id: name };
      nodes.set(name, n);
      draftNodes.push(n);
    }
    const p = props || (body !== null ? parseProps(body, 'node', where, errors) : null);
    if (p) {
      checkObject<NodeSpec>(p, NODE_PROPS, `${where}: node "${name}"`, errors);
      Object.assign(n, p);
    }
    // Group membership: a declaration inside a group places the node there; a
    // name first mentioned in a link inside a group joins it until a
    // declaration elsewhere says otherwise.
    const g = stack[stack.length - 1];
    if (declare || p) {
      if (g) {
        if (n.group && n.group !== g.id && n.groupBy === 'decl') {
          const other = groups.find((x) => x.id === n.group);
          errors.push(`${where}: "${name}" is already declared in group "${other?.label}" (${n.groupWhere}); a node sits in one group`);
        } else {
          Object.assign(n, { group: g.id, groupWhere: where, groupBy: 'decl' });
        }
      } else if (n.groupBy === 'ref') {
        delete n.group;
        delete n.groupBy;
      }
    } else if (g && created) {
      Object.assign(n, { group: g.id, groupWhere: where, groupBy: 'ref' });
    }
    return n;
  };

  // Group labels, in file order, so a link can name a group declared below it.
  const groupsByLabel = Map.groupBy(
    text.split(/\r?\n/)
      .map((raw) => stripComment(raw).trim())
      .filter((t) => t.endsWith('{') && !/^([A-Za-z][A-Za-z0-9]*)\s*:/.test(t))
      .map((t, i) => ({ label: unquote(peel(t.slice(0, -1))[0]), id: groupId(i + 1) })),
    (group) => group.label,
  );
  const groupEnds = new Map<string, string>(); // label → first line it was used as a link end

  const setDirective = (key: string, val: string, where: string): void => {
    const v = parseValue(val);
    if (val.trim() === '') { errors.push(`${where}: "${key}" needs a value`); return; }
    directives[key] = key === 'size' && typeof v === 'string' && /^\d+x\d+$/.test(v) ? v.split('x').map(Number) : v;
  };

  // "A > B, C: label [props]". The props may sit after the label or, with no
  // label, at the end of the line; a trailing bracket whose keys are all node
  // keys belongs to the last endpoint instead.
  const link = (headRaw: string, labelRaw: string, first: SplitOps, where: string): void => {
    let head = headRaw, label = labelRaw.trim(), linkProps: Record<string, unknown> = {};
    if (label) {
      const [rest, body] = peel(label);
      if (body !== null) { linkProps = parseProps(body, 'link', where, errors); label = rest; }
    }
    let ops = first;
    const [, lastBody] = peel(ops.parts.at(-1) ?? '');
    if (lastBody !== null) {
      const names = propNames(lastBody);
      const isLink = (k: string): boolean => k in LINK_PROPS || k in LINK_FLAGS;
      const isNode = (k: string): boolean => k in NODE_PROPS || k in NODE_FLAGS;
      if (!names.every(isLink) && names.every(isNode)) {
        // Node props on the last endpoint: leave them in place.
      } else {
        linkProps = { ...parseProps(lastBody, 'link', where, errors), ...linkProps };
        head = head.slice(0, head.lastIndexOf('[')).trimEnd();
        ops = splitOps(head);
      }
    }
    checkObject<LinkSpec>(linkProps, LINK_PROPS, `${where}: link`, errors);
    if (ops.dangling) { errors.push(`${where}: a link is missing a node on one side of its arrow`); return; }
    for (const [i, op] of ops.ops.entries()) {
      const froms = splitTop(ops.parts[i] ?? '', ',').map((s) => s.trim()).filter(Boolean);
      const tos = splitTop(ops.parts[i + 1] ?? '', ',').map((s) => s.trim()).filter(Boolean);
      // A bare name that matches a group's label is that group: the link ends
      // at its border.
      const ends = (list: string[]): Array<LinkEnd | null> => list.map((frag) => {
        const [nm, body] = peel(frag);
        const name = unquote(nm);
        const matches = body === null ? groupsByLabel.get(name) : undefined;
        if (matches) {
          const [only, ...others] = matches;
          if (!only || others.length) { errors.push(`${where}: ${matches.length} groups are labelled "${name}"; give them different labels to link to one`); return null; }
          if (!groupEnds.has(name)) groupEnds.set(name, where);
          return { id: only.id, label: name };
        }
        return node(frag, where, { declare: body !== null });
      });
      const A = ends(froms), B = ends(tos);
      for (const a of A) for (const b of B) {
        if (!a || !b) continue;
        if (a.id === b.id) { errors.push(`${where}: "${a.label || a.id}" links to itself, which can't be drawn`); continue; }
        const lk: LinkSpec = { from: a.id, to: b.id, dir: op[1] };
        if (op[2]) lk.style = op[2];
        if (label && i === ops.ops.length - 1) lk.label = unquote(label);
        links.push({ ...lk, ...linkProps });
      }
      // "A > B > C": the right side of one hop is the left side of the next.
      ops.parts[i + 1] = tos.map((s) => peel(s)[0]).join(', ');
    }
  };

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const where = `line ${idx + 1}`;
    const line = stripComment(rawLine).trim();
    if (!line) return;

    if (line === '}') {
      if (!stack.length) errors.push(`${where}: "}" with no open group`);
      stack.pop();
      return;
    }

    // Directives first: "title: A - B" is a title, not a link.
    const kv = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:(?!\/\/)\s*(.*)$/);
    if (kv) {
      const [, name = '', value = ''] = kv;
      const key = DIRECTIVES.find((d) => d.toLowerCase() === name.toLowerCase());
      if (key) { setDirective(key, value, where); return; }
      const hint = suggest(name, DIRECTIVES);
      errors.push(hint
        ? `${where}: unknown directive "${name}" (did you mean "${hint}"?)`
        : `${where}: "${name}:" is not a directive (${DIRECTIVES.join(', ')}); for a node note use ${name} [note: …]`);
      return;
    }
    const [, word = '', arg = ''] = line.match(/^([A-Za-z]+)\s+(\S+)$/) ?? [];
    if (arg && BARE.includes(word) && !splitOps(line).ops.length) { setDirective(word, arg, where); return; }

    if (line.endsWith('{')) {
      const [name, body] = peel(line.slice(0, -1));
      const props = body ? parseProps(body, 'group', where, errors) : {};
      checkObject<GroupSpec>(props, GROUP_PROPS, `${where}: group "${unquote(name)}"`, errors);
      const g: DraftGroup = { id: groupId(++groupSeq), label: unquote(name), ...props, nodes: [] };
      const parent = stack[stack.length - 1];
      if (parent) g.parent = parent.id;
      groups.push(g);
      stack.push(g);
      return;
    }

    const [headRaw = '', ...labelParts] = splitTop(line, ': ');
    const ops = splitOps(headRaw);
    if (ops.ops.length) { link(headRaw, labelParts.join(': '), ops, where); return; }

    node(line, where, { declare: true });
  });

  for (const [label, where] of groupEnds) {
    if (nodes.has(label)) errors.push(`${where}: "${label}" is both a group and a node; rename one so the link knows which it means`);
  }
  if (stack.length) errors.push(`end of file: ${stack.length} group(s) left open ("${stack.map((g) => g.label).join('", "')}")`);
  if (!draftNodes.length && !errors.length) errors.push('the file declares no nodes');
  if (errors.length) throw new FigureSpecError(errors);

  for (const g of groups) g.nodes = draftNodes.filter((n) => n.group === g.id).map((n) => n.id);
  for (const n of draftNodes) { delete n.group; delete n.groupWhere; delete n.groupBy; }
  const spec = { ...directives, template: 'topology' as const, nodes: draftNodes, links, ...(groups.length ? { groups } : {}) };
  validateSpec(spec);
  return spec;
}
