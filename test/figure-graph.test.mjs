import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
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
    'app-server [icon: server, note: "API, workers", anchor]  // trailing',
    'n1 [label: "two\\nlines", at: [1, 2], scale: 1.2, box]',
    'app-server > n1',
  ].join('\n'));
  const [a, b] = s.nodes;
  assert.deepEqual(a, { id: 'app-server', icon: 'server', note: 'API, workers', role: 'anchor' });
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
    { id: '#g1', label: 'Outer', style: 'dashed', nodes: ['a'] },
    { id: '#g2', label: 'Inner', nodes: ['b'], parent: '#g1' },
  ]);
  assert.equal(s.nodes.find((n) => n.id === 'Mac').icon, 'laptop');
});

test('fig: errors carry line numbers', () => {
  assert.throws(() => parseFig('a\nb [sparkly]'), (e) => e instanceof FigureSpecError && /line 2: unknown node flag "sparkly"/.test(e.message));
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
    /no node or group "wbe" \(did you mean "web"\?\)/);
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
  assert.equal(normalize({ template: 'topology', nodes: [{ id: 'a' }] }).opts.layout, 'row');
  assert.equal(normalize({ template: 'topology', nodes: [{ id: 'a' }], links: [] }).opts.layout, 'auto');
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
    groups: [{ id: 'lab', label: 'Private network', nodes: ['srv', 'pid', 'pt'] }],
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
    assert.ok(res.width >= 2200 && res.width <= 3200, `content-sized width ${res.width}`);
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

// --- review fixes -------------------------------------------------------------

const figErr = (text, re) => assert.throws(() => parseFig(text), (e) => e instanceof FigureSpecError && re.test(e.message), `expected ${re}`);

test('fig: directives win over arrows in their value, any case', () => {
  assert.equal(parseFig('title: Prod - staging\nA').title, 'Prod - staging');
  assert.equal(parseFig('title: Mac > Cloud\nA').title, 'Mac > Cloud');
  assert.equal(parseFig('Title: Hello\nA').title, 'Hello');
});

test('fig: lines that are not nodes fail with a suggestion instead of becoming nodes', () => {
  figErr('layot: auto\nA', /line 1: unknown directive "layot" \(did you mean "layout"\?\)/);
  figErr('Redis: cache', /"Redis:" is not a directive/);
  figErr('A->B', /line 1: "A->B" looks like a link written without spaces/);
  figErr('A >', /line 1: a link is missing a node/);
  figErr('> B', /a link is missing a node/);
  figErr('NAS > NAS', /"NAS" links to itself/);
  figErr('# only a comment', /declares no nodes/);
});

test('fig: every problem in one round, flag typos with suggestions', () => {
  assert.throws(() => parseFig('A [anchr, icon: sever]\nB [dashed]\nA > B [dashd]'), (e) => {
    const m = e.message;
    return /line 1: unknown node flag "anchr" \(did you mean "anchor"\?\)/.test(m)
      && /line 1: node "A".icon: .*did you mean "server"/.test(m)
      && /line 2: "dashed" is a link flag, not a node flag/.test(m)
      && /line 3: unknown link flag "dashd" \(did you mean "dashed"\?\)/.test(m)
      && e.errors.length === 4;
  });
});

test('fig: group membership comes from declarations', () => {
  const ref = parseFig('Cloud {\n  api > db\n}');
  assert.deepEqual(ref.groups[0].nodes, ['api', 'db']);
  const moved = parseFig('G {\n  A > Outside\n}\nOutside [icon: cloud]');
  assert.deepEqual(moved.groups[0].nodes, ['A']);
  const later = parseFig('A [icon: cloud]\nG {\n  A\n}');
  assert.deepEqual(later.groups[0].nodes, ['A']);
  figErr('G {\n A\n}\nH {\n A\n}', /line 5: "A" is already declared in group "G" \(line 2\)/);
});

test('fig: comments only at a line start or after a space; quoted names keep operators', () => {
  assert.deepEqual(parseFig('C# > F#').links.map((l) => [l.from, l.to]), [['C#', 'F#']]);
  assert.deepEqual(parseFig('http://x > D # note').links.map((l) => [l.from, l.to]), [['http://x', 'D']]);
  const q = parseFig('"A > B" [icon: server]\n"A > B" > "C, D": hop');
  assert.deepEqual(q.nodes, [{ id: 'A > B', icon: 'server' }, { id: 'C, D' }]);
  assert.equal(q.links[0].label, 'hop');
});

test('fig: link props before or after the label; node props on the last endpoint', () => {
  const a = parseFig('A > B [dashed]: x').links[0];
  assert.deepEqual([a.label, a.style], ['x', 'dashed']);
  const b = parseFig('A > B [icon: server]');
  assert.equal(b.nodes[1].icon, 'server');
  assert.equal(b.links[0].icon, undefined);
});

test('normalize: self-links and empty groups are noted, not silently dropped', () => {
  const G = normalize({ template: 'topology', nodes: [{ id: 'a' }, { id: 'b' }], links: [{ from: 'a', to: 'a' }],
    groups: [{ id: 'e', label: 'Empty', nodes: [] }, { id: 'f', label: 'Full', nodes: ['b'] }] });
  assert.equal(G.links.length, 0);
  assert.deepEqual(G.groups.map((g) => g.id), ['f']);
  assert.ok(G.notes.some((n) => /joins a node to itself/.test(n)));
  assert.ok(G.notes.some((n) => /group "Empty" has no nodes/.test(n)));
  assert.throws(() => normalize({ template: 'topology', nodes: [] }), /needs at least one node/);
});

test('normalize: legacy nodeScale fraction only for fixed topology layouts', () => {
  assert.equal(normalize({ template: 'topology', layout: 'star', nodeScale: 0.16, nodes: [{ id: 'a' }] }).opts.nodeScale, 1);
  assert.equal(normalize({ template: 'diagram', layout: 'star', nodeScale: 0.45, nodes: [{ id: 'a' }] }).opts.nodeScale, 0.45);
  assert.equal(normalize({ template: 'topology', nodeScale: 0.45, nodes: [{ id: 'a' }], links: [] }).opts.nodeScale, 0.45);
  assert.equal(normalize({ template: 'topology', nodes: [{ id: 'a' }], links: [] }).opts.routing, 'orthogonal');
});

test('ELK: orthogonal by default, ends square to the rim', async () => {
  const G = prepared({ template: 'topology', nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })),
    links: [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'a', to: 'd' }, { from: 'b', to: 'd' }] });
  await layoutElk(G, { top: 80, side: 34 });
  for (const l of G.links) {
    l.pts.forEach((p, i) => {
      if (!i) return;
      const q = l.pts[i - 1];
      assert.ok(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5, `${l.id} segment ${i} is axis-aligned`);
    });
    const a = G.byId.get(l.from), b = G.byId.get(l.to);
    assert.ok(Math.abs(Math.hypot(l.pts[0].x - a.x, l.pts[0].y - a.y) - (a.d / 2 + 9)) < 1, `${l.id} leaves at the rim`);
    const e = l.pts[l.pts.length - 1];
    assert.ok(Math.abs(Math.hypot(e.x - b.x, e.y - b.y) - (b.d / 2 + 9)) < 1, `${l.id} arrives at the rim`);
  }
});

test('star: a hub with all eight spokes gets a badge label instead of a warning', () => {
  const spokes = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  const G = prepared({ template: 'topology', layout: 'star', nodes: [{ id: 'hub', role: 'anchor' }, ...spokes.map((id) => ({ id }))],
    links: spokes.map((id) => ({ from: 'hub', to: id, label: id })) }, 120, 40);
  layoutGeo(G);
  placeChips(G);
  placeLabels(G);
  const hub = G.byId.get('hub');
  assert.ok(hub.labelBadge, 'hub label is badged');
  for (const l of G.links) assert.equal(overlapArea(hub.labelRect, l.chipRect), 0, `hub label clear of chip ${l.label}`);
});

test('renders: wrapped chains read at full size, dark anchors stay visible, --strict writes nothing', async (t) => {
  let browser;
  try { browser = await launchBrowser(); } catch { return t.skip('Playwright not installed'); }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'figure-review-'));
  try {
    const steps = ['Commit', 'Lint', 'Test', 'Build', 'Sign', 'Scan', 'Stage', 'Approve', 'Deploy', 'Verify'];
    const chain = parseFig(`title: Release\n${steps.join(' > ')}`);
    const res = await makeFigure({ spec: chain, browser, quiet: true, strict: true });
    assert.deepEqual(res.warnings, []);

    const darkSpec = { template: 'diagram', theme: 'dark', nodes: [{ id: 'a', role: 'anchor' }, { id: 'b' }], links: [{ from: 'a', to: 'b', color: 'accent' }] };
    const { buffer } = await makeFigure({ spec: darkSpec, browser, quiet: true });
    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    let bright = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) bright++;
    assert.ok(bright > 2000, 'paper ring and glyph show on the dark page');

    const out = path.join(dir, 'clash.png');
    const clash = { template: 'topology', layout: 'free', nodes: [{ id: 'a', at: [0.5, 0.5], labelPos: 'below' }, { id: 'b', at: [0.5, 0.5], labelPos: 'below' }] };
    await assert.rejects(() => makeFigure({ spec: clash, out, browser, quiet: true, strict: true }), /nothing written/);
    await assert.rejects(() => stat(out), /ENOENT/);
  } finally { await browser.close(); }
});

// --- links to groups ------------------------------------------------------------

const SERVERS = [
  'Mac [icon: laptop]',
  'Vault [icon: key, anchor]',
  'Mac <> Vault: sign',
  'Mac <> Servers: user cert · host cert',
  'Servers [dashed] {',
  '  web [icon: server]',
  '  vps [icon: cloud]',
  '}',
].join('\n');

test('fig: a link may name a group, even one declared below it', () => {
  const s = parseFig(SERVERS);
  assert.deepEqual(s.nodes.map((n) => n.id), ['Mac', 'Vault', 'web', 'vps']);
  const g = s.groups[0];
  assert.equal(g.label, 'Servers');
  assert.deepEqual(s.links[1], { from: 'Mac', to: g.id, dir: 'both', label: 'user cert · host cert' });
});

test('fig: a group link fails clearly when the name is ambiguous', () => {
  assert.throws(() => parseFig('A > G\nG {\n  x\n}\nG {\n  y\n}'), /2 groups are labelled "G"/);
  assert.throws(() => parseFig('G\nA > G\nG {\n  x\n}'), /"G" is both a group and a node/);
});

test('normalize: group ends are checked like node ends', () => {
  const base = { template: 'topology', nodes: [{ id: 'a' }, { id: 'b' }], groups: [{ id: 'G', label: 'G', nodes: ['b'] }] };
  const ok = normalize({ ...base, links: [{ from: 'a', to: 'G' }] });
  assert.equal(ok.links[0].toGroup, true);
  assert.equal(ok.links[0].fromGroup, false);
  assert.throws(() => normalize({ ...base, links: [{ from: 'b', to: 'G' }] }), /"b" sits inside group "G"/);
  assert.throws(() => normalize({ ...base, links: [{ from: 'a', to: 'Gx' }] }), /no node or group "Gx" \(did you mean "G"\?\)/);
  const rev = normalize({ ...base, links: [{ from: 'a', to: 'G', dir: 'from' }] });
  assert.deepEqual([rev.links[0].from, rev.links[0].fromGroup, rev.links[0].to, rev.links[0].toGroup], ['G', true, 'a', false]);
});

const bareMeasure = (G) => {
  for (const n of G.nodes) { n.d = 150; n.labelSize = { w: 120, h: 40 }; }
  for (const l of G.links) if (l.label) l.chipSize = { w: 200, h: 44 };
};

test('ELK: a link to a group stops just outside its border, square to it', async () => {
  const G = normalize(parseFig(SERVERS));
  bareMeasure(G);
  await layoutElk(G, { top: 90, side: 34 });
  const r = G.groupById.get(G.links[1].to).rect;
  const pts = G.links[1].pts;
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  assert.ok(Math.abs(end.x - (r.x - 9)) < 1, `ends 9px left of the border (${end.x} vs ${r.x - 9})`);
  assert.ok(end.y > r.y && end.y < r.y + r.h, 'meets the border along its side');
  assert.ok(Math.abs(prev.y - end.y) < 0.5, 'last segment is horizontal');
  for (const n of G.nodes.filter((x) => x.group)) {
    assert.ok(!pathHitsRect(pts, nodeRect(n)), `does not run into member ${n.id}`);
  }
});

test('fixed layouts: a link to a group ends at its border and labels clear it', async () => {
  const spec = { ...parseFig(SERVERS), layout: 'grid' };
  spec.nodes.find((n) => n.id === 'Mac').at = [0, 1];
  spec.nodes.find((n) => n.id === 'Vault').at = [0, 0];
  spec.nodes.find((n) => n.id === 'web').at = [2, 0];
  spec.nodes.find((n) => n.id === 'vps').at = [2, 1];
  const browser = await launchBrowser().catch(() => null);
  if (!browser) return;
  try {
    const { warnings, buffer } = await makeFigure({ spec, browser });
    assert.ok(buffer.length > 1000);
    assert.deepEqual(warnings, []);
  } finally { await browser.close(); }
});

test('group labels slide clear of a link crossing their top band', async () => {
  const { placeGroupLabels } = await import('../src/lib/figure/graph/place.mjs');
  const G = {
    groups: [{ id: 'G', label: 'Homelab', rect: rect(0, 0, 600, 400) }],
    links: [{ pts: [{ x: 60, y: -100 }, { x: 60, y: 200 }] }],
  };
  placeGroupLabels(G, new Map([['G', { w: 120, h: 20 }]]), 1);
  const lr = G.groups[0].labelRect;
  assert.equal(G.groups[0].labelBadge, false);
  assert.ok(!pathHitsRect(G.links[0].pts, lr), 'label clears the line');
  assert.ok(lr.x > 60 && lr.x < 120, `moved just past the line (x=${lr.x})`);
  G.links.push({ pts: [{ x: -50, y: 30 }, { x: 650, y: 30 }] }); // a line along the whole band
  placeGroupLabels(G, new Map([['G', { w: 120, h: 20 }]]), 1);
  assert.equal(G.groups[0].labelBadge, true, 'no clear spot: badge it');
});

test('ELK: runs of two links that nearly meet on one track are nudged apart', async () => {
  const { separateTouchingRuns } = await import('../src/lib/figure/graph/layout-elk.mjs');
  const a = { from: 'p', to: 'q', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }] };
  const b = { from: 'r', to: 's', pts: [{ x: 0, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 220 }, { x: 300, y: 220 }] };
  const far = { from: 't', to: 'u', pts: [{ x: 0, y: 900 }, { x: 100, y: 900 }, { x: 100, y: 700 }, { x: 300, y: 700 }] };
  separateTouchingRuns([a, b, far]);
  assert.equal(a.pts[1].x, 100, 'the first link keeps its track');
  assert.notEqual(b.pts[1].x, 100, 'the second moves off it');
  assert.equal(b.pts[1].x, b.pts[2].x, 'and stays vertical');
  assert.equal(far.pts[1].x, 100, 'runs far apart are left alone');
  const fan1 = { from: 'hub', to: 'x', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -200 }, { x: 300, y: -200 }] };
  const fan2 = { from: 'hub', to: 'y', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }] };
  separateTouchingRuns([fan1, fan2]);
  assert.equal(fan2.pts[1].x, 100, 'a fan-out keeps its shared trunk');
});
