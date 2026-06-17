import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

import { figureSize, palette, resolveSize, TEMPLATES } from '../src/lib/figure.mjs';
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

test('figureSize defaults radial topologies to 3:2 and everything else to cover', () => {
  assert.deepEqual(figureSize({ template: 'topology', layout: 'star' }), [1500, 1000]);
  assert.deepEqual(figureSize({ template: 'topology', layout: 'ring' }), [1500, 1000]);
  // row → short banner sized to node count (width 1600, height < 16:9)
  const [rw, rh] = figureSize({ template: 'topology', layout: 'row', nodes: [{}, {}] });
  assert.equal(rw, 1600);
  assert.ok(rh < 900 && rh >= 470, `row height ${rh} should be a short banner`);
  assert.deepEqual(figureSize({ template: 'title' }), [1600, 900]);
  assert.deepEqual(figureSize({ template: 'topology', layout: 'star', size: 'og' }), [1200, 630]);
});

test('the seed templates are registered', () => {
  assert.deepEqual(Object.keys(TEMPLATES).sort(), ['diamond', 'flow', 'nodes', 'title', 'topology']);
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
  topologyRow: {
    template: 'topology', layout: 'row', size: [800, 450],
    nodes: [{ id: 'a', icon: 'laptop', label: 'A', role: 'attacker' }, { id: 'b', icon: 'server', label: 'B', addr: '.2' }],
    links: [{ from: 'a', to: 'b', label: 'net', dir: 'both' }],
  },
  topologyRing: {
    template: 'topology', layout: 'ring', size: [800, 450],
    center: { id: 's', icon: 'switch', label: 'S', role: 'anchor' },
    nodes: [{ id: 'a', icon: 'monitor', label: 'A' }, { id: 'b', icon: 'monitor', label: 'B' }, { id: 'c', icon: 'server', label: 'C' }],
    links: [{ from: 'a', to: 's', dir: 'both' }, { from: 'c', to: 's', style: 'dashed', dir: 'to' }],
  },
  topologyStar: {
    template: 'topology', layout: 'star', size: [800, 450],
    nodes: [
      { id: 's1', icon: 'switch', label: 'SW', role: 'anchor', pos: 'center' },
      { id: 'c0', icon: 'server', label: 'Ctrl', pos: 'nw' },
      { id: 'h1', icon: 'monitor', label: 'Victim', pos: 'w' },
      { id: 'h2', icon: 'monitor', label: 'Target', pos: 'e' },
      { id: 'h3', icon: 'monitor', label: 'Atk', role: 'attacker', pos: 's' },
    ],
    links: [{ from: 'c0', to: 's1', style: 'dashed', dir: 'both' }, { from: 'h1', to: 's1', dir: 'both' }],
  },
  topologyFree: {
    template: 'topology', layout: 'free', size: [800, 450],
    nodes: [
      { id: 'c0', icon: 'server', label: 'Ctrl', at: [0.15, 0.2] },
      { id: 's1', icon: 'switch', label: 'SW', role: 'anchor', scale: 1.1, at: [0.5, 0.4], labelPos: 'below' },
      { id: 'v', icon: 'monitor', label: 'Victim', at: [0.15, 0.8] },
      { id: 'a', icon: 'monitor', label: 'Atk', role: 'attacker', at: [0.5, 0.8] },
      { id: 't', icon: 'monitor', label: 'Target', at: [0.85, 0.8] },
    ],
    links: [
      { from: 'c0', to: 's1', style: 'dashed', dir: 'to' },
      { from: 'v', to: 'a', label: 'spoofed ARP', style: 'dashed', dir: 'to', color: 'accent' },
      { from: 'a', to: 't', style: 'dashed', dir: 'to', color: 'accent' },
    ],
  },
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
