// Render the canonical browser + brand mark set once, without prescribing a
// filesystem layout. Higher-level generators map these named buffers to the
// paths their consumer owns.
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { normalizeHex } from './lib/color.ts';
import { normalizeGlyph } from './lib/identity.ts';
import { pngsToIco } from './lib/ico.ts';
import { markSvg } from './lib/mark.ts';

export interface MarkSetOptions {
  hex: string;
  onColor?: string;
  glyph?: string;
}

export interface MarkSet {
  faviconSvg: string;
  favicon32: Buffer;
  favicon192: Buffer;
  appleTouchIcon: Buffer;
  faviconIco: Buffer;
  markSvg: string;
  mark512: Buffer;
  mark1024: Buffer;
  markTransparent: Buffer;
  markTransparentInverse: Buffer;
}

export async function renderMarkSet({ hex, onColor = '#ffffff', glyph = 'JS' }: MarkSetOptions): Promise<MarkSet> {
  const fill = normalizeHex(hex);
  const foreground = normalizeHex(onColor);
  const normalizedGlyph = normalizeGlyph(glyph);
  const rounded = markSvg({ size: 512, rounded: true, bg: fill, fg: foreground, glyph: normalizedGlyph });
  const square = markSvg({ size: 512, rounded: false, bg: fill, fg: foreground, glyph: normalizedGlyph });
  const transparent = markSvg({ size: 1024, rounded: true, bg: null, fg: fill, glyph: normalizedGlyph });
  const transparentInverse = markSvg({ size: 1024, rounded: true, bg: null, fg: foreground, glyph: normalizedGlyph });
  const png = (svg: string, size: number): Promise<Buffer> => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

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
