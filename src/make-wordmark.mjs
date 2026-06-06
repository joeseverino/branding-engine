// Render the horizontal lockup (mark tile + name) for one surface into
// <outDir>/<slug>/wordmark/, SVG-first: a vector wordmark.svg is the source, and
// the light/dark PNGs are rasterized from it. Two cases ship: title ("Joe
// Severino") and all-caps ("JOE SEVERINO").
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { wordmarkSvg } from './lib/wordmark.mjs';
import { WORDMARK_CHARS, ensureGlyphs, wordmarkGlyphFile } from './lib/glyphs.mjs';

const INK = { light: '#0b0620', dark: '#ffffff' }; // ink for light / dark backgrounds
const PNG_HEIGHT = 512; // raster export height; SVG stays the source of truth
const VARIANTS = [
  { caps: false, base: 'wordmark' },
  { caps: true, base: 'wordmark-caps' },
];

export async function makeWordmark({ slug, hex, text, glyph = 'JS', weight = 700, outDir }) {
  const dir = path.join(outDir, slug, 'wordmark');
  mkdirSync(dir, { recursive: true });

  // The build pre-extracts, but a one-off kit lands straight here, so make sure
  // the cache exists. It bundles the whole alphabet (WORDMARK_CHARS) so a one-off
  // never overwrites the shared set with just its own name's letters.
  ensureGlyphs({ file: wordmarkGlyphFile(), weight, chars: WORDMARK_CHARS, label: 'wordmark glyphs' });

  const toPng = (svg) => sharp(Buffer.from(svg)).resize({ height: PNG_HEIGHT }).png().toBuffer();
  for (const { caps, base } of VARIANTS) {
    writeFileSync(
      path.join(dir, `${base}.svg`),
      wordmarkSvg({ tileHex: hex, text, glyph, caps, ink: 'currentColor' }),
    );
    for (const [name, ink] of Object.entries(INK)) {
      writeFileSync(
        path.join(dir, `${base}-${name}.png`),
        await toPng(wordmarkSvg({ tileHex: hex, text, glyph, caps, ink })),
      );
    }
  }
  console.log(`  wordmark  ${slug.padEnd(12)} "${text}" + caps`);
}
