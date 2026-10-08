import assert from 'node:assert/strict';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  buildKit,
  generateSite,
  initSite,
  markSvg,
  normalizeGlyph,
  renderMarkSet,
} from '../src/index.ts';
import { extractGlyphs } from '../src/lib/extract-glyphs.ts';
import { scratch, setEnv } from './support.ts';

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

test('renderMarkSet emits one reusable browser and brand asset contract', async () => {
  const rendered = await renderMarkSet({ hex: '#2563eb', onColor: '#ffffff', glyph: 'a3x' });

  assert.deepEqual(Object.keys(rendered), [
    'faviconSvg', 'favicon32', 'favicon192', 'appleTouchIcon', 'faviconIco',
    'markSvg', 'mark512', 'mark1024', 'markTransparent', 'markTransparentInverse',
  ]);
  assert.match(rendered.faviconSvg, /viewBox="0 0 64 64"/);
  assert.match(rendered.markSvg, /viewBox="0 0 512 512"/);
  assert.equal(rendered.faviconIco.readUInt16LE(2), 1);
  assert.equal(rendered.faviconIco.readUInt16LE(4), 2);
  for (const value of Object.values(rendered)) assert.ok(value.length > 0);
});

test('extractGlyphs creates a cache entirely in Node', async () => {
  await using tmp = await scratch('glyphs');
  const cwd = tmp.path;
  const outPath = path.join(cwd, 'glyphs.json');
  const fontPath = path.resolve('assets/fonts/inter/inter-variable-latin.woff2');

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
});

test('buildKit extracts and uses a custom WOFF2 font without Python', async (t) => {
  t.mock.method(console, 'log', () => {});
  await using tmp = await scratch('custom-font');
  const cwd = tmp.path;
  const font = path.join(cwd, 'custom-inter.woff2');
  const cache = path.join(cwd, 'cache');
  const outDir = path.join(cwd, 'output');

  await copyFile(path.resolve('assets/fonts/inter/inter-variable-latin.woff2'), font);
  setEnv(t, 'BRAND_CACHE_DIR', cache);
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
});

test('generateSite writes the expected browser-free assets', async () => {
  await using tmp = await scratch('');
  const cwd = tmp.path;

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
});

test('initSite scaffolds an Astro or plain-site project without replacing existing scripts', async () => {
  await using tmp = await scratch('site');
  const cwd = tmp.path;

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
});

test('generateSite supports a root-level public directory for plain HTML sites', async () => {
  await using tmp = await scratch('plain');
  const cwd = tmp.path;

  await writeFile(
    path.join(cwd, 'brand.config.json'),
    JSON.stringify({ name: 'Plain Site', accent: '#6D5EF7', glyph: 'PS' }),
  );

  await generateSite({ cwd, publicDir: '.' });

  const manifest = JSON.parse(await readFile(path.join(cwd, 'site.webmanifest'), 'utf8'));
  const tokens = await readFile(path.join(cwd, 'brand-tokens.css'), 'utf8');
  assert.equal(manifest.name, 'Plain Site');
  assert.match(tokens, /--brand-accent: #6D5EF7;/);
});

test('pictogramSvg renders a tile and rejects unknown glyphs', async () => {
  const { pictogramSvg, PICTOGRAMS } = await import('../src/index.ts');
  const svg = pictogramSvg({ glyph: 'home', hex: '#1E3A8A' });
  assert.match(svg, /rx="112\.6/);
  assert.match(svg, /stroke="#ffffff"/);
  assert.ok(Object.keys(PICTOGRAMS).includes('server'));
  assert.throws(() => pictogramSvg({ glyph: 'nope', hex: '#1E3A8A' }), /Unknown pictogram/);
});

test('makePictograms writes svg + png per spec entry', async () => {
  const { isPictogramFiles, makePictograms } = await import('../src/index.ts');
  await using tmp = await scratch('pictogram');
  const dir = tmp.path;
  const written = await makePictograms({
    spec: [
      { glyph: 'home', hex: '#1E3A8A' },
      { glyph: 'server', hex: '#1E3A8A', name: 'rack', size: 256 },
    ],
    outDir: dir,
  });
  assert.equal(written.length, 2);
  const [home, rack] = written;
  assert.ok(home && isPictogramFiles(home) && rack && isPictogramFiles(rack));
  assert.match(home.png, /home-512\.png$/);
  assert.match(rack.png, /rack-256\.png$/);
  const png = await readFile(rack.png);
  assert.equal(png[1], 0x50);
});

test('makePictogram composites a logo file and writes a circle preview', async () => {
  const { makePictogram } = await import('../src/index.ts');
  await using tmp = await scratch('pictogram-logo');
  const dir = tmp.path;
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
  assert.match(written.circle ?? '', /brand-circle\.png$/);
  assert.equal(written.svg, undefined); // logo tiles are raster-only
  const png = await readFile(written.png);
  assert.equal(png[1], 0x50);
});

test('makePictogram rejects glyph+logo together and missing logo files', async () => {
  const { makePictogram } = await import('../src/index.ts');
  await assert.rejects(
    () => makePictogram({ glyph: 'home', logo: 'x.svg', hex: '#ffffff' }),
    /exactly one of/,
  );
  await assert.rejects(
    () => makePictogram({ logo: '/nonexistent/logo.svg', hex: '#ffffff' }),
    /not found/,
  );
});

test('makePictogram renders text tiles, token colors, and variant pairs', async () => {
  const { makePictogram, resolveColor } = await import('../src/index.ts');
  assert.equal(resolveColor('accent'), '#1E3A8A');
  assert.throws(() => resolveColor('mauve'), /Unknown color/);

  await using tmp = await scratch('pictogram-text');
  const dir = tmp.path;
  const pair = await makePictogram({
    text: 'HQ',
    hex: 'accent',
    outDir: dir,
    variants: ['light', 'dark'],
    circlePreview: true,
  });
  const { light, dark } = pair;
  assert.ok(light?.svg && dark?.circle);
  assert.match(light.png, /hq-light-512\.png$/);
  assert.match(dark.png, /hq-dark-512\.png$/);
  assert.ok(light.svg.endsWith('hq-light.svg'));
  assert.ok(dark.circle.endsWith('hq-dark-circle.png'));
  const lightSvg = await readFile(light.svg, 'utf8');
  assert.match(lightSvg, /fill="#ffffff"/);
});

test('makePictogram tints monochrome logos and defaults circle preview on', async () => {
  const { makePictogram, tintSvg } = await import('../src/index.ts');
  assert.equal(
    tintSvg('<path fill="#FFF" stroke="#000"/>', '#0086ea'),
    '<path fill="#0086ea" stroke="#0086ea"/>',
  );
  assert.match(tintSvg('<svg fill="none"><path fill="#FFF"/></svg>', '#0086ea'), /fill="none"/);

  await using tmp = await scratch('pictogram-tint');
  const dir = tmp.path;
  const logoPath = path.join(dir, 'logo.svg');
  await writeFile(
    logoPath,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#FFF"/></svg>',
  );
  const one = await makePictogram({ logo: logoPath, hex: 'paper', tint: 'accent', outDir: dir });
  assert.ok(one.circle, 'logo tiles default to writing a circle preview');

  const pair = await makePictogram({
    logo: logoPath, hex: 'deep', tint: 'deep', outDir: dir, variants: 'light,dark', name: 'mark',
  });
  assert.ok(pair.dark);
  assert.match(pair.dark.png, /mark-dark-512\.png$/);
  await assert.rejects(
    () => makePictogram({ logo: logoPath, hex: 'deep', outDir: dir, variants: ['dark'] }),
    /require --tint/,
  );
});
