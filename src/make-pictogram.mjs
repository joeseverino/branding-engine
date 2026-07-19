// Render pictogram tiles: a brand-colored tile with a centered graphic, as
// PNG (plus SVG when the graphic is a built-in glyph). The pictogram
// counterpart of make-mark (letterform tiles) — for app icons, vault icons,
// avatars, and anywhere a picture reads better than a monogram. The graphic
// is either a named stroke glyph from the shared set or an arbitrary logo
// file (`logo`), composited as-is in its own colors. No browser needed.
//
// Many icon consumers (avatar chips, vault pickers) crop tiles to a circle;
// `circlePreview` writes an additional `<name>-circle.png` with the circular
// mask applied so the fit can be verified before uploading anywhere.
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { pictogramSvg } from './lib/pictogram.mjs';
import { normalizeHex } from './lib/color.mjs';

function circleMask(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`,
  );
}

async function writeCirclePreview(iconPng, outDir, base, size) {
  const previewPath = path.join(outDir, `${base}-circle.png`);
  await sharp(iconPng)
    .composite([{ input: circleMask(size), blend: 'dest-in' }])
    .png()
    .toFile(previewPath);
  return previewPath;
}

// Render one tile. Provide either `glyph` (a name from the shared pictogram
// set) or `logo` (a path to an SVG/PNG composited in its own colors). `name`
// defaults to the glyph or the logo's basename and only affects filenames:
// <outDir>/<name>.svg (glyph tiles only) and <name>-<size>.png. `fit` is the
// fraction of the tile the logo may occupy (longest side, default 0.62).
export async function makePictogram({
  glyph,
  logo,
  hex,
  name,
  outDir = '.',
  size = 512,
  fit = 0.62,
  circlePreview = false,
}) {
  if (!glyph && !logo) throw new Error('Provide a glyph name or a logo file.');
  if (glyph && logo) throw new Error('Provide either a glyph or a logo, not both.');
  const fill = normalizeHex(hex);
  const base = name || glyph || path.parse(logo).name;
  fs.mkdirSync(outDir, { recursive: true });
  const pngPath = path.join(outDir, `${base}-${size}.png`);
  const out = { png: pngPath };

  if (glyph) {
    const svg = pictogramSvg({ glyph, hex: fill, size });
    out.svg = path.join(outDir, `${base}.svg`);
    fs.writeFileSync(out.svg, svg + '\n');
    await sharp(Buffer.from(svg)).png().toFile(pngPath);
  } else {
    if (!fs.existsSync(logo)) throw new Error(`Logo file not found: ${logo}`);
    const radius = size * 0.22;
    const tile = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="${fill}"/></svg>`,
    );
    const box = Math.round(size * fit);
    const art = await sharp(logo, { density: 300 })
      .resize({ width: box, height: box, fit: 'inside' })
      .png()
      .toBuffer();
    const meta = await sharp(art).metadata();
    await sharp(tile)
      .composite([{
        input: art,
        left: Math.round((size - meta.width) / 2),
        top: Math.round((size - meta.height) / 2),
      }])
      .png()
      .toFile(pngPath);
  }

  if (circlePreview) {
    out.circle = await writeCirclePreview(pngPath, outDir, base, size);
  }
  return out;
}

// Render a batch from a spec: an array of
// { glyph | logo, hex, name?, size?, fit?, circlePreview? }.
export async function makePictograms({ spec, outDir = '.' }) {
  if (!Array.isArray(spec) || spec.length === 0) {
    throw new Error(
      'Pictogram spec must be a non-empty array of { glyph | logo, hex, name?, size?, fit?, circlePreview? }.',
    );
  }
  const written = [];
  for (const entry of spec) {
    written.push(await makePictogram({ ...entry, outDir }));
  }
  return written;
}
