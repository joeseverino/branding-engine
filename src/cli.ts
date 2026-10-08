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
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { buildBrand, buildKit } from './build.ts';
import { errorMessage, parseJson } from './lib/guards.ts';
import { makeFigure } from './make-figure.ts';
import { isPictogramFiles, makePictogram, makePictograms } from './make-pictogram.ts';
import { generateSite, initSite } from './site.ts';

const OPTIONS = {
  config: { type: 'string' },
  public: { type: 'string' },
  out: { type: 'string' },
  only: { type: 'string' },
  font: { type: 'string' },
  tokens: { type: 'string' },
  scale: { type: 'string' },
  spec: { type: 'string' },
  text: { type: 'string' },
  logo: { type: 'string' },
  tint: { type: 'string' },
  name: { type: 'string' },
  size: { type: 'string' },
  fit: { type: 'string' },
  variants: { type: 'string' },
  strict: { type: 'boolean' },
  'circle-preview': { type: 'boolean' },
} as const satisfies ParseArgsOptionsConfig;

type Flags = ReturnType<typeof parseFlags>;

const NEGATIVE_NUMBER = /^-\.?\d/;

function parseFlags(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, allowNegative: true });
  } catch (error) {
    throw new Error(parseFailure(error, argv), { cause: error });
  }
}

function parseFailure(error: unknown, argv: readonly string[]): string {
  const message = errorMessage(error);
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  const flag = /'--([^'\s<]+)/.exec(message)?.[1];
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' && flag) {
    return `Unknown flag --${flag}. Run \`branding-engine --help\` for the flags.`;
  }
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && flag && !message.includes('does not take')) {
    const given = argv[argv.indexOf(`--${flag}`) + 1];
    if (given !== undefined && NEGATIVE_NUMBER.test(given)) return `--${flag} must be a positive number, got "${given}".`;
    return `--${flag} needs a value.`;
  }
  return message.split('\n')[0] ?? message;
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

function positive(values: Flags['values'], name: 'scale' | 'size' | 'fit'): number | undefined {
  const raw = values[name];
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
  if (cmd === undefined || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return;
  }
  const { values, positionals: pos } = parseFlags(rest);
  switch (cmd) {
    case 'init': {
      const { created, headSnippet } = initSite({});
      if (created.length) console.log('Created:\n' + created.map((c) => '  ' + c).join('\n'));
      console.log('\nNext: edit brand.config.json (accent, glyph, name), then run `npm run brand`.');
      console.log('\nAdd this to your site <head>:\n');
      console.log(headSnippet + '\n');
      return;
    }
    case 'generate': {
      const { written, publicDir, headSnippet } = await generateSite({ config: values.config, publicDir: values.public });
      console.log(`Wrote ${written.length} files to ${publicDir}:`);
      console.log(written.map((w) => '  ' + w).join('\n'));
      console.log('\n<head> snippet (theme-color reflects your accent):\n');
      console.log(headSnippet);
      return;
    }
    case 'build':
      await buildBrand({ config: values.config, outDir: values.out, only: values.only });
      return;
    case 'kit': {
      const [slug, hex, glyph, wordmark] = pos;
      if (!slug || !hex || !glyph) usageExit();
      await buildKit({ slug, hex, glyph, wordmark, font: values.font, outDir: values.out, only: values.only });
      return;
    }
    case 'figure': {
      const [specPath] = pos;
      if (!specPath) usageExit();
      await makeFigure({ specPath, out: values.out, tokensPath: values.tokens, scale: positive(values, 'scale'), strict: values.strict === true });
      return;
    }
    case 'pictogram':
      await pictogram(values, pos);
      return;
    default:
      usageExit();
  }
}

async function pictogram(values: Flags['values'], pos: readonly string[]): Promise<void> {
  const specFile = values.spec;
  const written = specFile
    ? await makePictograms({ spec: parseJson(readFileSync(specFile, 'utf8')), outDir: values.out, tokensPath: values.tokens })
    : [await pictogramFromFlags(values, pos)];
  for (const w of written) {
    for (const files of isPictogramFiles(w) ? [w] : Object.values(w)) {
      console.log(`wrote ${[files.svg, files.png, files.circle].filter(Boolean).join(' + ')}`);
    }
  }
}

async function pictogramFromFlags(values: Flags['values'], pos: readonly string[]): Promise<Awaited<ReturnType<typeof makePictogram>>> {
  const text = values.text;
  const logo = values.logo;
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
    tint: values.tint,
    name: values.name,
    outDir: values.out,
    size: positive(values, 'size'),
    fit: positive(values, 'fit'),
    variants: values.variants,
    circlePreview: values['circle-preview'],
    tokensPath: values.tokens,
  });
}

try {
  await run();
} catch (err) {
  console.error(`\n${errorMessage(err)}`);
  process.exit(1);
}
