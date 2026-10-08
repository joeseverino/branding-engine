// The figure spec as authored: what a JSON file or the `.fig` parser hands to
// the renderer. Every field is optional because normalize and the template
// functions report what is missing; schema.ts holds the matching validators.
import type { PictogramName } from '../pictogram.ts';
import type { SizeSpec, Tokens } from './palette.ts';

export const COMPASS = ['center', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
export type Compass = (typeof COMPASS)[number];

export const LABEL_POS = ['auto', 'below', 'above', 'left', 'right', 'ne', 'nw', 'se', 'sw'] as const;
export type LabelPos = (typeof LABEL_POS)[number];

export type Point2 = readonly [number, number];

export interface NodeSpec {
  id?: string;
  label?: string;
  note?: string;
  addr?: string;
  icon?: PictogramName;
  shape?: 'circle' | 'box';
  role?: 'anchor' | 'attacker' | 'muted';
  /** A color name (accent, deep, ink, muted) or a hex value. */
  color?: string;
  pos?: Compass;
  at?: Point2;
  scale?: number;
  labelPos?: LabelPos;
  labelAt?: Point2;
  labelW?: number;
  group?: string;
}

export type LinkDir = 'to' | 'from' | 'both' | 'none';
export type LinkStyle = 'solid' | 'dashed' | 'dotted';

export interface LinkSpec {
  from?: string;
  to?: string;
  label?: string;
  fromLabel?: string;
  toLabel?: string;
  dir?: LinkDir;
  style?: LinkStyle;
  color?: string;
  width?: number;
  curve?: number;
}

export interface GroupSpec {
  id?: string;
  label?: string;
  nodes?: string[];
  style?: 'solid' | 'dashed';
  color?: string;
  parent?: string;
}

interface SpecBase {
  size?: SizeSpec;
  theme?: 'light' | 'dark';
  colors?: Tokens;
  $schema?: string;
}

export interface TitleSpec extends SpecBase {
  template: 'title';
  eyebrow?: string;
  headline?: string;
  subline?: string;
  footer?: string;
  align?: 'center' | 'left';
  headlineSize?: number;
}

export interface FlowRow {
  steps?: string[];
  label?: string;
  anchor?: string;
}

export interface FlowSpec extends SpecBase {
  template: 'flow';
  rows?: FlowRow[];
}

export interface DiamondSpec extends SpecBase {
  template: 'diamond';
  center?: string;
  nodes?: Partial<Record<'top' | 'left' | 'right' | 'bottom', string>>;
}

export interface NodesSpec extends SpecBase {
  template: 'nodes';
  layout?: 'row' | 'ring' | 'grid';
  nodes?: string[];
  center?: string;
  anchor?: string;
  label?: string;
}

export type GraphLayoutName = 'auto' | 'star' | 'ring' | 'row' | 'grid' | 'free';
export type GraphDirection = 'right' | 'down' | 'left' | 'up';
export type GraphRouting = 'straight' | 'orthogonal' | 'curved';

interface GraphBase extends SpecBase {
  layout?: GraphLayoutName;
  direction?: GraphDirection;
  routing?: GraphRouting;
  title?: string;
  subtitle?: string;
  /** Raw entries; normalize validates each one against NodeSpec. */
  nodes?: readonly unknown[];
  /** Raw entries; normalize validates each one against LinkSpec. */
  links?: readonly unknown[];
  /** Raw entries; normalize validates each one against GroupSpec. */
  groups?: readonly unknown[];
  center?: NodeSpec;
  nodeScale?: number;
  textScale?: number;
  spread?: number;
  fit?: boolean;
}

export interface TopologySpec extends GraphBase {
  template: 'topology';
}

/** `diagram` is an alias of `topology`. */
export interface DiagramSpec extends GraphBase {
  template: 'diagram';
}

export type GraphSpec = TopologySpec | DiagramSpec;

export type FigureSpec = TitleSpec | FlowSpec | DiamondSpec | NodesSpec | GraphSpec;
export type TemplateName = FigureSpec['template'];
