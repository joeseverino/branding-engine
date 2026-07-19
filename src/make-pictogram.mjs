// Render pictogram tiles: a colored tile with a centered graphic, as PNG
// (plus SVG for vector-native tiles). The pictogram counterpart of make-mark's
// kit stage — for app icons, vault icons, avatars, and anywhere a picture (or
// a couple of letters) reads better than a full kit. No browser needed.
//
// The graphic is exactly one of:
//   glyph  — a named stroke glyph from the shared set (lib/pictogram.mjs)
//   text   — 1-3 letters/digits set as a letterform tile (lib/mark.mjs)
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
import { pictogramSvg } from './lib/pictogram.mjs';
import { markSvg } from './lib/mark.mjs';
import { normalizeHex } from './lib/color.mjs';
import { readTokens } from './make-figure.mjs';

const DEFAULT_TOKENS = {
  accent: '#1E3A8A',
  deep: '#14245C',
  onAccent: '#ffffff',
  ink: '#0b0620',
  paper: '#ffffff',
};

// A color argument is a hex value or a token name.
export function resolveColor(value, tokens = {}) {
  if (/^#?[0-9a-fA-F]{6}$/.test(value || '')) return normalizeHex(value);
  const table = { ...DEFAULT_TOKENS, ...tokens };
  if (table[value]) return normalizeHex(table[value]);
  throw new Error(
    `Unknown color "${value}". Use a hex value or a token name: ${Object.keys(table).join(', ')}.`,
  );
}

// Recolor single-color SVG artwork: every fill/stroke that isn't "none"
// becomes `hex`. Works for monochrome logos (attribute and inline-style
// forms); multi-color artwork should be tinted upstream instead.
export function tintSvg(svgText, hex) {
  return svgText
    .replace(/(fill|stroke)="(?!none")[^"]*"/g, `$1="${hex}"`)
    .replace(/(fill|stroke)\s*:\s*(?!none)[^;"']+/g, `$1:${hex}`);
}

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

function tileSvg(size, bg) {
  const radius = (size * 0.22).toFixed(2);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/></svg>`,
  );
}

// Render one colorway to <outDir>/<base>[-<suffix>]-<size>.png (+ .svg for
// vector-native glyph/text tiles).
async function renderOne({ kind, glyph, text, logoPath, bg, fg, size, fit, outDir, base, circlePreview }) {
  const pngPath = path.join(outDir, `${base}-${size}.png`);
  const out = { png: pngPath };

  if (kind === 'glyph') {
    const svg = pictogramSvg({ glyph, hex: bg, color: fg, size });
    out.svg = path.join(outDir, `${base}.svg`);
    fs.writeFileSync(out.svg, svg + '\n');
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
  } else if (kind === 'text') {
    const svg = markSvg({ size, bg, fg, glyph: text });
    out.svg = path.join(outDir, `${base}.svg`);
    fs.writeFileSync(out.svg, svg + '\n');
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
  } else {
    let input;
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
      .toFile(pngPath);
  }

  if (circlePreview) {
    out.circle = path.join(outDir, `${base}-circle.png`);
    await sharp(out.png)
      .composite([{ input: circleMask(size), blend: 'dest-in' }])
      .png()
      .toFile(out.circle);
  }
  return out;
}

// Render one tile (or a light/dark variant pair). See module docs for fields.
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
}) {
  const chosen = [glyph && 'glyph', text && 'text', logo && 'logo'].filter(Boolean);
  if (chosen.length !== 1) {
    throw new Error('Provide exactly one of: a glyph name, --text, or --logo.');
  }
  const kind = chosen[0];
  if (kind === 'logo' && !fs.existsSync(logo)) throw new Error(`Logo file not found: ${logo}`);

  const tok = { ...(tokens || {}), ...readTokens(tokensPath) };
  const color = resolveColor(hex, tok);
  const paper = resolveColor('paper', tok);
  const onColor = resolveColor('onAccent', tok);
  const base = name || glyph || text?.toLowerCase() || path.parse(logo).name;
  const preview = circlePreview ?? (kind === 'logo');
  fs.mkdirSync(outDir, { recursive: true });

  const shared = { kind, glyph, text, logoPath: logo, size, fit, outDir, circlePreview: preview };

  if (!variants || variants.length === 0) {
    // Single tile: colored tile, white artwork — except logos, which render
    // in their own colors (or `tint`) on the given tile color.
    const fg = kind === 'logo' ? (tint ? resolveColor(tint, tok) : undefined) : onColor;
    return renderOne({ ...shared, bg: color, fg, base });
  }

  const list = Array.isArray(variants) ? variants : String(variants).split(',');
  if (kind === 'logo' && !tint && list.length > 0) {
    throw new Error('Variant pairs for --logo require --tint (monochrome artwork).');
  }
  const out = {};
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

// Render a batch from a spec: an array of makePictogram inputs.
export async function makePictograms({ spec, outDir = '.', tokensPath }) {
  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error(
      'Pictogram spec must be a non-empty array of { glyph | text | logo, hex, ... } entries.',
    );
  }
  const written = [];
  for (const entry of spec) {
    written.push(await makePictogram({ tokensPath, outDir, ...entry }));
  }
  return written;
}
