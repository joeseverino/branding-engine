// Orchestrates the engine. buildBrand() renders every kit defined by a brand
// config; buildKit() renders a single one-off. Neither hardcodes anything
// brand-specific: the config (and the output directory) are the inputs.
//
// A brand config is a brand.json (or a directory holding one) describing the
// primary identity, optional surfaces, and optional social cards. Paths inside it
// (`font`, `portrait`) are resolved relative to the config's own directory.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_FONT } from './lib/font.mjs';
import { WORDMARK_CHARS, ensureGlyphs } from './lib/glyphs.mjs';
import { darken } from './lib/color.mjs';
import { launchBrowser } from './lib/render.mjs';
import { makeMark } from './make-mark.mjs';
import { makeWordmark } from './make-wordmark.mjs';
import { makeSheet } from './make-sheet.mjs';
import { makeWeb } from './make-web.mjs';
import { makeCards } from './make-cards.mjs';

const ALL_STAGES = ['mark', 'wordmark', 'sheet', 'web', 'cards'];
const BASE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Normalize an `only` selector (array, comma string, or null=all) to a Set.
function stageSet(only) {
  if (!only) return new Set(ALL_STAGES);
  const list = Array.isArray(only) ? only : String(only).split(',');
  return new Set(list.map((s) => s.trim()).filter(Boolean));
}

// Resolve a config: an object, a brand.json path, or a directory holding one.
function loadConfig(config) {
  if (config && typeof config === 'object') {
    return { brand: config, surfaces: config.surfaces || {}, brandDir: process.cwd() };
  }
  let file = config || process.cwd();
  let dir;
  if (existsSync(file) && !file.endsWith('.json')) {
    dir = path.resolve(file);
    file = path.join(dir, 'brand.json');
  } else {
    file = path.resolve(file);
    dir = path.dirname(file);
  }
  const brand = JSON.parse(readFileSync(file, 'utf8'));
  const sFile = path.join(dir, 'surfaces.json');
  const surfaces = existsSync(sFile)
    ? JSON.parse(readFileSync(sFile, 'utf8'))
    : brand.surfaces || {};
  return { brand, surfaces, brandDir: dir };
}

/** Build every kit defined by a brand config into outDir. */
export async function buildBrand({ config, outDir, only } = {}) {
  const { brand, surfaces, brandDir } = loadConfig(config);
  outDir = outDir ? path.resolve(outDir) : path.join(process.cwd(), 'kits');
  const stages = stageSet(only);

  const font = brand.font ? path.resolve(brandDir, brand.font) : DEFAULT_FONT;
  const weight = brand.weight || 800;
  const wordmarkWeight = brand.wordmarkWeight || 700;
  const id = brand.identity;

  const kits = [
    { slug: id.slug, color: id.color, glyph: id.glyph, wordmark: id.wordmark, deep: id.deep, onColor: id.onColor },
    ...Object.entries(surfaces).map(([slug, s]) => ({
      slug, color: s.color, glyph: s.glyph || id.glyph, wordmark: s.wordmark, deep: s.deep, onColor: s.onColor,
    })),
  ];
  const markChars = [...new Set([...BASE_CHARS, ...kits.flatMap((k) => [...k.glyph])])].join('');

  process.env.BRAND_FONT = font;
  process.env.BRAND_GLYPHS = 'brand-glyphs.json';
  process.env.BRAND_WORDMARK_GLYPHS = 'wordmark-glyphs.json';

  if (stages.has('mark') || stages.has('sheet')) {
    ensureGlyphs({ file: 'brand-glyphs.json', font, weight, chars: markChars, label: 'mark glyphs' });
  }
  if (stages.has('wordmark')) {
    ensureGlyphs({ file: 'wordmark-glyphs.json', font, weight: wordmarkWeight, chars: WORDMARK_CHARS, label: 'wordmark glyphs' });
  }

  const browser = stages.has('sheet') || (stages.has('cards') && brand.cards) ? await launchBrowser() : null;
  try {
    console.log(`Building ${brand.name || 'brand'} -> ${outDir}`);
    for (const k of kits) {
      if (stages.has('mark')) await makeMark({ slug: k.slug, hex: k.color, glyph: k.glyph, outDir });
      if (stages.has('wordmark') && k.wordmark) await makeWordmark({ slug: k.slug, hex: k.color, text: k.wordmark, glyph: k.glyph, weight: wordmarkWeight, outDir });
      if (stages.has('sheet')) await makeSheet({ slug: k.slug, hex: k.color, glyph: k.glyph, wordmark: k.wordmark, deep: k.deep, browser, outDir });
      if (stages.has('web')) makeWeb({ slug: k.slug, hex: k.color, glyph: k.glyph, name: k.wordmark || brand.name, deep: k.deep, onColor: k.onColor, outDir });
    }
    if (stages.has('cards') && brand.cards) {
      const photoPath = brand.portrait ? path.resolve(brandDir, brand.portrait) : path.join(brandDir, 'portrait.jpg');
      const colors = {
        panel: id.color,
        panelDeep: id.deep || darken(id.color),
        onPanel: id.onColor || '#ffffff',
        accent: brand.cardPalette.accent,
        textSoft: brand.cardPalette.textSoft,
        textMuted: brand.cardPalette.textMuted,
      };
      await makeCards({ cards: brand.cards, colors, photoPath, outDir, browser });
    }
  } finally {
    if (browser) await browser.close();
  }
  console.log('Done.');
}

/** Build a single one-off kit (no config file needed). */
export async function buildKit({
  slug, hex, glyph = 'JS', wordmark, font, outDir, only,
  weight = 800, wordmarkWeight = 700, browser,
} = {}) {
  outDir = outDir ? path.resolve(outDir) : path.join(process.cwd(), 'kits');
  const stages = stageSet(only);

  // A custom font points the caches at font-specific files and pre-extracts the
  // mark glyphs for these initials; the default font uses the bundled caches and
  // needs no python. (makeWordmark extracts its own wordmark cache.)
  if (font) {
    const abs = path.isAbsolute(font) ? font : path.resolve(process.cwd(), font);
    const stem = path.basename(abs).replace(/\.[^.]+$/, '');
    process.env.BRAND_FONT = abs;
    process.env.BRAND_GLYPHS = `${stem}-glyphs.json`;
    process.env.BRAND_WORDMARK_GLYPHS = `${stem}-wordmark-glyphs.json`;
    if (stages.has('mark') || stages.has('sheet')) {
      ensureGlyphs({ file: process.env.BRAND_GLYPHS, font: abs, weight, chars: glyph, label: 'mark glyphs' });
    }
  } else {
    delete process.env.BRAND_FONT;
    process.env.BRAND_GLYPHS = 'brand-glyphs.json';
    process.env.BRAND_WORDMARK_GLYPHS = 'wordmark-glyphs.json';
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
  console.log(`Kit ${slug} -> ${outDir}/${slug}`);
}
