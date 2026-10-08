// The graph a topology spec normalizes into, and that layout, placement, fit
// and draw then fill in. Geometry fields are in layout units.
import type { Point, Rect, Size } from '../geom.ts';
import type { SizeSpec } from '../palette.ts';
import type { Compass, GraphDirection, GraphLayoutName, GraphRouting, LabelPos, LinkStyle, Point2 } from '../spec.ts';
import type { PictogramName } from '../../pictogram.ts';

interface NodeBase {
  id: string;
  label: string;
  note: string | undefined;
  icon: PictogramName | undefined;
  role: 'anchor' | 'attacker' | 'muted' | undefined;
  color: string | undefined;
  pos: Compass | undefined;
  at: Point2 | undefined;
  scale: number;
  labelPos: Exclude<LabelPos, 'auto'> | undefined;
  labelAt: Point2 | undefined;
  labelW: number | undefined;
  group: string | undefined;
  isCenter: boolean;
  index: number;
  x: number;
  y: number;
  labelSize?: Size;
  labelRect?: Rect;
  labelAlign?: 'left' | 'center' | 'right';
  labelBadge?: boolean;
}

/** A round device node: a glyph in a ring, its label outside. */
export interface CircleNode extends NodeBase {
  shape: 'circle';
  d: number;
  icon: PictogramName;
}

/** A box node: its own label, optionally with a glyph. */
export interface BoxNode extends NodeBase {
  shape: 'box';
  w: number;
  h: number;
}

export type GraphNode = CircleNode | BoxNode;

export interface EndRect {
  text: string;
  r: Rect;
}

/** A link stored source to target; `from` arrows in the spec are swapped on the way in. */
export interface GraphLink {
  id: string;
  index: number;
  from: string;
  to: string;
  fromGroup: boolean;
  toGroup: boolean;
  label: string | undefined;
  fromLabel: string | undefined;
  toLabel: string | undefined;
  dir: 'to' | 'both' | 'none';
  style: LinkStyle;
  color: string | undefined;
  width: number | undefined;
  curve: number | undefined;
  pts: Point[];
  smooth?: boolean;
  rounded?: boolean;
  chipSize?: Size;
  fromSize?: Size;
  toSize?: Size;
  chipRect?: Rect;
  endRects?: EndRect[];
}

export interface GraphGroup {
  id: string;
  label: string;
  nodes: string[];
  style: 'solid' | 'dashed';
  color: string | undefined;
  parent: string | undefined;
  rect?: Rect;
  labelRect?: Rect;
  labelBadge?: boolean;
}

export interface GraphOptions {
  layout: GraphLayoutName;
  direction: GraphDirection;
  directionSet: boolean;
  routing: GraphRouting;
  title: string | undefined;
  subtitle: string | undefined;
  size: SizeSpec | undefined;
  fit: boolean;
  nodeScale: number;
  textScale: number;
  spread: number;
  wrapped?: boolean;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
  groups: GraphGroup[];
  byId: Map<string, GraphNode>;
  groupById: Map<string, GraphGroup>;
  notes: string[];
  opts: GraphOptions;
}

