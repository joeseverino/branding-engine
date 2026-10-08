#!/usr/bin/env node
// branding-engine CLI.
//   branding-engine init                              scaffold a site brand.config + npm script
//   branding-engine generate [--public <dir>] [--config <file>]   favicons + manifest + tokens -> public/
//   branding-engine build [--config <dir|brand.json>] [--out <dir>] [--only a,b]
//   branding-engine kit <slug> <hex> <glyph> ["Wordmark"] [--font f] [--out d] [--only a,b]
//   branding-engine figure <spec.fig|spec.json> [--out <png>] [--tokens <tokens.css>] [--scale 2] [--strict]
//   branding-engine pictogram <glyph> <hex> [--name n] [--out <dir>] [--size 512]
//   branding-engine pictogram --spec <file.json> [--out <dir>]
// Stages for --only: mark, wordmark, sheet, web, cards (mark includes favicons).
import { readFileSync } from 'node:fs';
import { buildBrand, buildKit } from './build.ts';
import { errorMessage, parseJson } from './lib/guards.ts';
import { makeFigure } from './make-figure.ts';
import { isPictogramFiles, makePictogram, makePictograms } from './make-pictogram.ts';
import { generateSite, initSite } from './site.ts';

const BOOLEAN_FLAGS = new Set(['strict', 'circle-preview', 'no-circle-preview']);

interface Args {
  pos: string[];
  opt: Map<string, string | true>;
}

function parse(argv: readonly string[]): Args {
  const pos: string[] = [];
  const opt = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      opt.set(key, !BOOLEAN_FLAGS.has(key) && next && !next.startsWith('--') ? argv[++i] : true);
    } else {
      pos.push(a);
    }
  }
  return { pos, opt };
}

const USAGE =
  'Usage:\n' +
  '  branding-engine init                          scaffold brand.config.json + a `brand` npm script\n' +
  '  branding-engine generate [--public <dir>] [--config <file>]   favicons + manifest + tokens -> public/\n' +
  '  branding-engine build [--config <dir|brand.json>] [--out <dir>] [--only mark,wordmark,sheet,web,cards]\n' +
  '  branding-engine kit <slug> <hex> <glyph> ["Wordmark"] [--font <file>] [--out <dir>] [--only ...]\n' +
  '    <glyph> is 1-3 letters or digits, e.g. A, AC, or A3X.\n' +
  '  branding-engine figure <spec.fig|spec.json> [--out <png>] [--tokens <tokens.css>] [--scale 2] [--strict]\n' +
  '    .fig: the text diagram format (auto layout, groups). JSON templates: title, flow, diamond,\n' +
  '    nodes, topology (alias diagram). Defaults output to <spec>.png. Prints layout warnings;\n' +
  '    --strict fails on any.\n' +
  '  branding-engine pictogram <glyph> <color> [--name <n>] [--out <dir>] [--size 512] [--circle-preview]\n' +
  '  branding-engine pictogram --text <ABC> <color> [...same flags]\n' +
  '  branding-engine pictogram --logo <file.svg|png> <color> [--tint <color>] [--fit 0.62] [...same flags]\n' +
  '  branding-engine pictogram --spec <file.json> [--out <dir>] [--tokens <tokens.css>]\n' +
  '    a tile with a stroke glyph, 1-3 letters, or an arbitrary logo — app/vault icons, avatars.\n' +
  '    glyphs: the topology set (server, laptop, switch, router, cloud, …) plus home.\n' +
  '    <color> is hex or a token name (accent, deep, onAccent, ink, paper) via --tokens.\n' +
  '    --tint recolors monochrome SVG artwork. --variants light,dark renders the standard\n' +
  '    pair: colored art on paper (light) and white art on the color (dark).\n' +
  '    --circle-preview writes <name>-circle.png (crop check; default on for --logo).\n' +
  '    spec: an array of { glyph | text | logo, hex, name?, size?, fit?, tint?, variants?, circlePreview? }.';

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opt } = parse(rest);

/** The value of a flag that takes one. */
function value(name: string): string | undefined {
  const v = opt.get(name);
  if (v === true) throw new Error(`--${name} needs a value.`);
  return v;
}

function positive(name: string): number | undefined {
  const raw = value(name);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} must be a positive number, got "${raw}".`);
  return n;
}

function usageExit(): never {
  console.error(USAGE);
  process.exit(1);
}

async function run(): Promise<void> {
  switch (cmd) {
    case undefined:
    case '--help':
    case '-h':
      console.log(USAGE);
      return;
    case 'init': {
      const { created, headSnippet } = initSite({});
      if (created.length) console.log('Created:\n' + created.map((c) => '  ' + c).join('\n'));
      console.log('\nNext: edit brand.config.json (accent, glyph, name), then run `npm run brand`.');
      console.log('\nAdd this to your site <head>:\n');
      console.log(headSnippet + '\n');
      return;
    }
    case 'generate': {
      const { written, publicDir, headSnippet } = await generateSite({ config: value('config'), publicDir: value('public') });
      console.log(`Wrote ${written.length} files to ${publicDir}:`);
      console.log(written.map((w) => '  ' + w).join('\n'));
      console.log('\n<head> snippet (theme-color reflects your accent):\n');
      console.log(headSnippet);
      return;
    }
    case 'build':
      await buildBrand({ config: value('config'), outDir: value('out'), only: value('only') });
      return;
    case 'kit': {
      const [slug, hex, glyph, wordmark] = pos;
      if (!slug || !hex || !glyph) usageExit();
      await buildKit({ slug, hex, glyph, wordmark, font: value('font'), outDir: value('out'), only: value('only') });
      return;
    }
    case 'figure': {
      const [specPath] = pos;
      if (!specPath) usageExit();
      await makeFigure({ specPath, out: value('out'), tokensPath: value('tokens'), scale: positive('scale'), strict: opt.has('strict') });
      return;
    }
    case 'pictogram':
      await pictogram();
      return;
    default:
      usageExit();
  }
}

async function pictogram(): Promise<void> {
  const specFile = value('spec');
  const written = specFile
    ? await makePictograms({ spec: parseJson(readFileSync(specFile, 'utf8')), outDir: value('out'), tokensPath: value('tokens') })
    : [await pictogramFromFlags()];
  for (const w of written) {
    for (const files of isPictogramFiles(w) ? [w] : Object.values(w)) {
      console.log(`wrote ${[files.svg, files.png, files.circle].filter(Boolean).join(' + ')}`);
    }
  }
}

async function pictogramFromFlags(): Promise<Awaited<ReturnType<typeof makePictogram>>> {
  const text = value('text');
  const logo = value('logo');
  const external = logo || text;
  const [glyphPos, hexPos] = pos;
  const glyph = external ? undefined : glyphPos;
  const hex = external ? glyphPos : hexPos;
  if ((!glyph && !external) || !hex) usageExit();
  return makePictogram({
    glyph,
    text,
    logo,
    hex,
    tint: value('tint'),
    name: value('name'),
    outDir: value('out'),
    size: positive('size'),
    fit: positive('fit'),
    variants: value('variants'),
    circlePreview: opt.has('no-circle-preview') ? false : (opt.has('circle-preview') ? true : undefined),
    tokensPath: value('tokens'),
  });
}

try {
  await run();
} catch (err) {
  console.error(`\n${errorMessage(err)}`);
  process.exit(1);
}
