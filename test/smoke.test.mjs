import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildBrand, buildKit, generateSite, markSvg, normalizeGlyph } from '../index.mjs';
import { extractGlyphs } from '../src/lib/extract-glyphs.mjs';

async function filesUnder(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, absolute));
    else files.push(path.relative(root, absolute));
  }
  return files.sort();
}

test('normalizeGlyph accepts 1-3 alphanumeric characters and uppercases letters', () => {
  assert.equal(normalizeGlyph('a'), 'A');
  assert.equal(normalizeGlyph('be'), 'BE');
  assert.equal(normalizeGlyph('a3x'), 'A3X');
});

test('normalizeGlyph rejects unsupported marks', () => {
  for (const glyph of ['', 'ABCD', 'A B', 'A-B', 'Å', '🔥']) {
    assert.throws(
      () => normalizeGlyph(glyph),
      /Expected 1-3 letters or digits/,
      glyph,
    );
  }
});

test('markSvg renders balanced one-, two-, and three-character marks', () => {
  for (const glyph of ['I', 'BE', 'A3X']) {
    const svg = markSvg({ size: 64, bg: '#2563eb', glyph });

    assert.match(svg, /^<svg /);
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.match(svg, /fill="#2563eb"/);
    assert.equal((svg.match(/<path /g) || []).length, glyph.length);
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});

test('extractGlyphs creates a cache entirely in Node', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-glyphs-'));
  const outPath = path.join(cwd, 'glyphs.json');
  const fontPath = path.resolve('assets/fonts/inter/inter-variable-latin.woff2');

  try {
    const data = await extractGlyphs({
      chars: 'A3 ',
      weight: 800,
      fontPath,
      outPath,
    });
    const written = JSON.parse(await readFile(outPath, 'utf8'));

    assert.equal(data.font, 'inter-variable-latin.woff2');
    assert.deepEqual(Object.keys(written.glyphs), ['3', 'A', ' ']);
    assert.match(written.glyphs.A.path, /^M/);
    assert.ok(written.glyphs.A.advance > 0);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('buildKit extracts and uses a custom WOFF2 font without Python', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-custom-font-'));
  const font = path.join(cwd, 'custom-inter.woff2');
  const cache = path.join(cwd, 'cache');
  const outDir = path.join(cwd, 'output');
  const previousCache = process.env.BRAND_CACHE_DIR;

  try {
    await copyFile(path.resolve('assets/fonts/inter/inter-variable-latin.woff2'), font);
    process.env.BRAND_CACHE_DIR = cache;
    await buildKit({
      slug: 'custom',
      hex: '#635BFF',
      glyph: 'A3X',
      font,
      outDir,
      only: 'mark',
      weight: 800,
    });

    const data = JSON.parse(await readFile(path.join(cache, 'custom-inter-glyphs.json'), 'utf8'));
    const mark = await readFile(path.join(outDir, 'custom/mark/mark.svg'), 'utf8');

    assert.equal(data.weight, 800);
    assert.deepEqual(Object.keys(data.glyphs), ['3', 'A', 'X']);
    assert.equal((mark.match(/<path /g) || []).length, 3);
  } finally {
    if (previousCache === undefined) delete process.env.BRAND_CACHE_DIR;
    else process.env.BRAND_CACHE_DIR = previousCache;
    delete process.env.BRAND_FONT;
    process.env.BRAND_GLYPHS = 'brand-glyphs.json';
    process.env.BRAND_WORDMARK_GLYPHS = 'wordmark-glyphs.json';
    await rm(cwd, { recursive: true, force: true });
  }
});

test('generateSite writes the expected browser-free assets', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-'));

  try {
    await writeFile(
      path.join(cwd, 'brand.config.json'),
      JSON.stringify({ name: 'Brand Engine', accent: '#2563eb', glyph: 'a3x' }),
    );

    const result = await generateSite({ cwd });
    const manifest = JSON.parse(await readFile(path.join(cwd, 'public/site.webmanifest'), 'utf8'));
    const favicon = await readFile(path.join(cwd, 'public/favicon.svg'), 'utf8');
    const tokens = await readFile(path.join(cwd, 'public/brand-tokens.css'), 'utf8');

    assert.equal(result.written.length, 7);
    assert.equal(manifest.name, 'Brand Engine');
    assert.equal(manifest.short_name, 'A3X');
    assert.equal(manifest.theme_color, '#2563eb');
    assert.equal((favicon.match(/<path /g) || []).length, 3);
    assert.match(tokens, /--brand-accent: #2563eb;/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('committed Severino Labs example matches a fresh build', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-example-'));
  const config = path.resolve('examples/severino-labs/brand.json');
  const expected = path.resolve('examples/severino-labs/generated');

  try {
    await buildBrand({
      config,
      outDir: cwd,
    });

    const expectedFiles = await filesUnder(expected);
    const actualFiles = await filesUnder(cwd);
    assert.deepEqual(actualFiles, expectedFiles);

    for (const file of expectedFiles) {
      assert.deepEqual(
        await readFile(path.join(cwd, file)),
        await readFile(path.join(expected, file)),
        file,
      );
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
