// Render pictogram tiles: a rounded brand-colored tile with a centered stroke
// glyph, as SVG + PNG. The pictogram counterpart of make-mark (letterform
// tiles) — for app icons, vault icons, avatars, and anywhere a picture reads
// better than a monogram. No browser needed.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pictogramSvg } from './lib/pictogram.mjs';
import { normalizeHex } from './lib/color.mjs';

// Render one tile. `name` defaults to the glyph name and only affects the
// output filenames: <outDir>/<name>.svg and <name>-<size>.png.
export async function makePictogram({ glyph, hex, name, outDir = '.', size = 512 }) {
  const fill = normalizeHex(hex);
  const base = name || glyph;
  fs.mkdirSync(outDir, { recursive: true });

  const svg = pictogramSvg({ glyph, hex: fill, size });
  const svgPath = path.join(outDir, `${base}.svg`);
  const pngPath = path.join(outDir, `${base}-${size}.png`);
  fs.writeFileSync(svgPath, svg + '\n');
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  return { svg: svgPath, png: pngPath };
}

// Render a batch from a spec: an array of { glyph, hex, name?, size? }.
export async function makePictograms({ spec, outDir = '.' }) {
  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error('Pictogram spec must be a non-empty array of { glyph, hex, name?, size? }.');
  }
  const written = [];
  for (const entry of spec) {
    written.push(await makePictogram({ ...entry, outDir }));
  }
  return written;
}
