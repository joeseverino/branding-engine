// Extract font glyphs into the compact JSON cache consumed by the SVG renderers.
// OpenType.js plus a WebAssembly WOFF2 decoder keeps this path entirely in
// Node. Variable fonts are transformed at the requested weight.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import wawoff2 from 'wawoff2';

async function loadFont(fontPath) {
  let bytes = readFileSync(fontPath);
  if (path.extname(fontPath).toLowerCase() === '.woff2') {
    bytes = Buffer.from(await wawoff2.decompress(bytes));
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return opentype.parse(buffer);
}

function glyphAtWeight(font, glyph, weight) {
  if (!font.tables.fvar || !font.variation) return glyph;
  const coords = font.variation.getDefaultCoordinates();
  if (font.tables.fvar.axes.some((axis) => axis.tag === 'wght')) {
    coords.wght = Number(weight);
  }
  return font.variation.process.getTransform(glyph, coords);
}

export async function extractGlyphs({ chars, weight, fontPath, outPath }) {
  const font = await loadFont(fontPath);
  const glyphs = {};

  try {
    for (const ch of [...new Set([...chars])]) {
      const index = font.charToGlyphIndex(ch);
      if (index === 0 && ch !== '\0') {
        throw new Error(`Font ${path.basename(fontPath)} has no glyph for "${ch}".`);
      }

      const glyph = glyphAtWeight(font, font.glyphs.get(index), weight);
      const box = glyph.getBoundingBox();
      glyphs[ch] = {
        path: glyph.path.toPathData({ decimalPlaces: 2, flipY: false }),
        advance: glyph.advanceWidth,
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
      `Could not extract glyphs from ${path.basename(fontPath)} in Node: ${error.message}`,
    );
  }

  const data = {
    font: path.basename(fontPath),
    unitsPerEm: Number(font.unitsPerEm),
    weight: Number(weight),
    glyphs,
  };
  writeFileSync(outPath, JSON.stringify(data, null, 2));
  return data;
}
