// Generate a full icon set for one surface: the shared monogram in a given accent
// color, into <outDir>/<slug>/icons/ (favicon svg/ico, favicon-32/192,
// apple-touch-icon at 180 full-bleed) and <outDir>/<slug>/mark/ (mark svg +
// 512/1024 + transparent light/dark).
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { markSvg } from './lib/mark.mjs';
import { normalizeHex } from './lib/color.mjs';
import { normalizeGlyph } from './lib/identity.mjs';
import { pngsToIco } from './lib/ico.mjs';

export async function makeMark({ slug, hex, glyph = 'JS', outDir }) {
  const fill = normalizeHex(hex);
  glyph = normalizeGlyph(glyph);
  const iconsDir = path.join(outDir, slug, 'icons');
  const markDir = path.join(outDir, slug, 'mark');
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(markDir, { recursive: true });

  const rounded = markSvg({ size: 512, rounded: true, bg: fill, glyph });
  const square = markSvg({ size: 512, rounded: false, bg: fill, glyph });
  const transLight = markSvg({ size: 1024, rounded: true, bg: null, fg: fill, glyph });
  const transDark = markSvg({ size: 1024, rounded: true, bg: null, fg: '#ffffff', glyph });

  const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const icon = (name, buf) => fs.writeFileSync(path.join(iconsDir, name), buf);
  const mk = (name, buf) => fs.writeFileSync(path.join(markDir, name), buf);

  icon('favicon.svg', markSvg({ size: 64, rounded: true, bg: fill, glyph }));
  icon('favicon-32.png', await png(rounded, 32));
  icon('favicon-192.png', await png(rounded, 192));
  icon('apple-touch-icon.png', await png(square, 180));
  icon('favicon.ico', pngsToIco([
    { size: 16, buffer: await png(rounded, 16) },
    { size: 32, buffer: await png(rounded, 32) },
  ]));

  mk('mark.svg', rounded);
  mk('mark-512.png', await png(rounded, 512));
  mk('mark-1024.png', await png(rounded, 1024));
  mk('mark-transparent-light.png', await png(transLight, 1024));
  mk('mark-transparent-dark.png', await png(transDark, 1024));

  console.log(`  mark      ${slug.padEnd(12)} ${glyph} on ${fill}`);
}
