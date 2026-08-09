// Generate a full icon set for one surface: the shared monogram in a given accent
// color, into <outDir>/<slug>/icons/ (favicon svg/ico, favicon-32/192,
// apple-touch-icon at 180 full-bleed) and <outDir>/<slug>/mark/ (mark svg +
// 512/1024 + transparent light/dark).
import fs from 'node:fs';
import path from 'node:path';
import { normalizeHex } from './lib/color.mjs';
import { normalizeGlyph } from './lib/identity.mjs';
import { renderMarkSet } from './render-mark-set.mjs';

export async function makeMark({ slug, hex, glyph = 'JS', outDir }) {
  const fill = normalizeHex(hex);
  glyph = normalizeGlyph(glyph);
  const iconsDir = path.join(outDir, slug, 'icons');
  const markDir = path.join(outDir, slug, 'mark');
  fs.mkdirSync(iconsDir, { recursive: true });
  fs.mkdirSync(markDir, { recursive: true });

  const rendered = await renderMarkSet({ hex: fill, glyph });
  const icon = (name, buf) => fs.writeFileSync(path.join(iconsDir, name), buf);
  const mk = (name, buf) => fs.writeFileSync(path.join(markDir, name), buf);

  icon('favicon.svg', rendered.faviconSvg);
  icon('favicon-32.png', rendered.favicon32);
  icon('favicon-192.png', rendered.favicon192);
  icon('apple-touch-icon.png', rendered.appleTouchIcon);
  icon('favicon.ico', rendered.faviconIco);

  mk('mark.svg', rendered.markSvg);
  mk('mark-512.png', rendered.mark512);
  mk('mark-1024.png', rendered.mark1024);
  mk('mark-transparent-light.png', rendered.markTransparent);
  mk('mark-transparent-dark.png', rendered.markTransparentInverse);

  console.log(`  mark      ${slug.padEnd(12)} ${glyph} on ${fill}`);
}
