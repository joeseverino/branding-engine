// Site plug-and-play. `initSite` scaffolds a flat brand config (and an npm
// script) into a project; `generateSite` reads it and writes a favicon set,
// web manifest, and CSS tokens into the project's public/ directory, at the
// root paths a static site (Astro, Eleventy, plain HTML) expects.
//
// This path is pure vector + sharp, so it needs no headless browser. The richer
// kit (wordmark lockups, social cards, brand sheet) comes from `build` / `kit`.
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { markSvg } from './lib/mark.mjs';
import { darken, normalizeHex } from './lib/color.mjs';
import { pngsToIco } from './lib/ico.mjs';

const DEFAULT_CONFIG = {
  name: 'My Site',
  accent: '#2563EB',
  glyph: 'MS',
  wordmark: 'My Site',
};

// The <head> block that wires the generated files. theme-color reflects accent.
function headSnippet(accent) {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any" />',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/site.webmanifest" />',
    `<meta name="theme-color" content="${accent}" />`,
  ].join('\n');
}

function loadConfig(configPath, cwd) {
  const file = configPath ? path.resolve(cwd, configPath) : path.join(cwd, 'brand.config.json');
  if (!existsSync(file)) {
    throw new Error(`No brand config at ${file}. Run \`branding-engine init\` first.`);
  }
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Scaffold brand.config.json (and a `brand` npm script) into a project. */
export function initSite({ cwd = process.cwd() } = {}) {
  const created = [];
  const cfgPath = path.join(cwd, 'brand.config.json');
  if (existsSync(cfgPath)) {
    console.log('brand.config.json already exists, leaving it untouched.');
  } else {
    writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    created.push('brand.config.json');
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts = pkg.scripts || {};
    if (!pkg.scripts.brand) {
      pkg.scripts.brand = 'branding-engine generate';
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      created.push('package.json ("brand" script)');
    }
  }
  return { created, headSnippet: headSnippet(DEFAULT_CONFIG.accent) };
}

/** Generate the favicon set, manifest, and CSS tokens into <publicDir>/. */
export async function generateSite({ config, publicDir = 'public', cwd = process.cwd() } = {}) {
  const cfg = loadConfig(config, cwd);
  const accent = normalizeHex(cfg.accent);
  const onAccent = cfg.onColor ? normalizeHex(cfg.onColor) : '#ffffff';
  const deep = cfg.deep ? normalizeHex(cfg.deep) : darken(accent);
  const glyph = cfg.glyph || 'JS';
  const name = cfg.name || 'Site';

  const pub = path.resolve(cwd, publicDir);
  mkdirSync(pub, { recursive: true });

  const rounded = markSvg({ size: 512, rounded: true, bg: accent, fg: onAccent, glyph });
  const square = markSvg({ size: 512, rounded: false, bg: accent, fg: onAccent, glyph });
  const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  const write = (name_, buf) => writeFileSync(path.join(pub, name_), buf);

  write('favicon.svg', markSvg({ size: 64, rounded: true, bg: accent, fg: onAccent, glyph }));
  write('favicon-32.png', await png(rounded, 32));
  write('favicon-192.png', await png(rounded, 192));
  write('apple-touch-icon.png', await png(square, 180));
  write('favicon.ico', pngsToIco([
    { size: 16, buffer: await png(rounded, 16) },
    { size: 32, buffer: await png(rounded, 32) },
  ]));
  write('site.webmanifest', JSON.stringify({
    name,
    short_name: glyph,
    icons: [
      { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    theme_color: accent,
    background_color: '#ffffff',
    display: 'standalone',
  }, null, 2) + '\n');
  write('brand-tokens.css',
    `:root {\n` +
    `  --brand-accent: ${accent};\n` +
    `  --brand-deep: ${deep};\n` +
    `  --brand-on-accent: ${onAccent};\n` +
    `  --brand-ink: #0b0620;\n` +
    `  --brand-paper: #ffffff;\n` +
    `}\n`);

  const written = [
    'favicon.svg', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png',
    'favicon.ico', 'site.webmanifest', 'brand-tokens.css',
  ];
  return { publicDir: pub, written, headSnippet: headSnippet(accent) };
}
