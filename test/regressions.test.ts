import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildBrand, buildKit, markSvg, wordmarkSvg } from '../src/index.ts';

const scratch = (prefix: string): Promise<string> => mkdtemp(path.join(os.tmpdir(), `branding-engine-${prefix}-`));

async function withCacheDir<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.BRAND_CACHE_DIR;
  process.env.BRAND_CACHE_DIR = dir;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.BRAND_CACHE_DIR;
    else process.env.BRAND_CACHE_DIR = previous;
  }
}

test('a glyph cache rewritten in the same process is reloaded, not served stale', async () => {
  const cwd = await scratch('stale-cache');
  const font = path.join(cwd, 'face.woff2');
  try {
    await copyFile(path.resolve('assets/fonts/inter/inter-variable-latin.woff2'), font);
    await withCacheDir(path.join(cwd, 'cache'), async () => {
      const build = (weight: number) => buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'AB', font, outDir: path.join(cwd, 'out'), only: 'mark', weight });
      process.env.BRAND_GLYPHS = 'face-glyphs.json';
      try {
        await build(800);
        const heavy = markSvg({ glyph: 'AB', bg: '#000000' });
        await build(300);
        const light = markSvg({ glyph: 'AB', bg: '#000000' });
        assert.notEqual(heavy, light, 'the lighter weight has different outlines');
      } finally {
        delete process.env.BRAND_GLYPHS;
      }
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a build puts the font and cache variables back as it found them', async () => {
  const cwd = await scratch('env');
  const font = path.join(cwd, 'face.woff2');
  const names = ['BRAND_FONT', 'BRAND_GLYPHS', 'BRAND_WORDMARK_GLYPHS'] as const;
  const before = names.map((name) => process.env[name]);
  try {
    await copyFile(path.resolve('assets/fonts/inter/inter-variable-latin.woff2'), font);
    await withCacheDir(path.join(cwd, 'cache'), () => buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'AB', font, outDir: path.join(cwd, 'out'), only: 'mark' }));
    assert.deepEqual(names.map((name) => process.env[name]), before);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('an unknown stage in --only is an error, not a silent no-op', async () => {
  const cwd = await scratch('stage');
  try {
    await assert.rejects(
      () => buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'A', outDir: cwd, only: 'marks' }),
      /Unknown stage "marks"\. Valid stages: mark, wordmark, sheet, web, cards\./,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a wordmark with no visible characters fails instead of emitting NaN geometry', () => {
  assert.throws(() => wordmarkSvg({ tileHex: '#1f4d57', text: '   ', glyph: 'A' }), /no visible characters/);
});

async function brandConfig(dir: string, config: unknown): Promise<string> {
  const file = path.join(dir, 'brand.json');
  await writeFile(file, JSON.stringify(config));
  return file;
}

test('brand config problems are reported together, by path', async () => {
  const cwd = await scratch('config');
  try {
    const file = await brandConfig(cwd, {
      identity: { color: 7 },
      weight: 'heavy',
      cardPalette: { accent: '#fff' },
      cards: [{ file: 'a.png', width: 1200 }],
    });
    await assert.rejects(
      () => buildBrand({ config: file, outDir: path.join(cwd, 'out'), only: 'web' }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        for (const problem of [
          'identity.slug: expected a string',
          'identity.color: expected a string',
          'identity.glyph: expected a string',
          'config.weight: expected a positive number',
          'cardPalette.textSoft: expected a string',
          'cards[0].height: expected a positive number',
          'cards[0].photoWidth: expected a positive number',
        ]) assert.ok(error.message.includes(problem), `${problem}\n${error.message}`);
        return true;
      },
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a missing config names the file; a missing identity is not a TypeError', async () => {
  const cwd = await scratch('config-missing');
  try {
    await assert.rejects(() => buildBrand({ config: path.join(cwd, 'nope.json') }), /No brand config at .*nope\.json/);
    const file = await brandConfig(cwd, { name: 'No identity' });
    await assert.rejects(() => buildBrand({ config: file, outDir: cwd }), /identity: expected an object/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a surface may not reuse the primary slug, and cards need a cardPalette', async () => {
  const cwd = await scratch('config-slug');
  try {
    const identity = { slug: 'acme', color: '#1f4d57', glyph: 'A' };
    const clash = await brandConfig(cwd, { identity, surfaces: { acme: { color: '#112233' } } });
    await assert.rejects(() => buildBrand({ config: clash, outDir: cwd, only: 'web' }), /surface "acme" has the same slug/);

    const cards = await brandConfig(cwd, { identity, cards: [{ file: 'c.png', width: 100, height: 50, photoWidth: 20 }] });
    await assert.rejects(() => buildBrand({ config: cards, outDir: cwd, only: 'cards' }), /no cardPalette/);

    const out = path.join(cwd, 'out');
    await buildBrand({ config: cards, outDir: out, only: 'web' });
    assert.match(await readFile(path.join(out, 'acme/web/tokens.css'), 'utf8'), /--brand-accent: #1f4d57;/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
