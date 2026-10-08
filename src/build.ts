// Orchestrates the engine. buildBrand() renders every kit defined by a brand
// config; buildKit() renders a single one-off. Neither hardcodes anything
// brand-specific: the config (and the output directory) are the inputs.
//
// A brand config is a brand.json (or a directory holding one) describing the
// primary identity, optional surfaces, and optional social cards. Paths inside it
// (`font`, `portrait`) are resolved relative to the config's own directory.
import path from 'node:path';
import { loadConfig, type BrandConfig } from './config.ts';
import { withBrandEnv } from './lib/brand-env.ts';
import { darken } from './lib/color.ts';
import { DEFAULT_FONT } from './lib/font.ts';
import { WORDMARK_CHARS, ensureGlyphs } from './lib/glyphs.ts';
import { normalizeGlyph } from './lib/identity.ts';
import { launchBrowser, type Browser } from './lib/render.ts';
import { makeCards } from './make-cards.ts';
import { makeMark } from './make-mark.ts';
import { makeSheet } from './make-sheet.ts';
import { makeWeb } from './make-web.ts';
import { makeWordmark } from './make-wordmark.ts';

const ALL_STAGES = ['mark', 'wordmark', 'sheet', 'web', 'cards'] as const;
export type Stage = (typeof ALL_STAGES)[number];

/** Which stages to run: a list or a comma string; omitted means all. */
export type Only = string | readonly string[];

const BASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const isStage = (value: string): value is Stage => ALL_STAGES.some((stage) => stage === value);

function stageSet(only?: Only): Set<Stage> {
  if (!only) return new Set(ALL_STAGES);
  const names = (typeof only === 'string' ? only.split(',') : only).map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((name) => !isStage(name));
  if (unknown.length) {
    throw new Error(`Unknown stage "${unknown.join('", "')}". Valid stages: ${ALL_STAGES.join(', ')}.`);
  }
  return new Set(names.filter(isStage));
}

const resolveOutDir = (outDir?: string): string => (outDir ? path.resolve(outDir) : path.join(process.cwd(), 'kits'));

export interface BuildBrandOptions {
  /** A brand.json path, a directory holding one, or the config object itself. */
  config?: string | BrandConfig;
  /** Output directory; defaults to ./kits. */
  outDir?: string;
  only?: Only;
}

/** Build every kit defined by a brand config into outDir. */
export async function buildBrand({ config, outDir: outDirOption, only }: BuildBrandOptions = {}): Promise<void> {
  const { brand, surfaces, brandDir } = loadConfig(config);
  const outDir = resolveOutDir(outDirOption);
  const stages = stageSet(only);

  const font = brand.font ? path.resolve(brandDir, brand.font) : DEFAULT_FONT;
  const weight = brand.weight ?? 800;
  const wordmarkWeight = brand.wordmarkWeight ?? 700;
  const id = brand.identity;

  const kits = [
    { slug: id.slug, color: id.color, glyph: id.glyph, wordmark: id.wordmark, deep: id.deep, onColor: id.onColor },
    ...Object.entries(surfaces).map(([slug, s]) => ({
      slug, color: s.color, glyph: s.glyph || id.glyph, wordmark: s.wordmark, deep: s.deep, onColor: s.onColor,
    })),
  ].map((kit) => ({ ...kit, glyph: normalizeGlyph(kit.glyph) }));
  const markChars = [...new Set([...BASE_CHARS, ...kits.flatMap((k) => [...k.glyph])])].join('');

  await withBrandEnv({ font, glyphs: 'brand-glyphs.json', wordmarkGlyphs: 'wordmark-glyphs.json' }, async () => {
    if (stages.has('mark') || stages.has('sheet')) {
      await ensureGlyphs({ file: 'brand-glyphs.json', font, weight, chars: markChars, label: 'mark glyphs' });
    }
    if (stages.has('wordmark')) {
      await ensureGlyphs({ file: 'wordmark-glyphs.json', font, weight: wordmarkWeight, chars: WORDMARK_CHARS, label: 'wordmark glyphs' });
    }

    const cards = stages.has('cards') ? brand.cards : undefined;
    if (cards?.length && !brand.cardPalette) {
      throw new Error('The config defines cards but no cardPalette (accent, textSoft, textMuted).');
    }
    const browser = stages.has('sheet') || cards?.length ? await launchBrowser() : null;
    try {
      console.log(`Building ${brand.name || 'brand'} -> ${outDir}`);
      for (const k of kits) {
        if (stages.has('mark')) await makeMark({ slug: k.slug, hex: k.color, glyph: k.glyph, outDir });
        if (stages.has('wordmark') && k.wordmark) await makeWordmark({ slug: k.slug, hex: k.color, text: k.wordmark, glyph: k.glyph, weight: wordmarkWeight, outDir });
        if (stages.has('sheet')) await makeSheet({ slug: k.slug, hex: k.color, glyph: k.glyph, wordmark: k.wordmark, deep: k.deep, browser, outDir });
        if (stages.has('web')) makeWeb({ slug: k.slug, hex: k.color, glyph: k.glyph, name: k.wordmark || brand.name, deep: k.deep, onColor: k.onColor, outDir });
      }
      if (cards && brand.cardPalette) {
        const photoPath = brand.portrait ? path.resolve(brandDir, brand.portrait) : path.join(brandDir, 'portrait.jpg');
        const colors = {
          panel: id.color,
          panelDeep: id.deep || darken(id.color),
          onPanel: id.onColor || '#ffffff',
          accent: brand.cardPalette.accent,
          textSoft: brand.cardPalette.textSoft,
          textMuted: brand.cardPalette.textMuted,
        };
        await makeCards({ cards, colors, photoPath, outDir, browser });
      }
    } finally {
      if (browser) await browser.close();
    }
  });
  console.log('Done.');
}

export interface BuildKitOptions {
  slug: string;
  hex: string;
  glyph?: string;
  wordmark?: string;
  /** Font file; relative paths resolve from the working directory. */
  font?: string;
  outDir?: string;
  only?: Only;
  weight?: number;
  wordmarkWeight?: number;
  /** Reuse a caller-owned browser for the sheet stage. */
  browser?: Browser;
}

/** Build a single one-off kit (no config file needed). */
export async function buildKit({
  slug, hex, glyph: glyphOption = 'JS', wordmark, font, outDir: outDirOption, only,
  weight = 800, wordmarkWeight = 700, browser,
}: BuildKitOptions): Promise<void> {
  const outDir = resolveOutDir(outDirOption);
  const stages = stageSet(only);
  const glyph = normalizeGlyph(glyphOption);

  // A custom font points the caches at font-specific files and pre-extracts the
  // mark glyphs for this identity. The default font uses bundled caches; custom
  // fonts are extracted in Node. makeWordmark manages its own cache.
  const abs = font ? path.resolve(process.cwd(), font) : undefined;
  const stem = abs ? path.basename(abs).replace(/\.[^.]+$/, '') : undefined;
  const env = {
    font: abs,
    glyphs: stem ? `${stem}-glyphs.json` : 'brand-glyphs.json',
    wordmarkGlyphs: stem ? `${stem}-wordmark-glyphs.json` : 'wordmark-glyphs.json',
  };

  await withBrandEnv(env, async () => {
    if (abs && (stages.has('mark') || stages.has('sheet'))) {
      await ensureGlyphs({ file: env.glyphs, font: abs, weight, chars: glyph, label: 'mark glyphs' });
    }

    const ownsBrowser = !browser && stages.has('sheet');
    const b = browser || (ownsBrowser ? await launchBrowser() : null);
    try {
      if (stages.has('mark')) await makeMark({ slug, hex, glyph, outDir });
      if (stages.has('wordmark') && wordmark) await makeWordmark({ slug, hex, text: wordmark, glyph, weight: wordmarkWeight, outDir });
      if (stages.has('sheet')) await makeSheet({ slug, hex, glyph, wordmark, browser: b, outDir });
      if (stages.has('web')) makeWeb({ slug, hex, glyph, name: wordmark, outDir });
    } finally {
      if (ownsBrowser && b) await b.close();
    }
  });
  console.log(`Kit ${slug} -> ${outDir}/${slug}`);
}
