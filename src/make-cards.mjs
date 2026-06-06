// Render a set of social cards into <outDir>/cards/. The card copy, palette, and
// photo are passed in by the caller (the build reads them from a brand config),
// so nothing brand-specific is hardcoded here.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderCard } from './lib/card.mjs';
import { withBrowser } from './lib/render.mjs';

export async function makeCards({ cards, colors, photoPath, outDir, browser }) {
  if (!cards || !cards.length) return;
  const dir = path.join(outDir, 'cards');
  mkdirSync(dir, { recursive: true });

  const render = async (b) => {
    for (const c of cards) {
      await renderCard(b, {
        width: c.width, height: c.height, photoWidth: c.photoWidth,
        eyebrow: c.eyebrow, name: c.name, tagline: c.tagline, meta: c.meta, url: c.url,
        colors, photoPath,
        outPath: path.join(dir, c.file),
      });
    }
  };
  // Reuse the build's browser when given one; otherwise launch our own.
  if (browser) await render(browser);
  else await withBrowser(render);
  console.log(`  cards     ${cards.map((c) => c.file).join(', ')}`);
}
