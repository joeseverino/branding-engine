#!/usr/bin/env node
// branding-engine CLI.
//   branding-engine init                              scaffold a site brand.config + npm script
//   branding-engine generate [--public <dir>] [--config <file>]   favicons + manifest + tokens -> public/
//   branding-engine build [--config <dir|brand.json>] [--out <dir>] [--only a,b]
//   branding-engine kit <slug> <hex> <glyph> ["Wordmark"] [--font f] [--out d] [--only a,b]
//   branding-engine figure <spec.json> [--out <png>] [--tokens <tokens.css>] [--scale 2]
//   branding-engine pictogram <glyph> <hex> [--name n] [--out <dir>] [--size 512]
//   branding-engine pictogram --spec <file.json> [--out <dir>]
// Stages for --only: mark, wordmark, sheet, web, cards (mark includes favicons).
import fs from 'node:fs';
import { buildBrand, buildKit } from '../src/build.mjs';
import { generateSite, initSite } from '../src/site.mjs';
import { makeFigure } from '../src/make-figure.mjs';
import { makePictogram, makePictograms } from '../src/make-pictogram.mjs';

function parse(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      opt[key] = next && !next.startsWith('--') ? argv[++i] : true;
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
  '  branding-engine figure <spec.json> [--out <png>] [--tokens <tokens.css>] [--scale 2]\n' +
  '    templates: title, flow, diamond, nodes. Defaults output to <spec>.png.\n' +
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

try {
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
  } else if (cmd === 'init') {
    const { created, headSnippet } = initSite({});
    if (created.length) console.log('Created:\n' + created.map((c) => '  ' + c).join('\n'));
    console.log('\nNext: edit brand.config.json (accent, glyph, name), then run `npm run brand`.');
    console.log('\nAdd this to your site <head>:\n');
    console.log(headSnippet + '\n');
  } else if (cmd === 'generate') {
    const { written, publicDir, headSnippet } = await generateSite({ config: opt.config, publicDir: opt.public });
    console.log(`Wrote ${written.length} files to ${publicDir}:`);
    console.log(written.map((w) => '  ' + w).join('\n'));
    console.log('\n<head> snippet (theme-color reflects your accent):\n');
    console.log(headSnippet);
  } else if (cmd === 'build') {
    await buildBrand({ config: opt.config, outDir: opt.out, only: opt.only });
  } else if (cmd === 'kit') {
    const [slug, hex, glyph, wordmark] = pos;
    if (!slug || !hex || !glyph) {
      console.error(USAGE);
      process.exit(1);
    }
    await buildKit({ slug, hex, glyph, wordmark, font: opt.font, outDir: opt.out, only: opt.only });
  } else if (cmd === 'figure') {
    const [specPath] = pos;
    if (!specPath) {
      console.error(USAGE);
      process.exit(1);
    }
    await makeFigure({ specPath, out: opt.out, tokensPath: opt.tokens, scale: opt.scale });
  } else if (cmd === 'pictogram') {
    let written;
    if (opt.spec) {
      const spec = JSON.parse(fs.readFileSync(opt.spec, 'utf8'));
      written = await makePictograms({ spec, outDir: opt.out, tokensPath: opt.tokens });
    } else {
      const external = opt.logo || opt.text;
      const [glyphPos, hexPos] = pos;
      const glyph = external ? undefined : glyphPos;
      const hex = external ? glyphPos : hexPos;
      if ((!glyph && !external) || !hex) {
        console.error(USAGE);
        process.exit(1);
      }
      written = [await makePictogram({
        glyph,
        text: opt.text,
        logo: opt.logo,
        hex,
        tint: opt.tint,
        name: opt.name,
        outDir: opt.out,
        size: opt.size ? Number(opt.size) : undefined,
        fit: opt.fit ? Number(opt.fit) : undefined,
        variants: opt.variants,
        circlePreview: opt['no-circle-preview'] ? false : (opt['circle-preview'] ? true : undefined),
        tokensPath: opt.tokens,
      })];
    }
    const flat = written.flatMap((w) => (w.png ? [w] : Object.values(w)));
    for (const w of flat) {
      console.log(`wrote ${[w.svg, w.png, w.circle].filter(Boolean).join(' + ')}`);
    }
  } else {
    console.error(USAGE);
    process.exit(1);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
