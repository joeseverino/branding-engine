import assert from 'node:assert/strict';
import { stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import test from 'node:test';

import { parseFig } from '../src/lib/figure/dsl.ts';
import { inflate, overlapArea, pathHitsRect, pointAlong, rect, rimPoint, segmentHitsRect, segments, union, type Point, type Rect } from '../src/lib/figure/geom.ts';
import { FigureSpecError, suggest, validateSpec } from '../src/lib/figure/schema.ts';
import { required } from '../src/lib/guards.ts';
import { normalize } from '../src/lib/figure/graph/normalize.ts';
import { layoutGeo } from '../src/lib/figure/graph/layout-geo.ts';
import { layoutElk } from '../src/lib/figure/graph/layout-elk.ts';
import { renderGraph, type Measure } from '../src/lib/figure/graph/index.ts';
import type { Graph } from '../src/lib/figure/graph/model.ts';
import type { Dimensions } from '../src/lib/figure/palette.ts';
import type { GraphSpec } from '../src/lib/figure/spec.ts';
import { palette } from '../src/lib/figure/palette.ts';
import { nodeRect, placeChips, placeLabels, placeGroupLabels, type LabelledGroups } from '../src/lib/figure/graph/place.ts';
import { contentBounds, fitFrame } from '../src/lib/figure/graph/frame.ts';
import { makeFigure } from '../src/make-figure.ts';
import { browserOrSkip, scratch } from './support.ts';

const isSpecError = (e: unknown, re: RegExp): boolean => e instanceof FigureSpecError && re.test(e.message);
const node = (G: Graph, id: string) => required(G.byId.get(id), `node ${id}`);

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
  assert.equal(s.links.at(0)?.to, 'n1');
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
  assert.equal(s.nodes.find((n) => n.id === 'Mac')?.icon, 'laptop');
});

test('fig: errors carry line numbers', () => {
  assert.throws(() => parseFig('a\nb [sparkly]'), (e) => isSpecError(e, /line 2: unknown node flag "sparkly"/));
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
    (e) => isSpecError(e, /node "a".icon: expected an icon.*did you mean "server"/) && isSpecError(e, /node "a".labelpos: unknown key \(did you mean "labelPos"\?\)/));
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
  assert.equal(node(G, 'a').note, '.1');
  assert.ok(node(G, 'hub').isCenter);
  assert.deepEqual(G.links.map((l) => [l.from, l.to, l.dir, l.toLabel]), [['hub', 'a', 'to', 'x']]);
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
  assert.deepEqual(rimPoint({ x: 0, y: 0, shape: 'circle', d: 100 }, { x: 10, y: 0 }, 0), { x: 50, y: 0 });
  const b = rimPoint({ x: 0, y: 0, shape: 'box', w: 100, h: 40 }, { x: 0, y: 99 }, 0);
  assert.equal(Math.round(b.y), 20);
});

// --- placement and fit (pure, measured sizes faked) --------------------------

function prepared(spec: GraphSpec, labelW = 160, labelH = 72): Graph {
  const G = normalize(spec);
  for (const n of G.nodes) { if (n.shape === 'circle') n.d = 150; n.labelSize = { w: labelW, h: labelH }; }
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
    const label = required(n.labelRect, `the label of ${n.id}`);
    for (const l of G.links) assert.ok(!pathHitsRect(l.pts, label), `${n.id} label crosses ${l.from}→${l.to}`);
    for (const o of G.nodes) if (o !== n) assert.equal(overlapArea(label, nodeRect(o)), 0, `${n.id} label on ${o.id}`);
  }
  const hub = node(G, 'hub');
  assert.equal(hub.shape, 'circle');
  const hubLabel = required(hub.labelRect, 'the hub label');
  const cx = hubLabel.x + hubLabel.w / 2, cy = hubLabel.y + hubLabel.h / 2;
  assert.ok(cx !== hub.x && cy !== hub.y, 'hub label sits on a diagonal, between spokes');
  assert.ok(hub.shape === 'circle' && Math.hypot(cx - hub.x, cy - hub.y) < hub.d * 1.4, 'hub label stays close to the hub');
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
  const frames: Array<Dimensions | null> = [[1200, 630], [1600, 900], null];
  for (const sizePx of frames) {
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
  const boxes = G.nodes.flatMap((n): Array<[string, Rect]> => [[`${n.id}`, nodeRect(n)], [`${n.id} label`, required(n.labelRect, `the label of ${n.id}`)]]);
  for (const [i, [name, box]] of boxes.entries()) for (const [otherName, other] of boxes.slice(i + 1)) {
    assert.equal(overlapArea(box, other), 0, `${name} overlaps ${otherName}`);
  }
  const g = required(G.groups[0]?.rect, 'the group rect');
  for (const id of ['srv', 'pid', 'pt']) {
    const r = nodeRect(node(G, id));
    assert.ok(r.x >= g.x && r.y >= g.y && r.x + r.w <= g.x + g.w && r.y + r.h <= g.y + g.h, `${id} inside its group`);
  }
  for (const l of G.links) assert.ok(l.pts.length >= 2, `${l.id} routed`);
});

test('a wrapped layout that ELK cannot compute leaves the unwrapped one in place', async () => {
  // With these measured sizes ELK's row wrapping throws on this grouped, labelled graph.
  const spec = parseFig([
    'direction: right',
    'Mac [dashed] {', '  Obsidian vault [icon: file]', '  Content sync [icon: terminal]', '}',
    'GitHub [dashed] {', '  Repository [icon: code]', '  dist branch [icon: file]', '}',
    'Cloudflare [dashed] {', '  Pages build [icon: cpu]', '  Edge [icon: globe]', '}',
    'Obsidian vault > Content sync',
    'Content sync > Repository: pull request',
    'Repository > Pages build',
    'Repository > dist branch',
    'Pages build > Edge',
  ].join('\n'));
  const widths: Record<string, number> = { 'Obsidian vault': 201, 'Content sync': 230, Repository: 172, 'dist branch': 182, 'Pages build': 208, Edge: 265 };
  const measure: Measure = async (fragments) => fragments.map((html) => {
    if (html.includes('pull request')) return { w: 171, h: 46 };
    const width = Object.entries(widths).find(([id]) => html.includes(id))?.[1];
    return width ? { w: width, h: 68 } : { w: 60, h: 28 };
  });
  const { graph } = await renderGraph(spec, palette('light', {}), measure);
  assert.equal(graph.opts.wrapped, false);
  const chip = required(graph.links.find((l) => l.label)?.chipRect, 'the chip is placed');
  for (const n of graph.nodes) assert.equal(overlapArea(chip, nodeRect(n)), 0, `the chip clears ${n.id}`);
});

// --- rendering (skips cleanly if Playwright is not installed) -----------------

test('renders .fig and JSON graphs, reports warnings, --strict fails on them', async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await using tmp = await scratch('figure-graph');
  const dir = tmp.path;
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
});


const figErr = (text: string, re: RegExp): void => assert.throws(() => parseFig(text), (e) => isSpecError(e, re), `expected ${re}`);

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
    if (!(e instanceof FigureSpecError)) return false;
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
  assert.deepEqual(ref.groups?.[0]?.nodes, ['api', 'db']);
  const moved = parseFig('G {\n  A > Outside\n}\nOutside [icon: cloud]');
  assert.deepEqual(moved.groups?.[0]?.nodes, ['A']);
  const later = parseFig('A [icon: cloud]\nG {\n  A\n}');
  assert.deepEqual(later.groups?.[0]?.nodes, ['A']);
  figErr('G {\n A\n}\nH {\n A\n}', /line 5: "A" is already declared in group "G" \(line 2\)/);
});

test('fig: comments only at a line start or after a space; quoted names keep operators', () => {
  assert.deepEqual(parseFig('C# > F#').links.map((l) => [l.from, l.to]), [['C#', 'F#']]);
  assert.deepEqual(parseFig('http://x > D # note').links.map((l) => [l.from, l.to]), [['http://x', 'D']]);
  const q = parseFig('"A > B" [icon: server]\n"A > B" > "C, D": hop');
  assert.deepEqual(q.nodes, [{ id: 'A > B', icon: 'server' }, { id: 'C, D' }]);
  assert.equal(q.links.at(0)?.label, 'hop');
});

test('fig: link props before or after the label; node props on the last endpoint', () => {
  const [a] = parseFig('A > B [dashed]: x').links;
  assert.ok(a);
  assert.deepEqual([a.label, a.style], ['x', 'dashed']);
  const b = parseFig('A > B [icon: server]');
  assert.equal(b.nodes.at(1)?.icon, 'server');
  const [bLink] = b.links;
  assert.ok(bLink && !('icon' in bLink), 'the bracket belongs to the node, not the link');
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
    for (const [i, [q, p]] of [...segments(l.pts)].entries()) {
      assert.ok(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5, `${l.id} segment ${i + 1} is axis-aligned`);
    }
    const a = node(G, l.from), b = node(G, l.to);
    assert.ok(a.shape === 'circle' && b.shape === 'circle');
    const [s] = l.pts, e = l.pts.at(-1);
    assert.ok(s && e);
    assert.ok(Math.abs(Math.hypot(s.x - a.x, s.y - a.y) - (a.d / 2 + 9)) < 1, `${l.id} leaves at the rim`);
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
  const hub = node(G, 'hub');
  assert.ok(hub.labelBadge, 'hub label is badged');
  const hubLabel = required(hub.labelRect, 'the hub label');
  for (const l of G.links) assert.equal(overlapArea(hubLabel, required(l.chipRect, `the chip of ${l.label}`)), 0, `hub label clear of chip ${l.label}`);
});

test('renders: wrapped chains read at full size, dark anchors stay visible, --strict writes nothing', async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await using tmp = await scratch('figure-review');
  const dir = tmp.path;
  const steps = ['Commit', 'Lint', 'Test', 'Build', 'Sign', 'Scan', 'Stage', 'Approve', 'Deploy', 'Verify'];
  const chain = parseFig(`title: Release\n${steps.join(' > ')}`);
  const res = await makeFigure({ spec: chain, browser, quiet: true, strict: true });
  assert.deepEqual(res.warnings, []);

  const darkSpec = { template: 'diagram', theme: 'dark', nodes: [{ id: 'a', role: 'anchor' }, { id: 'b' }], links: [{ from: 'a', to: 'b', color: 'accent' }] };
  const { buffer } = await makeFigure({ spec: darkSpec, browser, quiet: true });
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let bright = 0;
  for (let i = 0; i < data.length; i += info.channels) if (Math.min(...data.subarray(i, i + 3)) > 200) bright++;
  assert.ok(bright > 2000, 'paper ring and glyph show on the dark page');

  const out = path.join(dir, 'clash.png');
  const clash = { template: 'topology', layout: 'free', nodes: [{ id: 'a', at: [0.5, 0.5], labelPos: 'below' }, { id: 'b', at: [0.5, 0.5], labelPos: 'below' }] };
  await assert.rejects(() => makeFigure({ spec: clash, out, browser, quiet: true, strict: true }), /nothing written/);
  await assert.rejects(() => stat(out), /ENOENT/);
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
  const g = required(s.groups?.[0], 'the group');
  assert.equal(g.label, 'Servers');
  assert.deepEqual(s.links[1], { from: 'Mac', to: g.id, dir: 'both', label: 'user cert · host cert' });
});

test('fig: a group link fails clearly when the name is ambiguous', () => {
  assert.throws(() => parseFig('A > G\nG {\n  x\n}\nG {\n  y\n}'), /2 groups are labelled "G"/);
  assert.throws(() => parseFig('G\nA > G\nG {\n  x\n}'), /"G" is both a group and a node/);
});

test('normalize: group ends are checked like node ends', () => {
  const base: GraphSpec = { template: 'topology', nodes: [{ id: 'a' }, { id: 'b' }], groups: [{ id: 'G', label: 'G', nodes: ['b'] }] };
  const ok = normalize({ ...base, links: [{ from: 'a', to: 'G' }] });
  assert.deepEqual(ok.links.map((l) => [l.fromGroup, l.toGroup]), [[false, true]]);
  assert.throws(() => normalize({ ...base, links: [{ from: 'b', to: 'G' }] }), /"b" sits inside group "G"/);
  assert.throws(() => normalize({ ...base, links: [{ from: 'a', to: 'Gx' }] }), /no node or group "Gx" \(did you mean "G"\?\)/);
  const rev = normalize({ ...base, links: [{ from: 'a', to: 'G', dir: 'from' }] });
  assert.deepEqual(rev.links.map((l) => [l.from, l.fromGroup, l.to, l.toGroup]), [['G', true, 'a', false]]);
});

const bareMeasure = (G: Graph): void => {
  for (const n of G.nodes) { if (n.shape === 'circle') n.d = 150; n.labelSize = { w: 120, h: 40 }; }
  for (const l of G.links) if (l.label) l.chipSize = { w: 200, h: 44 };
};

test('ELK: a link to a group stops just outside its border, square to it', async () => {
  const G = normalize(parseFig(SERVERS));
  bareMeasure(G);
  await layoutElk(G, { top: 90, side: 34 });
  const link = required(G.links[1], 'link 1');
  const r = required(G.groupById.get(link.to)?.rect, 'the group rect');
  const pts = link.pts;
  const end = required(pts.at(-1), 'the last point'), prev = required(pts.at(-2), 'the point before it');
  assert.ok(Math.abs(end.x - (r.x - 9)) < 1, `ends 9px left of the border (${end.x} vs ${r.x - 9})`);
  assert.ok(end.y > r.y && end.y < r.y + r.h, 'meets the border along its side');
  assert.ok(Math.abs(prev.y - end.y) < 0.5, 'last segment is horizontal');
  for (const n of G.nodes.filter((x) => x.group)) {
    assert.ok(!pathHitsRect(pts, nodeRect(n)), `does not run into member ${n.id}`);
  }
});

test('fixed layouts: a link to a group ends at its border and labels clear it', async (t) => {
  const spec = parseFig(SERVERS);
  spec.layout = 'grid';
  const place = (id: string, at: [number, number]): void => { required(spec.nodes.find((n) => n.id === id), id).at = at; };
  place('Mac', [0, 1]);
  place('Vault', [0, 0]);
  place('web', [2, 0]);
  place('vps', [2, 1]);
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const { warnings, buffer } = await makeFigure({ spec, browser });
  assert.ok(buffer.length > 1000);
  assert.deepEqual(warnings, []);
});

test('group labels slide clear of a link crossing their top band', async () => {
  const G: LabelledGroups = {
    groups: [{ id: 'G', label: 'Homelab', rect: rect(0, 0, 600, 400) }],
    links: [{ pts: [{ x: 60, y: -100 }, { x: 60, y: 200 }] }],
  };
  placeGroupLabels(G, new Map([['G', { w: 120, h: 20 }]]), 1);
  const lr = required(G.groups[0]?.labelRect, 'the group label');
  assert.equal(G.groups[0]?.labelBadge, false);
  assert.ok(!pathHitsRect(required(G.links[0], 'link').pts, lr), 'label clears the line');
  assert.ok(lr.x > 60 && lr.x < 120, `moved just past the line (x=${lr.x})`);
  G.links.push({ pts: [{ x: -50, y: 30 }, { x: 650, y: 30 }] }); // a line along the whole band
  placeGroupLabels(G, new Map([['G', { w: 120, h: 20 }]]), 1);
  assert.equal(G.groups[0]?.labelBadge, true, 'no clear spot: badge it');
});

test('ELK: runs of two links that nearly meet on one track are nudged apart', async () => {
  const xOf = (l: { pts: Point[] }, i: number): number => required(l.pts[i], `point ${i}`).x;
  const { separateTouchingRuns } = await import('../src/lib/figure/graph/layout-elk.ts');
  const a = { from: 'p', to: 'q', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }] };
  const b = { from: 'r', to: 's', pts: [{ x: 0, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 220 }, { x: 300, y: 220 }] };
  const far = { from: 't', to: 'u', pts: [{ x: 0, y: 900 }, { x: 100, y: 900 }, { x: 100, y: 700 }, { x: 300, y: 700 }] };
  separateTouchingRuns([a, b, far]);
  assert.equal(xOf(a, 1), 100, 'the first link keeps its track');
  assert.notEqual(xOf(b, 1), 100, 'the second moves off it');
  assert.equal(xOf(b, 1), xOf(b, 2), 'and stays vertical');
  assert.equal(xOf(far, 1), 100, 'runs far apart are left alone');
  const fan1 = { from: 'hub', to: 'x', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: -200 }, { x: 300, y: -200 }] };
  const fan2 = { from: 'hub', to: 'y', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 300, y: 200 }] };
  separateTouchingRuns([fan1, fan2]);
  assert.equal(xOf(fan2, 1), 100, 'a fan-out keeps its shared trunk');
});

test('ELK: a short step before a link\'s end is straightened onto the run before it', async () => {
  const { straightenJogs } = await import('../src/lib/figure/graph/layout-elk.ts');
  const step = { pts: [{ x: 0, y: 163 }, { x: 340, y: 163 }, { x: 340, y: 170 }, { x: 490, y: 170 }] };
  const detour = { pts: [{ x: 0, y: 348 }, { x: 120, y: 348 }, { x: 120, y: 429 }, { x: 500, y: 429 }, { x: 500, y: 421 }, { x: 640, y: 421 }],
    chipRect: { x: 550, y: 409, w: 60, h: 24 } };
  const real = { pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 300, y: 80 }] };
  straightenJogs([step, detour, real]);
  assert.deepEqual(step.pts, [{ x: 0, y: 163 }, { x: 490, y: 163 }], 'one straight run');
  assert.deepEqual(detour.pts, [{ x: 0, y: 348 }, { x: 120, y: 348 }, { x: 120, y: 429 }, { x: 640, y: 429 }], 'the real bend stays, the step goes');
  assert.equal(detour.chipRect?.y, 417, 'a label on the moved run moves with it');
  assert.equal(real.pts.length, 4, 'a bend longer than the tolerance is kept');
});


test('star layout: a link that ends at a group border does not crash the slot math', () => {
  const G = normalize(parseFig('layout: star\nHub [anchor]\nA\nB\nCloud {\n  x\n  y\n}\nHub > Cloud\nHub > A\nHub > B'));
  bareMeasure(G);
  layoutGeo(G);
  assert.equal(node(G, 'Hub').pos, 'center');
  assert.ok(G.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('normalize: a skipped group entry does not shift the ones after it', () => {
  const spec: GraphSpec = {
    template: 'topology',
    nodes: [{ id: 'a' }, { id: 'b' }],
    groups: [
      { id: 'A', label: 'First', nodes: ['a'] },
      { id: 'A', label: 'Duplicate', nodes: ['a'] },
      { id: 'B', label: 'Second', nodes: ['missing'] },
    ],
  };
  assert.throws(() => normalize(spec), (e) => isSpecError(e, /duplicate group id "A"/)
    && isSpecError(e, /groups\[2\]\.nodes: no node "missing"/)
    && !isSpecError(e, /already in group/));
});

test('validation: classic template shapes are checked instead of crashing the renderer', () => {
  assert.throws(() => validateSpec({ template: 'flow', rows: [null] }), (e) => isSpecError(e, /spec\.rows: expected a list of rows/));
  assert.throws(() => validateSpec({ template: 'flow', rows: [{ steps: 'a > b' }] }), (e) => isSpecError(e, /spec\.rows/));
  assert.throws(() => validateSpec({ template: 'diamond', nodes: { top: 5 } }), (e) => isSpecError(e, /spec\.nodes: expected an object of top\/left\/right\/bottom labels/));
  assert.throws(() => validateSpec({ template: 'title', size: ['1200', '630'] }), (e) => isSpecError(e, /spec\.size: expected a preset/));
  assert.throws(() => validateSpec({ template: 'title', colors: { accent: 5 } }), (e) => isSpecError(e, /spec\.colors: expected an object of color strings/));
  assert.doesNotThrow(() => validateSpec({ template: 'flow', rows: [{ steps: ['a', 'b'], label: 'Row', anchor: 'a' }] }));
});

test('validation: inherited object keys are unknown keys, not validators', () => {
  assert.throws(() => validateSpec({ template: 'topology', toString: 1 }), (e) => isSpecError(e, /spec\.toString: unknown key/));
  assert.throws(() => validateSpec({ template: 'constructor' }), /Unknown figure template: "constructor"/);
});
