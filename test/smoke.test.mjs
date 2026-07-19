import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildKit,
  generateSite,
  initSite,
  markSvg,
  normalizeGlyph,
} from '../index.mjs';
import { extractGlyphs } from '../src/lib/extract-glyphs.mjs';

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

test('initSite scaffolds an Astro or plain-site project without replacing existing scripts', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-site-'));

  try {
    await writeFile(
      path.join(cwd, 'package.json'),
      JSON.stringify({
        name: 'example-site',
        scripts: { build: 'astro build' },
      }),
    );

    const result = initSite({ cwd });
    const config = JSON.parse(await readFile(path.join(cwd, 'brand.config.json'), 'utf8'));
    const pkg = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));

    assert.deepEqual(result.created, [
      'brand.config.json',
      'package.json ("brand" script)',
    ]);
    assert.equal(config.glyph, 'MS');
    assert.equal(pkg.scripts.build, 'astro build');
    assert.equal(pkg.scripts.brand, 'branding-engine generate');
    assert.match(result.headSnippet, /href="\/site\.webmanifest"/);
    assert.match(result.headSnippet, /href="\/brand-tokens\.css"/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('generateSite supports a root-level public directory for plain HTML sites', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-plain-'));

  try {
    await writeFile(
      path.join(cwd, 'brand.config.json'),
      JSON.stringify({ name: 'Plain Site', accent: '#6D5EF7', glyph: 'PS' }),
    );

    await generateSite({ cwd, publicDir: '.' });

    const manifest = JSON.parse(await readFile(path.join(cwd, 'site.webmanifest'), 'utf8'));
    const tokens = await readFile(path.join(cwd, 'brand-tokens.css'), 'utf8');
    assert.equal(manifest.name, 'Plain Site');
    assert.match(tokens, /--brand-accent: #6D5EF7;/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('pictogramSvg renders a tile and rejects unknown glyphs', async () => {
  const { pictogramSvg, PICTOGRAMS } = await import('../index.mjs');
  const svg = pictogramSvg({ glyph: 'home', hex: '#1E3A8A' });
  assert.match(svg, /rx="112\.6/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.ok(Object.keys(PICTOGRAMS).includes('server'));
  assert.throws(() => pictogramSvg({ glyph: 'nope', hex: '#1E3A8A' }), /Unknown pictogram/);
});

test('makePictograms writes svg + png per spec entry', async () => {
  const { makePictograms } = await import('../index.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pictogram-'));
  try {
    const written = await makePictograms({
      spec: [
        { glyph: 'home', hex: '#1E3A8A' },
        { glyph: 'server', hex: '#1E3A8A', name: 'rack', size: 256 },
      ],
      outDir: dir,
    });
    assert.equal(written.length, 2);
    assert.match(written[0].png, /home-512\.png$/);
    assert.match(written[1].png, /rack-256\.png$/);
    const png = await readFile(written[1].png);
    assert.equal(png[1], 0x50); // 'P' of the PNG magic
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('makePictogram composites a logo file and writes a circle preview', async () => {
  const { makePictogram } = await import('../index.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pictogram-logo-'));
  try {
    const logoPath = path.join(dir, 'logo.svg');
    await writeFile(
      logoPath,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><rect width="40" height="20" fill="#e00"/></svg>',
    );
    const written = await makePictogram({
      logo: logoPath,
      hex: '#ffffff',
      name: 'brand',
      outDir: dir,
      circlePreview: true,
    });
    assert.match(written.png, /brand-512\.png$/);
    assert.match(written.circle, /brand-circle\.png$/);
    assert.equal(written.svg, undefined); // logo tiles are raster-only
    const png = await readFile(written.png);
    assert.equal(png[1], 0x50);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('makePictogram rejects glyph+logo together and missing logo files', async () => {
  const { makePictogram } = await import('../index.mjs');
  await assert.rejects(
    () => makePictogram({ glyph: 'home', logo: 'x.svg', hex: '#ffffff' }),
    /either a glyph or a logo/,
  );
  await assert.rejects(
    () => makePictogram({ logo: '/nonexistent/logo.svg', hex: '#ffffff' }),
    /not found/,
  );
});
