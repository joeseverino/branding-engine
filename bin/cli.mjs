#!/usr/bin/env node
// branding-engine CLI.
//   branding-engine init                              scaffold a site brand.config + npm script
//   branding-engine generate [--public <dir>] [--config <file>]   favicons + manifest + tokens -> public/
//   branding-engine build [--config <dir|brand.json>] [--out <dir>] [--only a,b]
//   branding-engine kit <slug> <hex> <glyph> ["Wordmark"] [--font f] [--out d] [--only a,b]
// Stages for --only: mark, wordmark, sheet, web, cards (mark includes favicons).
import { buildBrand, buildKit } from '../src/build.mjs';
import { generateSite, initSite } from '../src/site.mjs';

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
  '    <glyph> is 1-3 letters or digits, e.g. A, AC, or A3X.';

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opt } = parse(rest);

try {
  if (cmd === 'init') {
    const { created, headSnippet } = initSite({});
    if (created.length) console.log('Created:\n' + created.map((c) => '  ' + c).join('\n'));
    console.log('\nNext: edit brand.config.json (accent, glyph, name), then run `npm run brand`.');
    console.log('\nAdd this to your site <head> (or import public/brand-tokens.css for the CSS vars):\n');
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
  } else {
    console.error(USAGE);
    process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
