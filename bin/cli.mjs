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
  '  branding-engine pictogram <glyph> <hex> [--name <n>] [--out <dir>] [--size 512]\n' +
  '  branding-engine pictogram --spec <file.json> [--out <dir>]\n' +
  '    a rounded tile with a stroke glyph (svg + png) — app/vault icons, avatars.\n' +
  '    glyphs: the topology set (server, laptop, switch, router, cloud, …) plus home.\n' +
  '    spec: an array of { glyph, hex, name?, size? }.';

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
      written = await makePictograms({ spec, outDir: opt.out });
    } else {
      const [glyph, hex] = pos;
      if (!glyph || !hex) {
        console.error(USAGE);
        process.exit(1);
      }
      written = [await makePictogram({
        glyph,
        hex,
        name: opt.name,
        outDir: opt.out,
        size: opt.size ? Number(opt.size) : undefined,
      })];
    }
    for (const w of written) console.log(`wrote ${w.svg} + ${w.png}`);
  } else {
    console.error(USAGE);
    process.exit(1);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
