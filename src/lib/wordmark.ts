// Build a horizontal lockup as a single self-contained SVG: the mark tile, then
// the name set in real Inter outlines, on one baseline. No raster, no headless
// browser. The tile keeps its surface accent (white glyph); the text ink is
// `currentColor` by default, so one SVG serves both light and dark backgrounds.
//
// Outlines come from the wordmark glyph cache (extracted at the wordmark weight,
// which is lighter than the mark's), so this stays pure node like mark.ts.
import { markSvg } from './mark.ts';
import { normalizeHex } from './color.ts';
import type { Glyph, GlyphSet } from './extract-glyphs.ts';
import { loadGlyphs, wordmarkGlyphFile } from './glyphs.ts';

// Proportions are expressed against the tile so the lockup scales as one unit.
// The 128/36/96 ratios match the original lockup; letter-spacing matches the
// site's .brand (caps) and the title-case lockup respectively.
const TILE = 256;
const PAD = (TILE * 24) / 128; // breathing room around the lockup
const GAP = (TILE * 36) / 128; // tile-to-text gap
const FONT_PX = (TILE * 96) / 128; // text size relative to the tile
const LETTER_SPACING = { title: -0.03125, caps: -0.02 }; // em

// Resolved per call so a BRAND_WORDMARK_GLYPHS set in-process (by the build) is
// honored.
const glyphData = (): GlyphSet => loadGlyphs(wordmarkGlyphFile());

// Lay the text out in font units and measure its ink box. Blank glyphs (space)
// carry advance but no path, so they push the pen without affecting the bounds.
function layoutText(text: string, letterSpacingEm: number) {
  const { unitsPerEm, glyphs } = glyphData();
  const ls = letterSpacingEm * unitsPerEm;
  const chars = [...text];
  let penX = 0;
  const placed: Array<{ x: number; g: Glyph }> = [];
  chars.forEach((ch, i) => {
    const g = glyphs[ch];
    if (!g) {
      throw new Error(
        `No wordmark outline for "${ch}". Available: ${Object.keys(glyphs).join('')}. ` +
          `Re-run with this text so build extracts it, or extend ${wordmarkGlyphFile()}.`,
      );
    }
    placed.push({ x: penX, g });
    penX += g.advance + (i < chars.length - 1 ? ls : 0);
  });
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const { x, g } of placed) {
    if (!g.path) continue;
    xMin = Math.min(xMin, x + g.bounds.xMin);
    xMax = Math.max(xMax, x + g.bounds.xMax);
    yMin = Math.min(yMin, g.bounds.yMin);
    yMax = Math.max(yMax, g.bounds.yMax);
  }
  if (!Number.isFinite(xMin)) {
    throw new Error(`The wordmark text "${text}" has no visible characters.`);
  }
  return { placed, xMin, xMax, cy: (yMin + yMax) / 2 };
}

export interface WordmarkOptions {
  tileHex: string;
  /** The name, in the case it is stored. */
  text: string;
  glyph?: string;
  /** Text fill; pass an explicit color for PNGs. */
  ink?: string;
  /** Uppercase the text (matches the site). */
  caps?: boolean;
}

export function wordmarkSvg({ tileHex, text, glyph = 'JS', ink = 'currentColor', caps = false }: WordmarkOptions): string {
  const fill = normalizeHex(tileHex);
  const rendered = caps ? text.toUpperCase() : text;
  const { unitsPerEm } = glyphData();
  const s = FONT_PX / unitsPerEm;
  const { placed, xMin, xMax, cy } = layoutText(rendered, caps ? LETTER_SPACING.caps : LETTER_SPACING.title);

  const H = TILE + 2 * PAD;
  const x0 = PAD + TILE + GAP; // text left edge
  const W = +(x0 + s * (xMax - xMin) + PAD).toFixed(2);

  // The tile reuses markSvg; strip its outer <svg> and place it as a group so we
  // avoid nesting a full svg inside another.
  const tileInner = markSvg({ size: TILE, rounded: true, bg: fill, glyph })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
  const tile = `<g transform="translate(${PAD} ${PAD})">${tileInner}</g>`;

  // Glyph outlines are y-up (font space); flip them, left-align at x0, centre the
  // ink box on the tile's vertical centre.
  const paths = placed
    .filter((p) => p.g.path)
    .map(({ x, g }) => `<path transform="translate(${x.toFixed(2)} 0)" d="${g.path}"/>`)
    .join('');
  const textTransform =
    `translate(${x0} ${H / 2}) scale(${s.toFixed(5)} ${(-s).toFixed(5)}) ` +
    `translate(${(-xMin).toFixed(2)} ${(-cy).toFixed(2)})`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
    + tile
    + `<g fill="${ink}" transform="${textTransform}">${paths}</g>`
    + `</svg>`;
}
