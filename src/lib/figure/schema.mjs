// Spec validation. Every key a spec may carry is declared here, so a typo or a
// wrong value fails with the path and a suggestion instead of being ignored.
import { PICTOGRAMS } from '../pictogram.mjs';
import { SIZES } from './palette.mjs';

const COMPASS = ['center', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
export const LABEL_POS = ['auto', 'below', 'above', 'left', 'right', 'ne', 'nw', 'se', 'sw'];
export const COLOR_NAMES = ['accent', 'deep', 'ink', 'muted'];

const t = {
  string: (v) => typeof v === 'string' || 'a string',
  number: (v) => (typeof v === 'number' && Number.isFinite(v)) || 'a number',
  positive: (v) => (typeof v === 'number' && v > 0) || 'a positive number',
  boolean: (v) => typeof v === 'boolean' || 'true or false',
  point: (v) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) || 'a [x, y] pair',
  strings: (v) => (Array.isArray(v) && v.every((s) => typeof s === 'string')) || 'a list of strings',
  any: () => true,
  oneOf: (...vals) => (v) => vals.includes(v) || `one of ${vals.map((x) => JSON.stringify(x)).join(', ')}`,
  color: (v) => (typeof v === 'string' && (COLOR_NAMES.includes(v) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)))
    || `a hex color or one of ${COLOR_NAMES.join(', ')}`,
  icon: (v) => (typeof v === 'string' && v in PICTOGRAMS) || `an icon: ${Object.keys(PICTOGRAMS).join(', ')}`,
  size: (v) => (typeof v === 'string' && v in SIZES) || (Array.isArray(v) && v.length === 2 && v.every((n) => n > 0))
    || `a preset (${Object.keys(SIZES).join(', ')}) or [width, height]`,
};

const COMMON = { template: t.string, size: t.size, theme: t.oneOf('light', 'dark'), colors: t.any, $schema: t.string };

export const NODE = {
  id: t.string, label: t.string, note: t.string, addr: t.string, icon: t.icon,
  shape: t.oneOf('circle', 'box'), role: t.oneOf('anchor', 'attacker', 'muted'), color: t.color,
  pos: t.oneOf(...COMPASS), at: t.point, scale: t.positive,
  labelPos: t.oneOf(...LABEL_POS), labelAt: t.point, labelW: t.positive, group: t.string,
};
export const LINK = {
  from: t.string, to: t.string, label: t.string, fromLabel: t.string, toLabel: t.string,
  dir: t.oneOf('to', 'from', 'both', 'none'), style: t.oneOf('solid', 'dashed', 'dotted'),
  color: t.color, width: t.positive, curve: t.number,
};
export const GROUP = { id: t.string, label: t.string, nodes: t.strings, style: t.oneOf('solid', 'dashed'), color: t.color, parent: t.string };

const TOPOLOGY = {
  ...COMMON,
  layout: t.oneOf('auto', 'star', 'ring', 'row', 'grid', 'free'),
  direction: t.oneOf('right', 'down', 'left', 'up'),
  routing: t.oneOf('straight', 'orthogonal', 'curved'),
  title: t.string, subtitle: t.string,
  nodes: (v) => Array.isArray(v) || 'a list of nodes',
  links: (v) => Array.isArray(v) || 'a list of links',
  groups: (v) => Array.isArray(v) || 'a list of groups',
  center: (v) => (v && typeof v === 'object') || 'a node object',
  nodeScale: t.positive, textScale: t.positive, spread: t.positive, fit: t.boolean,
};

export const TOP_LEVEL = {
  title: { ...COMMON, eyebrow: t.string, headline: t.string, subline: t.string, footer: t.string, align: t.oneOf('center', 'left'), headlineSize: t.positive },
  flow: { ...COMMON, rows: (v) => Array.isArray(v) || 'a list of rows' },
  diamond: { ...COMMON, center: t.string, nodes: (v) => (v && typeof v === 'object') || 'an object of top/left/right/bottom' },
  nodes: { ...COMMON, layout: t.oneOf('row', 'ring', 'grid'), nodes: t.strings, center: t.string, anchor: t.string, label: t.string },
  topology: TOPOLOGY,
  diagram: TOPOLOGY,
};

function distance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

export function suggest(word, options) {
  const w = String(word).toLowerCase();
  let best, bestD = Infinity;
  for (const o of options) {
    const d = o.toLowerCase() === w ? 0 : distance(w, o.toLowerCase());
    if (d < bestD) { best = o; bestD = d; }
  }
  return bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

export function checkObject(obj, shape, path, errors) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    errors.push(`${path}: expected an object`);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    const check = shape[k];
    if (!check) {
      const hint = suggest(k, Object.keys(shape));
      errors.push(`${path}.${k}: unknown key${hint ? ` (did you mean "${hint}"?)` : ''}`);
      continue;
    }
    const ok = check(v);
    if (ok !== true) {
      const hint = typeof v === 'string' && /one of|icon/.test(ok)
        ? suggest(v, (ok.match(/"([^"]+)"/g) || []).map((s) => s.slice(1, -1)).concat(k === 'icon' ? Object.keys(PICTOGRAMS) : []))
        : undefined;
      errors.push(`${path}.${k}: expected ${ok}, got ${JSON.stringify(v)}${hint ? ` (did you mean "${hint}"?)` : ''}`);
    }
  }
}

export class FigureSpecError extends Error {
  constructor(errors) {
    super(`Invalid figure spec:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'FigureSpecError';
    this.errors = errors;
  }
}

// Top-level validation for any template. Graph templates validate their nodes,
// links and groups again in graph.mjs, where ids can be cross-checked.
export function validateSpec(spec) {
  const errors = [];
  if (!spec || typeof spec !== 'object') throw new FigureSpecError(['spec: expected an object']);
  const shape = TOP_LEVEL[spec.template];
  if (!shape) {
    const hint = suggest(spec.template || '', Object.keys(TOP_LEVEL));
    throw new Error(`Unknown figure template: "${spec.template}". Known: ${Object.keys(TOP_LEVEL).join(', ')}.${hint ? ` Did you mean "${hint}"?` : ''}`);
  }
  checkObject(spec, shape, 'spec', errors);
  if (errors.length) throw new FigureSpecError(errors);
}
