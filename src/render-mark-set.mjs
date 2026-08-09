// Render the canonical browser + brand mark set once, without prescribing a
// filesystem layout. Higher-level generators map these named buffers to the
// paths their consumer owns.
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { normalizeHex } from './lib/color.mjs';
import { normalizeGlyph } from './lib/identity.mjs';
import { pngsToIco } from './lib/ico.mjs';
import { markSvg } from './lib/mark.mjs';

export async function renderMarkSet({ hex, onColor = '#ffffff', glyph = 'JS' }) {
  const fill = normalizeHex(hex);
  const foreground = normalizeHex(onColor);
  const normalizedGlyph = normalizeGlyph(glyph);
  const rounded = markSvg({ size: 512, rounded: true, bg: fill, fg: foreground, glyph: normalizedGlyph });
  const square = markSvg({ size: 512, rounded: false, bg: fill, fg: foreground, glyph: normalizedGlyph });
  const transparent = markSvg({ size: 1024, rounded: true, bg: null, fg: fill, glyph: normalizedGlyph });
  const transparentInverse = markSvg({ size: 1024, rounded: true, bg: null, fg: foreground, glyph: normalizedGlyph });
  const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

  const favicon16 = await png(rounded, 16);
  const favicon32 = await png(rounded, 32);
  return {
    faviconSvg: markSvg({ size: 64, rounded: true, bg: fill, fg: foreground, glyph: normalizedGlyph }),
    favicon32,
    favicon192: await png(rounded, 192),
    appleTouchIcon: await png(square, 180),
    faviconIco: pngsToIco([
      { size: 16, buffer: favicon16 },
      { size: 32, buffer: favicon32 },
    ]),
    markSvg: rounded,
    mark512: await png(rounded, 512),
    mark1024: await png(rounded, 1024),
    markTransparent: await png(transparent, 1024),
    markTransparentInverse: await png(transparentInverse, 1024),
  };
}
