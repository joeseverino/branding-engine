import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { buildBrand, buildKit, markSvg, wordmarkSvg } from '../src/index.ts';
import { scratch, setEnv } from './support.ts';

const INTER = path.resolve('assets/fonts/inter/inter-variable-latin.woff2');

test('every bundled glyph outline is written at 2 decimals', async () => {
  const files = globSync('assets/glyphs/*.json');
  assert.ok(files.length > 0);
  for (const file of files) {
    const { glyphs } = JSON.parse(await readFile(file, 'utf8')) as { glyphs: Record<string, { path: string }> };
    const long = Object.entries(glyphs).flatMap(([ch, g]) => (g.path.match(/\d\.\d{3,}/g) ?? []).map((n) => `${ch}: ${n}`));
    assert.deepEqual(long.slice(0, 5), [], `${file} has ${long.length} numbers past 2 decimals`);
  }
});

test('a glyph cache rewritten in the same process is reloaded, not served stale', async (t) => {
  t.mock.method(console, 'log', () => {});
  await using dir = await scratch('stale-cache');
  const font = path.join(dir.path, 'face.woff2');
  await copyFile(INTER, font);
  setEnv(t, 'BRAND_CACHE_DIR', path.join(dir.path, 'cache'));
  setEnv(t, 'BRAND_GLYPHS', 'face-glyphs.json');
  const build = (weight: number) => buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'AB', font, outDir: path.join(dir.path, 'out'), only: 'mark', weight });
  await build(800);
  const heavy = markSvg({ glyph: 'AB', bg: '#000000' });
  await build(300);
  const light = markSvg({ glyph: 'AB', bg: '#000000' });
  assert.notEqual(heavy, light, 'the lighter weight has different outlines');
});

test('a build puts the font and cache variables back as it found them', async (t) => {
  t.mock.method(console, 'log', () => {});
  await using dir = await scratch('env');
  const font = path.join(dir.path, 'face.woff2');
  const names = ['BRAND_FONT', 'BRAND_GLYPHS', 'BRAND_WORDMARK_GLYPHS'] as const;
  const before = names.map((name) => process.env[name]);
  await copyFile(INTER, font);
  setEnv(t, 'BRAND_CACHE_DIR', path.join(dir.path, 'cache'));
  await buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'AB', font, outDir: path.join(dir.path, 'out'), only: 'mark' });
  assert.deepEqual(names.map((name) => process.env[name]), before);
});

test('an unknown stage in --only is an error, not a silent no-op', async () => {
  await using dir = await scratch('stage');
  await assert.rejects(
    () => buildKit({ slug: 'a', hex: '#1f4d57', glyph: 'A', outDir: dir.path, only: 'marks' }),
    /Unknown stage "marks"\. Valid stages: mark, wordmark, sheet, web, cards\./,
  );
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
  await using dir = await scratch('config');
  const file = await brandConfig(dir.path, {
    identity: { color: 7 },
    weight: 'heavy',
    cardPalette: { accent: '#fff' },
    cards: [{ file: 'a.png', width: 1200 }],
  });
  await assert.rejects(
    () => buildBrand({ config: file, outDir: path.join(dir.path, 'out'), only: 'web' }),
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
});

test('a missing config names the file; a missing identity is not a TypeError', async () => {
  await using dir = await scratch('config-missing');
  await assert.rejects(() => buildBrand({ config: path.join(dir.path, 'nope.json') }), /No brand config at .*nope\.json/);
  const file = await brandConfig(dir.path, { name: 'No identity' });
  await assert.rejects(() => buildBrand({ config: file, outDir: dir.path }), /identity: expected an object/);
});

test('a surface may not reuse the primary slug, and cards need a cardPalette', async (t) => {
  t.mock.method(console, 'log', () => {});
  await using dir = await scratch('config-slug');
  const identity = { slug: 'acme', color: '#1f4d57', glyph: 'A' };
  const clash = await brandConfig(dir.path, { identity, surfaces: { acme: { color: '#112233' } } });
  await assert.rejects(() => buildBrand({ config: clash, outDir: dir.path, only: 'web' }), /surface "acme" has the same slug/);

  const cards = await brandConfig(dir.path, { identity, cards: [{ file: 'c.png', width: 100, height: 50, photoWidth: 20 }] });
  await assert.rejects(() => buildBrand({ config: cards, outDir: dir.path, only: 'cards' }), /no cardPalette/);

  const out = path.join(dir.path, 'out');
  await buildBrand({ config: cards, outDir: out, only: 'web' });
  assert.match(await readFile(path.join(out, 'acme/web/tokens.css'), 'utf8'), /--brand-accent: #1f4d57;/);
});
