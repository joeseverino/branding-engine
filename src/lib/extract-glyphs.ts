// Extract font glyphs into the compact JSON cache consumed by the SVG renderers.
// OpenType.js plus a WebAssembly WOFF2 decoder keeps this path entirely in
// Node. Variable fonts are transformed at the requested weight.
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import opentype, { type Font, type Glyph as OutlineGlyph } from 'opentype.js';
import wawoff2 from 'wawoff2';
import { errorMessage } from './guards.ts';

export interface GlyphBounds {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface Glyph {
  path: string;
  advance: number;
  bounds: GlyphBounds;
}

/** The JSON a glyph cache holds: outlines for a set of characters at one weight. */
export interface GlyphSet {
  font: string;
  unitsPerEm: number;
  weight: number;
  glyphs: Record<string, Glyph>;
}

async function loadFont(fontPath: string): Promise<Font> {
  let bytes = readFileSync(fontPath);
  if (path.extname(fontPath).toLowerCase() === '.woff2') {
    bytes = Buffer.from(await wawoff2.decompress(bytes));
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return opentype.parse(buffer);
}

function glyphAtWeight(font: Font, glyph: OutlineGlyph, weight: number): OutlineGlyph {
  const { fvar } = font.tables;
  if (!fvar || !font.variation) return glyph;
  const coords = font.variation.getDefaultCoordinates();
  if (fvar.axes.some((axis) => axis.tag === 'wght')) {
    coords.wght = weight;
  }
  return font.variation.process.getTransform(glyph, coords);
}

export interface ExtractOptions {
  chars: string;
  weight: number;
  fontPath: string;
  outPath: string;
}

export async function extractGlyphs({ chars, weight, fontPath, outPath }: ExtractOptions): Promise<GlyphSet> {
  const font = await loadFont(fontPath);
  const glyphs: Record<string, Glyph> = {};

  try {
    for (const ch of new Set(chars)) {
      const index = font.charToGlyphIndex(ch);
      if (index === 0 && ch !== '\0') {
        throw new Error(`Font ${path.basename(fontPath)} has no glyph for "${ch}".`);
      }

      const glyph = glyphAtWeight(font, font.glyphs.get(index), weight);
      const box = glyph.getBoundingBox();
      glyphs[ch] = {
        path: glyph.path.toPathData({ decimalPlaces: 2, flipY: false }),
        advance: glyph.advanceWidth ?? 0,
        bounds: {
          xMin: Number.isFinite(box.x1) ? box.x1 : 0,
          yMin: Number.isFinite(box.y1) ? box.y1 : 0,
          xMax: Number.isFinite(box.x2) ? box.x2 : 0,
          yMax: Number.isFinite(box.y2) ? box.y2 : 0,
        },
      };
    }
  } catch (error) {
    throw new Error(
      `Could not extract glyphs from ${path.basename(fontPath)} in Node: ${errorMessage(error)}`,
    );
  }

  const data: GlyphSet = {
    font: path.basename(fontPath),
    unitsPerEm: Number(font.unitsPerEm),
    weight,
    glyphs,
  };
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  return data;
}
