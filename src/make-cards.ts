// Render a set of social cards into <outDir>/cards/. The card copy, palette, and
// photo are passed in by the caller (the build reads them from a brand config),
// so nothing brand-specific is hardcoded here.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { renderCard, type CardColors } from './lib/card.ts';
import { withBrowser, type Browser } from './lib/render.ts';

/** One card in a brand config. The text fields are optional and render empty. */
export interface CardSpec {
  file: string;
  width: number;
  height: number;
  photoWidth: number;
  eyebrow?: string;
  name?: string;
  tagline?: string;
  meta?: string;
  url?: string;
}

export interface CardsOptions {
  cards: readonly CardSpec[];
  colors: CardColors;
  photoPath: string;
  outDir: string;
  /** Reuse a caller-owned browser; one is launched and closed otherwise. */
  browser?: Browser | null;
}

export async function makeCards({ cards, colors, photoPath, outDir, browser }: CardsOptions): Promise<void> {
  if (!cards.length) return;
  const dir = path.join(outDir, 'cards');
  mkdirSync(dir, { recursive: true });

  const render = async (b: Browser): Promise<void> => {
    for (const c of cards) {
      await renderCard(b, {
        width: c.width, height: c.height, photoWidth: c.photoWidth,
        eyebrow: c.eyebrow ?? '', name: c.name ?? '', tagline: c.tagline ?? '', meta: c.meta ?? '', url: c.url ?? '',
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
