import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseFig } from '../src/lib/figure/dsl.mjs';
import { inflate, overlapArea, pathHitsRect, pointAlong, rect, rimPoint, segmentHitsRect, union } from '../src/lib/figure/geom.mjs';
import { FigureSpecError, suggest, validateSpec } from '../src/lib/figure/schema.mjs';
import { normalize } from '../src/lib/figure/graph/normalize.mjs';
import { layoutGeo } from '../src/lib/figure/graph/layout-geo.mjs';
import { layoutElk } from '../src/lib/figure/graph/layout-elk.mjs';
import { nodeRect, placeChips, placeLabels } from '../src/lib/figure/graph/place.mjs';
import { contentBounds, fitFrame } from '../src/lib/figure/graph/frame.mjs';
import { makeFigure } from '../src/make-figure.mjs';
import { launchBrowser } from '../src/lib/render.mjs';

// --- .fig parsing -------------------------------------------------------------

test('fig: every arrow operator maps to a direction and style', () => {
  const s = parseFig(['A > B', 'A < B', 'A <> B', 'A - B', 'A --> B', 'A <-- B', 'A <--> B', 'A -- B', 'A -> B', 'A <-> B'].join('\n'));
  const got = s.links.map((l) => `${l.from}${l.dir}${l.style || ''}`);
  assert.deepEqual(got, ['Ato', 'Afrom', 'Aboth', 'Anone', 'Atodashed', 'Afromdashed', 'Abothdashed', 'Anonedashed', 'Ato', 'Aboth']);
  assert.deepEqual(s.nodes.map((n) => n.id), ['A', 'B']);
});

test('fig: chains, fan-out, labels and link props', () => {
  const s = parseFig('A > B > C\nX > Y, Z: sync [dashed, accent]');
  assert.deepEqual(s.links.slice(0, 2).map((l) => [l.from, l.to]), [['A', 'B'], ['B', 'C']]);
  const fan = s.links.slice(2);
  assert.deepEqual(fan.map((l) => [l.from, l.to, l.label, l.style, l.color]), [['X', 'Y', 'sync', 'dashed', 'accent'], ['X', 'Z', 'sync', 'dashed', 'accent']]);
});

test('fig: names with dashes, node props, flags, quoted strings and comments', () => {
  const s = parseFig([
    '# a comment',
    'homelab-server [icon: server, note: "Docker, NPM", anchor]  // trailing',
    'n1 [label: "two\\nlines", at: [1, 2], scale: 1.2, box]',
    'homelab-server > n1',
  ].join('\n'));
  const [a, b] = s.nodes;
  assert.deepEqual(a, { id: 'homelab-server', icon: 'server', note: 'Docker, NPM', role: 'anchor' });
  assert.deepEqual(b, { id: 'n1', label: 'two\nlines', at: [1, 2], scale: 1.2, shape: 'box' });
  assert.equal(s.links[0].to, 'n1');
});

test('fig: directives, inline declarations and nested groups', () => {
  const s = parseFig([
    'title: Hello', 'layout star', 'size: 1600x900', 'direction: down',
    'Outer [dashed] {', '  a', '  Inner {', '    b [icon: cloud]', '  }', '}',
    'Mac [icon: laptop] > b',
  ].join('\n'));
  assert.equal(s.title, 'Hello');
  assert.equal(s.layout, 'star');
  assert.deepEqual(s.size, [1600, 900]);
  assert.equal(s.direction, 'down');
  assert.deepEqual(s.groups, [
    { id: 'g1', label: 'Outer', style: 'dashed', nodes: ['a'] },
    { id: 'g2', label: 'Inner', nodes: ['b'], parent: 'g1' },
  ]);
  assert.equal(s.nodes.find((n) => n.id === 'Mac').icon, 'laptop');
});

test('fig: errors carry line numbers', () => {
  assert.throws(() => parseFig('a\nb [sparkly]'), (e) => e instanceof FigureSpecError && /line 2: unknown flag "sparkly"/.test(e.message));
  assert.throws(() => parseFig('G {\n a'), /1 group\(s\) left open \("G"\)/);
  assert.throws(() => parseFig('a\n}'), /line 2: "}" with no open group/);
});

// --- validation ---------------------------------------------------------------

test('validation suggests the key or value that was meant', () => {
  assert.equal(suggest('labelpos', ['labelPos', 'label']), 'labelPos');
  assert.equal(suggest('zzzzzz', ['label']), undefined);
  assert.throws(() => validateSpec({ template: 'topolgy' }), /Did you mean "topology"/);
  assert.throws(() => validateSpec({ template: 'topology', layuot: 'star' }), /spec.layuot: unknown key \(did you mean "layout"\?\)/);
  assert.throws(() => validateSpec({ template: 'topology', layout: 'starr' }), /did you mean "star"/);
  assert.throws(() => normalize({ template: 'topology', nodes: [{ id: 'a', icon: 'sever', labelpos: 'below' }] }),
    (e) => /node "a".icon: expected an icon.*did you mean "server"/.test(e.message) && /node "a".labelpos: unknown key \(did you mean "labelPos"\?\)/.test(e.message));
});

test('normalize cross-checks ids and folds legacy keys', () => {
  assert.throws(() => normalize({ template: 'topology', nodes: [{ id: 'web' }], links: [{ from: 'web', to: 'wbe' }] }),
    /no node "wbe" \(did you mean "web"\?\)/);
  assert.throws(() => normalize({ template: 'topology', nodes: [{ id: 'a' }, { id: 'a' }] }), /duplicate id/);
  assert.throws(() => normalize({ template: 'topology', nodes: [{ id: 'a' }], groups: [{ label: 'G', nodes: ['b'] }] }), /no node "b"/);
  const G = normalize({
    template: 'topology', layout: 'ring', center: { id: 'hub', label: 'Hub' },
    nodes: [{ id: 'a', addr: '.1' }], links: [{ from: 'a', to: 'hub', dir: 'from', fromLabel: 'x' }],
  });
  assert.equal(G.byId.get('a').note, '.1');
  assert.ok(G.byId.get('hub').isCenter);
  assert.deepEqual([G.links[0].from, G.links[0].to, G.links[0].dir, G.links[0].toLabel], ['hub', 'a', 'to', 'x']);
  assert.equal(normalize({ template: 'topology', nodes: [{ id: 'a', pos: 'center' }] }).opts.layout, 'star');
  assert.equal(normalize({ template: 'topology', nodes: [{ id: 'a' }] }).opts.layout, 'auto');
  const row = normalize({ template: 'topology', layout: 'row', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  assert.deepEqual(row.links.map((l) => `${l.from}${l.to}`), ['ab', 'bc']);
});

// --- geometry -----------------------------------------------------------------

test('geometry helpers', () => {
  const r = rect(0, 0, 10, 10);
  assert.ok(segmentHitsRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r));
  assert.ok(!segmentHitsRect({ x: -5, y: 20 }, { x: 15, y: 20 }, r));
  assert.ok(segmentHitsRect({ x: 2, y: 2 }, { x: 3, y: 3 }, r)); // fully inside
  assert.ok(pathHitsRect([{ x: -5, y: -5 }, { x: -5, y: 5 }, { x: 5, y: 5 }], r));
  assert.equal(overlapArea(r, rect(5, 5, 10, 10)), 25);
  assert.equal(overlapArea(r, rect(20, 20, 1, 1)), 0);
  assert.deepEqual(union([r, rect(20, 5, 5, 20)]), rect(0, 0, 25, 25));
  assert.deepEqual(inflate(r, 2), rect(-2, -2, 14, 14));
  const p = pointAlong([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 0.75);
  assert.deepEqual([p.x, p.y, p.ux, p.uy], [10, 5, 0, 1]);
  assert.deepEqual(rimPoint({ x: 0, y: 0, d: 100 }, { x: 10, y: 0 }, 0), { x: 50, y: 0 });
  const b = rimPoint({ x: 0, y: 0, shape: 'box', w: 100, h: 40 }, { x: 0, y: 99 }, 0);
  assert.equal(Math.round(b.y), 20);
});

// --- placement and fit (pure, measured sizes faked) --------------------------

function prepared(spec, labelW = 160, labelH = 72) {
  const G = normalize(spec);
  for (const n of G.nodes) { n.d = 150; n.labelSize = { w: labelW, h: labelH }; }
  for (const l of G.links) if (l.label) l.chipSize = { w: 140, h: 44 };
  return G;
}

test('star placement keeps every label off every link, hub label in a gap', () => {
  const G = prepared({
    template: 'topology',
    nodes: [{ id: 'hub', pos: 'center' }, { id: 'n', pos: 'n' }, { id: 's', pos: 's' }, { id: 'e', pos: 'e' }, { id: 'w', pos: 'w' }],
    links: ['n', 's', 'e', 'w'].map((id) => ({ from: 'hub', to: id, label: 'link' })),
  });
  layoutGeo(G);
  placeChips(G);
  placeLabels(G);
  for (const n of G.nodes) {
    for (const l of G.links) assert.ok(!pathHitsRect(l.pts, n.labelRect), `${n.id} label crosses ${l.from}→${l.to}`);
    for (const o of G.nodes) if (o !== n) assert.equal(overlapArea(n.labelRect, nodeRect(o)), 0, `${n.id} label on ${o.id}`);
  }
  const hub = G.byId.get('hub');
  const cx = hub.labelRect.x + hub.labelRect.w / 2, cy = hub.labelRect.y + hub.labelRect.h / 2;
  assert.ok(cx !== hub.x && cy !== hub.y, 'hub label sits on a diagonal, between spokes');
  assert.ok(Math.hypot(cx - hub.x, cy - hub.y) < hub.d * 1.4, 'hub label stays close to the hub');
});

test('star auto-assigns compass slots around the anchor', () => {
  const G = prepared({ template: 'topology', layout: 'star', nodes: [{ id: 'a' }, { id: 'h', role: 'anchor' }, { id: 'b' }, { id: 'c' }],
    links: [{ from: 'h', to: 'a' }, { from: 'h', to: 'b' }, { from: 'h', to: 'c' }] });
  layoutGeo(G);
  assert.deepEqual(G.nodes.map((n) => n.pos), ['w', 'center', 'e', 's']);
});

test('fit never clips: everything lands inside the canvas', () => {
  const G = prepared({
    template: 'topology', layout: 'grid',
    nodes: Array.from({ length: 7 }, (_, i) => ({ id: `n${i}` })),
    links: [{ from: 'n0', to: 'n6', label: 'long way' }, { from: 'n1', to: 'n2' }],
  }, 300, 90);
  layoutGeo(G);
  placeChips(G);
  placeLabels(G);
  const B = contentBounds(G);
  for (const sizePx of [[1200, 630], [1600, 900], null]) {
    const f = fitFrame(B, { sizePx, fit: true }, 0);
    const x0 = B.x * f.s + f.tx, y0 = B.y * f.s + f.ty;
    assert.ok(x0 >= 0 && y0 >= 0, `top-left inside for ${sizePx}`);
    assert.ok(x0 + B.w * f.s <= f.W + 0.5 && y0 + B.h * f.s <= f.H + 0.5, `bottom-right inside for ${sizePx}`);
  }
});

test('ELK: grouped graph lays out with no overlapping nodes or labels', async () => {
  const G = prepared({
    template: 'topology',
    nodes: ['mac', 'op', 'srv', 'pid', 'pt', 'vps'].map((id) => ({ id })),
    links: [{ from: 'mac', to: 'op', label: 'ssh' }, { from: 'op', to: 'srv', label: 'tokens' }, { from: 'op', to: 'vps' },
      { from: 'srv', to: 'pid' }, { from: 'srv', to: 'pt' }],
    groups: [{ id: 'lab', label: 'Homelab', nodes: ['srv', 'pid', 'pt'] }],
  }, 220, 72);
  await layoutElk(G, { top: 80, side: 34 });
  const boxes = G.nodes.flatMap((n) => [[`${n.id}`, nodeRect(n)], [`${n.id} label`, n.labelRect]]);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    assert.equal(overlapArea(boxes[i][1], boxes[j][1]), 0, `${boxes[i][0]} overlaps ${boxes[j][0]}`);
  }
  const g = G.groups[0].rect;
  for (const id of ['srv', 'pid', 'pt']) {
    const r = nodeRect(G.byId.get(id));
    assert.ok(r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.w && r.y + r.h <= g.y + g.h, `${id} inside its group`);
  }
  for (const l of G.links) assert.ok(l.pts.length >= 2, `${l.id} routed`);
});

// --- rendering (skips cleanly if Playwright is not installed) -----------------

test('renders .fig and JSON graphs, reports warnings, --strict fails on them', async (t) => {
  let browser;
  try { browser = await launchBrowser(); } catch { return t.skip('Playwright not installed'); }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'figure-graph-'));
  try {
    const fig = path.join(dir, 'flow.fig');
    await writeFile(fig, 'title: Flow\nA [icon: laptop] > B [box, icon: cloud]: hop\nG { C [muted] }\nB --> C');
    const res = await makeFigure({ specPath: fig, browser, quiet: true });
    assert.equal(res.outPath, path.join(dir, 'flow.png'));
    assert.equal(res.width, 3200);
    assert.deepEqual(res.warnings, []);

    const dark = await makeFigure({ spec: { template: 'diagram', theme: 'dark', size: 'og', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ from: 'a', to: 'b' }] }, browser, quiet: true });
    assert.deepEqual([dark.width, dark.height], [2400, 1260]);

    // Two nodes stacked on one spot: overlapping labels must be reported.
    const clash = { template: 'topology', layout: 'free', nodes: [{ id: 'a', at: [0.5, 0.5], labelPos: 'below' }, { id: 'b', at: [0.5, 0.5], labelPos: 'below' }] };
    const warned = await makeFigure({ spec: clash, browser, quiet: true });
    assert.ok(warned.warnings.some((w) => /overlap/.test(w)), warned.warnings.join('; '));
    await assert.rejects(() => makeFigure({ spec: clash, browser, quiet: true, strict: true }), /with --strict/);
  } finally { await browser.close(); }
});
