// Spec validation. Every key a spec may carry is declared here, so a typo or a
// wrong value fails with the path and a suggestion instead of being ignored.
import { isFiniteNumber, isRecord } from '../guards.ts';
import { isPictogramName, PICTOGRAMS } from '../pictogram.ts';
import { COLOR_NAMES, isColorName, isDimensions, isSizeName, SIZES } from './palette.ts';
import {
  COMPASS, LABEL_POS,
  type FigureSpec, type GroupSpec, type LinkSpec, type NodeSpec, type TemplateName,
} from './spec.ts';

/** Returns true when the value is acceptable, else a description of what is expected. */
export type Check = (value: unknown) => true | string;

/** One validator per key of `T`: the compiler fails when the two drift apart. */
export type Shape<T> = { readonly [K in keyof T]-?: Check };

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isStringMap = (v: unknown): boolean => isRecord(v) && Object.values(v).every((s) => typeof s === 'string');

const t = {
  string: (v: unknown) => typeof v === 'string' || 'a string',
  number: (v: unknown) => isFiniteNumber(v) || 'a number',
  positive: (v: unknown) => (typeof v === 'number' && v > 0) || 'a positive number',
  boolean: (v: unknown) => typeof v === 'boolean' || 'true or false',
  point: (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number')) || 'a [x, y] pair',
  strings: (v: unknown) => isStringList(v) || 'a list of strings',
  oneOf: (...vals: readonly unknown[]): Check => (v) => vals.includes(v) || `one of ${vals.map((x) => JSON.stringify(x)).join(', ')}`,
  color: (v: unknown) => (typeof v === 'string' && (isColorName(v) || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)))
    || `a hex color or one of ${COLOR_NAMES.join(', ')}`,
  icon: (v: unknown) => isPictogramName(v) || `an icon: ${Object.keys(PICTOGRAMS).join(', ')}`,
  size: (v: unknown) => isSizeName(v) || isDimensions(v)
    || `a preset (${Object.keys(SIZES).join(', ')}) or [width, height]`,
  tokens: (v: unknown) => isStringMap(v) || 'an object of color strings',
  list: (what: string): Check => (v) => Array.isArray(v) || `a list of ${what}`,
  object: (what: string): Check => (v) => isRecord(v) || what,
} satisfies Record<string, Check | ((...args: never[]) => Check)>;

const COMMON = { template: t.string, size: t.size, theme: t.oneOf('light', 'dark'), colors: t.tokens, $schema: t.string };

export const NODE: Shape<NodeSpec> = {
  id: t.string, label: t.string, note: t.string, addr: t.string, icon: t.icon,
  shape: t.oneOf('circle', 'box'), role: t.oneOf('anchor', 'attacker', 'muted'), color: t.color,
  pos: t.oneOf(...COMPASS), at: t.point, scale: t.positive,
  labelPos: t.oneOf(...LABEL_POS), labelAt: t.point, labelW: t.positive, group: t.string,
};
export const LINK: Shape<LinkSpec> = {
  from: t.string, to: t.string, label: t.string, fromLabel: t.string, toLabel: t.string,
  dir: t.oneOf('to', 'from', 'both', 'none'), style: t.oneOf('solid', 'dashed', 'dotted'),
  color: t.color, width: t.positive, curve: t.number,
};
export const GROUP: Shape<GroupSpec> = { id: t.string, label: t.string, nodes: t.strings, style: t.oneOf('solid', 'dashed'), color: t.color, parent: t.string };

const isFlowRow = (row: unknown): boolean => isRecord(row)
  && (row.steps === undefined || isStringList(row.steps))
  && (row.label === undefined || typeof row.label === 'string')
  && (row.anchor === undefined || typeof row.anchor === 'string');

type Of<T extends TemplateName> = Extract<FigureSpec, { template: T }>;

const TOPOLOGY = {
  ...COMMON,
  layout: t.oneOf('auto', 'star', 'ring', 'row', 'grid', 'free'),
  direction: t.oneOf('right', 'down', 'left', 'up'),
  routing: t.oneOf('straight', 'orthogonal', 'curved'),
  title: t.string, subtitle: t.string,
  nodes: t.list('nodes'),
  links: t.list('links'),
  groups: t.list('groups'),
  center: t.object('a node object'),
  nodeScale: t.positive, textScale: t.positive, spread: t.positive, fit: t.boolean,
};

const TOP_LEVEL: { readonly [T in TemplateName]: Shape<Of<T>> } = {
  title: { ...COMMON, eyebrow: t.string, headline: t.string, subline: t.string, footer: t.string, align: t.oneOf('center', 'left'), headlineSize: t.positive },
  flow: { ...COMMON, rows: (v) => (Array.isArray(v) && v.every(isFlowRow)) || 'a list of rows, each { steps, label?, anchor? }' },
  diamond: { ...COMMON, center: t.string, nodes: (v) => isStringMap(v) || 'an object of top/left/right/bottom labels' },
  nodes: { ...COMMON, layout: t.oneOf('row', 'ring', 'grid'), nodes: t.strings, center: t.string, anchor: t.string, label: t.string },
  topology: TOPOLOGY,
  diagram: TOPOLOGY,
};

function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array<number>(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

export function suggest(word: unknown, options: readonly string[]): string | undefined {
  const w = String(word).toLowerCase();
  let best: string | undefined, bestD = Infinity;
  for (const o of options) {
    const d = o.toLowerCase() === w ? 0 : distance(w, o.toLowerCase());
    if (d < bestD) { best = o; bestD = d; }
  }
  return bestD <= Math.max(2, Math.floor(w.length / 3)) ? best : undefined;
}

/**
 * Check `obj` against `shape`, appending a message per problem to `errors`.
 * `T` is the interface the shape describes; the guard holds only when no
 * problem was found.
 */
export function checkObject<T>(obj: unknown, shape: Readonly<Record<string, Check>>, path: string, errors: string[]): obj is T {
  if (!isRecord(obj)) {
    errors.push(`${path}: expected an object`);
    return false;
  }
  const before = errors.length;
  for (const [k, v] of Object.entries(obj)) {
    const check = Object.hasOwn(shape, k) ? shape[k] : undefined;
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
  return errors.length === before;
}

export class FigureSpecError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid figure spec:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    this.name = 'FigureSpecError';
    this.errors = errors;
  }
}

const isTemplateName = (value: unknown): value is TemplateName =>
  typeof value === 'string' && Object.hasOwn(TOP_LEVEL, value);

// Top-level validation for any template. Graph templates validate their nodes,
// links and groups again in graph/normalize.ts, where ids can be cross-checked.
export function validateSpec(spec: unknown): asserts spec is FigureSpec {
  if (!isRecord(spec)) throw new FigureSpecError(['spec: expected an object']);
  const template = spec.template;
  if (!isTemplateName(template)) {
    const hint = suggest(typeof template === 'string' ? template : '', Object.keys(TOP_LEVEL));
    throw new Error(`Unknown figure template: "${String(template)}". Known: ${Object.keys(TOP_LEVEL).join(', ')}.${hint ? ` Did you mean "${hint}"?` : ''}`);
  }
  const errors: string[] = [];
  checkObject<FigureSpec>(spec, TOP_LEVEL[template], 'spec', errors);
  if (errors.length) throw new FigureSpecError(errors);
}
