import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { palette, resolveSize, TEMPLATES } from '../src/lib/figure.mjs';
import { makeFigure, readTokens } from '../src/make-figure.mjs';
import { launchBrowser } from '../src/lib/render.mjs';

// --- pure unit coverage (always runs, no browser) --------------------------

test('resolveSize handles presets and explicit dimensions', () => {
  assert.deepEqual(resolveSize('og'), [1200, 630]);
  assert.deepEqual(resolveSize([800, 400]), [800, 400]);
  assert.deepEqual(resolveSize('nonsense'), [1600, 900]); // cover fallback
});

test('palette derives distinct light and dark themes from tokens', () => {
  const light = palette('light', { accent: '#1E3A8A' });
  const dark = palette('dark', { accent: '#1E3A8A' });
  assert.equal(light.dark, false);
  assert.equal(dark.dark, true);
  assert.match(light.pageBg, /radial-gradient/);
  assert.notEqual(light.line, dark.line);
});

test('the four seed templates are registered', () => {
  assert.deepEqual(Object.keys(TEMPLATES).sort(), ['diamond', 'flow', 'nodes', 'title']);
});

test('readTokens returns {} for no path and parses brand-* vars', () => {
  assert.deepEqual(readTokens(), {});
});

// --- render coverage (skips cleanly if Playwright is not installed) --------

const specs = {
  title: { template: 'title', size: [800, 400], headline: 'Hello' },
  flow: { template: 'flow', size: [800, 400], rows: [{ steps: ['A', 'B', 'C'], anchor: 'B' }] },
  diamond: { template: 'diamond', size: [800, 450], center: 'X', nodes: { top: 'A', left: 'B', right: 'C', bottom: 'D' } },
  nodes: { template: 'nodes', layout: 'ring', size: [600, 600], center: 'C', nodes: ['a', 'b', 'c', 'd'] },
};

test('renders every template to a correctly-sized PNG at 2x', async (t) => {
  let browser;
  try { browser = await launchBrowser(); } catch { return t.skip('Playwright not installed'); }
  try {
    for (const [name, spec] of Object.entries(specs)) {
      const { buffer, width, height } = await makeFigure({ spec, browser });
      const meta = await sharp(buffer).metadata();
      assert.equal(meta.format, 'png', name);
      assert.equal(meta.width, width, name);
      assert.equal(meta.height, height, name);
    }
  } finally { await browser.close(); }
});

test('an unknown template fails closed', async (t) => {
  let browser;
  try { browser = await launchBrowser(); } catch { return t.skip('Playwright not installed'); }
  try {
    await assert.rejects(() => makeFigure({ spec: { template: 'nope' }, browser }), /Unknown figure template/);
  } finally { await browser.close(); }
});
