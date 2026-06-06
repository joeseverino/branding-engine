import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generateSite, markSvg } from '../index.mjs';

test('markSvg renders a self-contained SVG', () => {
  const svg = markSvg({ size: 64, bg: '#2563eb', glyph: 'BE' });

  assert.match(svg, /^<svg /);
  assert.match(svg, /viewBox="0 0 64 64"/);
  assert.match(svg, /fill="#2563eb"/);
  assert.match(svg, /<path /);
});

test('generateSite writes the expected browser-free assets', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'branding-engine-'));

  try {
    await writeFile(
      path.join(cwd, 'brand.config.json'),
      JSON.stringify({ name: 'Brand Engine', accent: '#2563eb', glyph: 'BE' }),
    );

    const result = await generateSite({ cwd });
    const manifest = JSON.parse(await readFile(path.join(cwd, 'public/site.webmanifest'), 'utf8'));
    const tokens = await readFile(path.join(cwd, 'public/brand-tokens.css'), 'utf8');

    assert.equal(result.written.length, 7);
    assert.equal(manifest.name, 'Brand Engine');
    assert.equal(manifest.theme_color, '#2563eb');
    assert.match(tokens, /--brand-accent: #2563eb;/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
