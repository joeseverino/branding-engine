// The .fig text format: a terse way to write a topology spec.
//
//   title: Secrets flow
//   layout: auto                    # auto | star | ring | row | grid | free
//   direction: right                # auto layout only
//
//   1Password [icon: database, anchor]
//   Mac [icon: laptop, note: Touch ID]
//
//   Homelab [dashed] {              # a group; nest freely
//     homelab-server [icon: server]
//   }
//
//   Mac <> 1Password: SSH keys [dashed]
//   1Password > homelab-server, Cloud VPS: secrets
//
// Arrows: >  <  <>  -   (solid)   -->  <--  <-->  --   (dashed)
// `->`, `<-` and `<->` are accepted as aliases. Operators need spaces around
// them, so names like `homelab-server` are safe. A name used in a connection
// before it is declared becomes a plain node. Everything compiles to the same
// JSON spec the topology template takes.
import { FigureSpecError } from './schema.mjs';

const DIRECTIVES = ['title', 'subtitle', 'layout', 'direction', 'theme', 'size', 'routing', 'textScale', 'nodeScale', 'spread'];
const OPERATORS = [
  ['<-->', 'both', 'dashed'], ['-->', 'to', 'dashed'], ['<--', 'from', 'dashed'],
  ['<->', 'both'], ['<>', 'both'], ['->', 'to'], ['<-', 'from'],
  ['--', 'none', 'dashed'], ['>', 'to'], ['<', 'from'], ['-', 'none'],
];
const OP_RE = new RegExp(`\\s(${OPERATORS.map(([o]) => o.replace(/[-<>]/g, (c) => `\\${c}`)).join('|')})\\s`);

const NODE_FLAGS = {
  anchor: ['role', 'anchor'], attacker: ['role', 'attacker'], muted: ['role', 'muted'],
  box: ['shape', 'box'], circle: ['shape', 'circle'],
};
const LINK_FLAGS = {
  dashed: ['style', 'dashed'], dotted: ['style', 'dotted'], solid: ['style', 'solid'],
  accent: ['color', 'accent'], muted: ['color', 'muted'],
};
const GROUP_FLAGS = { dashed: ['style', 'dashed'], solid: ['style', 'solid'] };

const unescape = (s) => s.replace(/\\n/g, '\n').replace(/\\"/g, '"');

// Split on `sep` at depth 0, outside quotes.
function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && quote) { cur += ch + (s[i + 1] ?? ''); i++; continue; }
    if (ch === '"') quote = !quote;
    else if (!quote && (ch === '[' || ch === '(')) depth++;
    else if (!quote && (ch === ']' || ch === ')')) depth--;
    if (!quote && depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function stripComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"' && line[i - 1] !== '\\') quote = !quote;
    if (!quote && (line[i] === '#' || (line[i] === '/' && line[i + 1] === '/'))) return line.slice(0, i);
  }
  return line;
}

function parseValue(raw) {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return unescape(v.slice(1, -1));
  if (v.startsWith('[') && v.endsWith(']')) return splitTop(v.slice(1, -1), ',').map((x) => parseValue(x));
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return unescape(v);
}

// "[a: 1, b: "x, y", flag]" → { a: 1, b: 'x, y' } with flags resolved by `flags`.
function parseProps(body, flags, where, errors) {
  const out = {};
  for (const part of splitTop(body, ',')) {
    const p = part.trim();
    if (!p) continue;
    const [k, ...rest] = splitTop(p, ':');
    if (rest.length) {
      out[k.trim()] = parseValue(rest.join(':'));
    } else if (flags[p]) {
      const [key, val] = flags[p];
      out[key] = val;
    } else {
      errors.push(`${where}: unknown flag "${p}" (flags here: ${Object.keys(flags).join(', ')})`);
    }
  }
  return out;
}

// Peel a trailing [props] off a fragment: "Mac [icon: laptop]" → ["Mac", "icon: laptop"].
function peel(s) {
  const t = s.trim();
  if (!t.endsWith(']')) return [t, null];
  let depth = 0, quote = false;
  for (let i = t.length - 1; i >= 0; i--) {
    const ch = t[i];
    if (ch === '"' && t[i - 1] !== '\\') quote = !quote;
    if (quote) continue;
    if (ch === ']') depth++;
    if (ch === '[') { depth--; if (depth === 0) return [t.slice(0, i).trim(), t.slice(i + 1, -1)]; }
  }
  return [t, null];
}

export function parseFig(text) {
  const errors = [];
  const spec = { template: 'topology', nodes: [], links: [], groups: [] };
  const nodes = new Map();
  const stack = [];
  let groupSeq = 0;

  const node = (rawName, props, where) => {
    const name = unescape(rawName.trim());
    if (!name) { errors.push(`${where}: empty node name`); return null; }
    let n = nodes.get(name);
    if (!n) {
      n = { id: name };
      nodes.set(name, n);
      spec.nodes.push(n);
    }
    if (props) Object.assign(n, props);
    if (stack.length && !n.group) n.group = stack[stack.length - 1].id;
    return n;
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

    const directive = line.match(new RegExp(`^(${DIRECTIVES.join('|')})\\s*(?::\\s*|\\s+)(.+)$`));
    if (directive && !OP_RE.test(` ${line} `)) {
      const [, key, val] = directive;
      const v = parseValue(val);
      spec[key] = key === 'size' && typeof v === 'string' && /^\d+x\d+$/.test(v) ? v.split('x').map(Number) : v;
      return;
    }

    if (line.endsWith('{')) {
      const [name, body] = peel(line.slice(0, -1));
      const props = body ? parseProps(body, GROUP_FLAGS, where, errors) : {};
      const g = { id: `g${++groupSeq}`, label: unescape(name), ...props, nodes: [] };
      if (stack.length) g.parent = stack[stack.length - 1].id;
      spec.groups.push(g);
      stack.push(g);
      return;
    }

    if (OP_RE.test(` ${line} `)) {
      // Label and link props hang off the end: "A > B: label [dashed]".
      let [head, ...labelParts] = splitTop(line, ': ');
      let label = labelParts.join(': ');
      let linkProps = {};
      const [rest, body] = peel(label || head);
      if (body !== null) {
        linkProps = parseProps(body, LINK_FLAGS, where, errors);
        if (label) label = rest; else head = rest;
      }
      const parts = (` ${head} `).split(OP_RE);
      // parts: [ends, op, ends, op, ends ...]
      for (let i = 1; i < parts.length - 1; i += 2) {
        const op = OPERATORS.find(([o]) => o === parts[i]);
        const froms = splitTop(parts[i - 1], ',').map((s) => s.trim()).filter(Boolean);
        const tos = splitTop(parts[i + 1], ',').map((s) => s.trim()).filter(Boolean);
        const declare = (frag) => {
          const [nm, b] = peel(frag);
          return node(nm, b ? parseProps(b, NODE_FLAGS, where, errors) : null, where);
        };
        for (const f of froms) for (const to of tos) {
          const a = declare(f), b = declare(to);
          if (!a || !b) continue;
          const lk = { from: a.id, to: b.id, dir: op[1] };
          if (op[2]) lk.style = op[2];
          if (label && i === parts.length - 2) lk.label = unescape(parseValue(label).toString());
          spec.links.push({ ...lk, ...linkProps });
        }
        // "A > B > C": the right side of one hop is the left side of the next.
        parts[i + 1] = tos.map((s) => peel(s)[0]).join(', ');
      }
      return;
    }

    const [name, body] = peel(line);
    node(name, body ? parseProps(body, NODE_FLAGS, where, errors) : null, where);
  });

  if (stack.length) errors.push(`end of file: ${stack.length} group(s) left open ("${stack.map((g) => g.label).join('", "')}")`);
  if (errors.length) throw new FigureSpecError(errors);

  for (const g of spec.groups) g.nodes = spec.nodes.filter((n) => n.group === g.id).map((n) => n.id);
  for (const n of spec.nodes) delete n.group;
  if (!spec.groups.length) delete spec.groups;
  return spec;
}
