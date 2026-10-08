// Render pictogram tiles: a colored tile with a centered graphic, as PNG
// (plus SVG for vector-native tiles). The pictogram counterpart of make-mark's
// kit stage — for app icons, vault icons, avatars, and anywhere a picture (or
// a couple of letters) reads better than a full kit. No browser needed.
//
// The graphic is exactly one of:
//   glyph  — a named stroke glyph from the shared set (lib/pictogram.ts)
//   text   — 1-3 letters/digits set as a letterform tile (lib/mark.ts)
//   logo   — an arbitrary SVG/PNG file, composited as-is or recolored (tint)
//
// Colors may be hex values or token names (accent, deep, onAccent, ink,
// paper) resolved from a tokens.css (`tokensPath`) merged over the engine
// defaults — so brand color stays single-source even in one-off commands.
//
// `variants: ['light', 'dark']` renders the standard pair from one input:
//   light — colored artwork on a paper tile   (everyday surfaces)
//   dark  — white artwork on a colored tile   (elevated / admin surfaces)
//
// Many icon consumers (avatar chips, vault pickers) crop tiles to a circle;
// `circlePreview` writes `<name>-circle.png` with the mask applied so fit can
// be verified before uploading. It defaults ON for logo tiles.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { isFiniteNumber, isRecord } from './lib/guards.ts';
import { pictogramSvg } from './lib/pictogram.ts';
import { markSvg } from './lib/mark.ts';
import { normalizeHex } from './lib/color.ts';
import type { Tokens } from './lib/figure/palette.ts';
import { readTokens } from './make-figure.ts';

const DEFAULT_TOKENS: Required<Tokens> = {
  accent: '#1E3A8A',
  deep: '#14245C',
  onAccent: '#ffffff',
  ink: '#0b0620',
  paper: '#ffffff',
};

// A color argument is a hex value or a token name.
export function resolveColor(value: string, tokens: Tokens = {}): string {
  if (/^#?[0-9a-fA-F]{6}$/.test(value)) return normalizeHex(value);
  const table: Record<string, string> = { ...DEFAULT_TOKENS, ...tokens };
  const named = Object.hasOwn(table, value) ? table[value] : undefined;
  if (named) return normalizeHex(named);
  throw new Error(
    `Unknown color "${value}". Use a hex value or a token name: ${Object.keys(table).join(', ')}.`,
  );
}

// Recolor single-color SVG artwork: every fill/stroke that isn't "none"
// becomes `hex`. Works for monochrome logos (attribute and inline-style
// forms); multi-color artwork should be tinted upstream instead.
export function tintSvg(svgText: string, hex: string): string {
  return svgText
    .replace(/(fill|stroke)="(?!none")[^"]*"/g, `$1="${hex}"`)
    .replace(/(fill|stroke)\s*:\s*(?!none)[^;"']+/g, `$1:${hex}`);
}

function circleMask(size: number): Buffer {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

function tileSvg(size: number, bg: string): Buffer {
  const radius = (size * 0.22).toFixed(2);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/></svg>`,
  );
}

/** What a tile shows: exactly one of a stroke glyph, letters, or a logo file. */
type Graphic =
  | { kind: 'glyph'; glyph: string }
  | { kind: 'text'; text: string }
  | { kind: 'logo'; logoPath: string };

interface TileOptions {
  graphic: Graphic;
  bg: string;
  /** Artwork color; a logo renders in its own colors when absent. */
  fg: string | undefined;
  size: number;
  fit: number;
  outDir: string;
  base: string;
  circlePreview: boolean;
}

/** The files one colorway wrote. */
export interface PictogramFiles {
  png: string;
  /** Vector-native tiles (glyph, text) also write an SVG. */
  svg?: string;
  /** The circle-crop check, when requested. */
  circle?: string;
}

/** The files a light/dark variant pair wrote, keyed by the variants asked for. */
export interface PictogramVariants {
  light?: PictogramFiles;
  dark?: PictogramFiles;
}

export const isPictogramFiles = (written: PictogramFiles | PictogramVariants): written is PictogramFiles =>
  'png' in written;

// Render one colorway to <outDir>/<base>[-<suffix>]-<size>.png (+ .svg for
// vector-native glyph/text tiles).
async function renderOne({ graphic, bg, fg, size, fit, outDir, base, circlePreview }: TileOptions): Promise<PictogramFiles> {
  const png = path.join(outDir, `${base}-${size}.png`);
  const out: PictogramFiles = { png };

  if (graphic.kind === 'logo') {
    const { logoPath } = graphic;
    let input: Buffer | string;
    if (fg && path.extname(logoPath).toLowerCase() === '.svg') {
      input = Buffer.from(tintSvg(fs.readFileSync(logoPath, 'utf8'), fg));
    } else if (fg) {
      throw new Error('Tinting requires SVG artwork; PNG logos render as-is.');
    } else {
      input = logoPath;
    }
    const box = Math.round(size * fit);
    const art = await sharp(input, { density: 300 })
      .resize({ width: box, height: box, fit: 'inside' })
      .png()
      .toBuffer();
    const meta = await sharp(art).metadata();
    await sharp(tileSvg(size, bg))
      .composite([{
        input: art,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      }])
      .png()
      .toFile(png);
  } else {
    const svg = graphic.kind === 'glyph'
      ? pictogramSvg({ glyph: graphic.glyph, hex: bg, color: fg, size })
      : markSvg({ size, bg, fg, glyph: graphic.text });
    out.svg = path.join(outDir, `${base}.svg`);
    fs.writeFileSync(out.svg, svg + '\n');
    await sharp(Buffer.from(svg)).png().toFile(png);
  }

  if (circlePreview) {
    out.circle = path.join(outDir, `${base}-circle.png`);
    await sharp(png)
      .composite([{ input: circleMask(size), blend: 'dest-in' }])
      .png()
      .toFile(out.circle);
  }
  return out;
}

export interface PictogramInput {
  /** A key of PICTOGRAMS. */
  glyph?: string;
  /** 1-3 letters or digits. */
  text?: string;
  /** An SVG or PNG file. */
  logo?: string;
  /** Tile color: hex or a token name. */
  hex: string;
  /** Recolor monochrome SVG artwork (hex or token name). */
  tint?: string;
  name?: string;
  outDir?: string;
  size?: number;
  /** Logo box as a share of the tile. */
  fit?: number;
  /** `light`, `dark`, or both (an array or comma list) for the standard pair. */
  variants?: string | readonly string[];
  /** Write `<name>-circle.png`; defaults on for logo tiles. */
  circlePreview?: boolean;
  tokens?: Tokens;
  /** A tokens.css to read brand colors from. */
  tokensPath?: string;
}

// Render one tile (or a light/dark variant pair). See module docs for fields.
export function makePictogram(input: PictogramInput & { variants?: undefined }): Promise<PictogramFiles>;
export function makePictogram(input: PictogramInput & { variants: string | readonly [string, ...string[]] }): Promise<PictogramVariants>;
export function makePictogram(input: PictogramInput): Promise<PictogramFiles | PictogramVariants>;
export async function makePictogram({
  glyph,
  text,
  logo,
  hex,
  tint,
  name,
  outDir = '.',
  size = 512,
  fit = 0.62,
  variants,
  circlePreview,
  tokens,
  tokensPath,
}: PictogramInput): Promise<PictogramFiles | PictogramVariants> {
  const graphic: Graphic | undefined = glyph
    ? { kind: 'glyph', glyph }
    : text
      ? { kind: 'text', text }
      : logo
        ? { kind: 'logo', logoPath: logo }
        : undefined;
  if (!graphic || [glyph, text, logo].filter(Boolean).length !== 1) {
    throw new Error('Provide exactly one of: a glyph name, --text, or --logo.');
  }
  if (graphic.kind === 'logo' && !fs.existsSync(graphic.logoPath)) throw new Error(`Logo file not found: ${graphic.logoPath}`);

  const tok = { ...tokens, ...readTokens(tokensPath) };
  const color = resolveColor(hex, tok);
  const paper = resolveColor('paper', tok);
  const onColor = resolveColor('onAccent', tok);
  const base = name || (graphic.kind === 'glyph' ? graphic.glyph : graphic.kind === 'text' ? graphic.text.toLowerCase() : path.parse(graphic.logoPath).name);
  const preview = circlePreview ?? (graphic.kind === 'logo');
  fs.mkdirSync(outDir, { recursive: true });

  const shared = { graphic, size, fit, outDir, circlePreview: preview };

  if (!variants || variants.length === 0) {
    // Single tile: colored tile, white artwork — except logos, which render
    // in their own colors (or `tint`) on the given tile color.
    const fg = graphic.kind === 'logo' ? (tint ? resolveColor(tint, tok) : undefined) : onColor;
    return renderOne({ ...shared, bg: color, fg, base });
  }

  const list = typeof variants === 'string' ? variants.split(',') : variants;
  if (graphic.kind === 'logo' && !tint) {
    throw new Error('Variant pairs for --logo require --tint (monochrome artwork).');
  }
  const out: PictogramVariants = {};
  for (const variant of list.map((v) => v.trim())) {
    if (variant === 'light') {
      out.light = await renderOne({ ...shared, bg: paper, fg: color, base: `${base}-light` });
    } else if (variant === 'dark') {
      out.dark = await renderOne({ ...shared, bg: color, fg: onColor, base: `${base}-dark` });
    } else {
      throw new Error(`Unknown variant "${variant}". Valid: light, dark.`);
    }
  }
  return out;
}

const TEXT_FIELDS = ['glyph', 'text', 'logo', 'tint', 'name', 'outDir', 'tokensPath'] as const;

function readEntry(raw: unknown, where: string): PictogramInput {
  if (!isRecord(raw)) throw new Error(`${where}: expected an object with { glyph | text | logo, hex, ... }.`);
  if (typeof raw.hex !== 'string') throw new Error(`${where}.hex: expected a color string.`);
  const entry: PictogramInput = { hex: raw.hex };
  for (const key of TEXT_FIELDS) {
    const value = raw[key];
    if (typeof value === 'string') entry[key] = value;
    else if (value !== undefined) throw new Error(`${where}.${key}: expected a string.`);
  }
  for (const key of ['size', 'fit'] as const) {
    const value = raw[key];
    if (isFiniteNumber(value) && value > 0) entry[key] = value;
    else if (value !== undefined) throw new Error(`${where}.${key}: expected a positive number.`);
  }
  if (raw.tokens !== undefined) {
    if (!isRecord(raw.tokens)) throw new Error(`${where}.tokens: expected an object of color strings.`);
    const tokens: Tokens = {};
    for (const key of ['accent', 'deep', 'onAccent', 'ink', 'paper'] as const) {
      const value = raw.tokens[key];
      if (typeof value === 'string') tokens[key] = value;
      else if (value !== undefined) throw new Error(`${where}.tokens.${key}: expected a color string.`);
    }
    entry.tokens = tokens;
  }
  const { variants, circlePreview } = raw;
  if (typeof variants === 'string' || (Array.isArray(variants) && variants.every((v) => typeof v === 'string'))) entry.variants = variants;
  else if (variants !== undefined) throw new Error(`${where}.variants: expected "light", "dark", or a list of them.`);
  if (typeof circlePreview === 'boolean') entry.circlePreview = circlePreview;
  else if (circlePreview !== undefined) throw new Error(`${where}.circlePreview: expected true or false.`);
  return entry;
}

// Render a batch from a spec: an array of makePictogram inputs.
export async function makePictograms({ spec, outDir = '.', tokensPath }: { spec: unknown; outDir?: string; tokensPath?: string }): Promise<Array<PictogramFiles | PictogramVariants>> {
  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error(
      'Pictogram spec must be a non-empty array of { glyph | text | logo, hex, ... } entries.',
    );
  }
  const written: Array<PictogramFiles | PictogramVariants> = [];
  for (const [i, entry] of spec.entries()) {
    written.push(await makePictogram({ tokensPath, outDir, ...readEntry(entry, `spec[${i}]`) }));
  }
  return written;
}
