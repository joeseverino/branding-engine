// Site plug-and-play. `initSite` scaffolds a flat brand config (and an npm
// script) into a project; `generateSite` reads it and writes a favicon set,
// web manifest, and CSS tokens into the project's public/ directory, at the
// root paths a static site (Astro, Eleventy, plain HTML) expects.
//
// This path is pure vector + sharp, so it needs no headless browser. The richer
// kit (wordmark lockups, social cards, brand sheet) comes from `build` / `kit`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { darken, normalizeHex } from './lib/color.ts';
import { isRecord, parseJson } from './lib/guards.ts';
import { normalizeGlyph } from './lib/identity.ts';
import { renderMarkSet } from './render-mark-set.ts';

/** The flat brand.config.json that `init` scaffolds and `generate` reads. */
export interface SiteConfig {
  name?: string;
  accent: string;
  glyph?: string;
  wordmark?: string;
  /** Glyph color on the accent. */
  onColor?: string;
  /** Curated dark shade. */
  deep?: string;
}

const DEFAULT_CONFIG: Required<Pick<SiteConfig, 'name' | 'accent' | 'glyph' | 'wordmark'>> = {
  name: 'My Site',
  accent: '#2563EB',
  glyph: 'MS',
  wordmark: 'My Site',
};

// The <head> block that wires the generated files. theme-color reflects accent.
function headSnippet(accent: string): string {
  return [
    '<link rel="icon" href="/favicon.ico" sizes="any" />',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="manifest" href="/site.webmanifest" />',
    '<link rel="stylesheet" href="/brand-tokens.css" />',
    `<meta name="theme-color" content="${accent}" />`,
  ].join('\n');
}

function loadConfig(configPath: string | undefined, cwd: string): SiteConfig {
  const file = configPath ? path.resolve(cwd, configPath) : path.join(cwd, 'brand.config.json');
  if (!existsSync(file)) {
    throw new Error(`No brand config at ${file}. Run \`branding-engine init\` first.`);
  }
  const raw = parseJson(readFileSync(file, 'utf8'));
  if (!isRecord(raw) || typeof raw.accent !== 'string') {
    throw new Error(`${file} must be an object with an "accent" color, e.g. { "accent": "#2563EB" }.`);
  }
  const config: SiteConfig = { accent: raw.accent };
  for (const key of ['name', 'glyph', 'wordmark', 'onColor', 'deep'] as const) {
    const value = raw[key];
    if (typeof value === 'string') config[key] = value;
    else if (value !== undefined) throw new Error(`${file}: "${key}" must be a string.`);
  }
  return config;
}

export interface InitResult {
  /** Files and scripts this run added. */
  created: string[];
  headSnippet: string;
}

/** Scaffold brand.config.json (and a `brand` npm script) into a project. */
export function initSite({ cwd = process.cwd() }: { cwd?: string } = {}): InitResult {
  const created: string[] = [];
  const cfgPath = path.join(cwd, 'brand.config.json');
  if (existsSync(cfgPath)) {
    console.log('brand.config.json already exists, leaving it untouched.');
  } else {
    writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    created.push('brand.config.json');
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = parseJson(readFileSync(pkgPath, 'utf8'));
    if (!isRecord(pkg)) throw new Error(`${pkgPath} must contain a JSON object.`);
    const scripts = isRecord(pkg.scripts) ? pkg.scripts : {};
    if (!scripts.brand) {
      pkg.scripts = { ...scripts, brand: 'branding-engine generate' };
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      created.push('package.json ("brand" script)');
    }
  }
  return { created, headSnippet: headSnippet(DEFAULT_CONFIG.accent) };
}

/** Generate the favicon set, manifest, and CSS tokens into <publicDir>/. */
export interface GenerateOptions {
  /** Config file, relative to `cwd`; defaults to brand.config.json. */
  config?: string;
  publicDir?: string;
  cwd?: string;
}

export interface GenerateResult {
  /** Absolute path of the directory written to. */
  publicDir: string;
  written: string[];
  headSnippet: string;
}

export async function generateSite({ config, publicDir = 'public', cwd = process.cwd() }: GenerateOptions = {}): Promise<GenerateResult> {
  const cfg = loadConfig(config, cwd);
  const accent = normalizeHex(cfg.accent);
  const onAccent = cfg.onColor ? normalizeHex(cfg.onColor) : '#ffffff';
  const deep = cfg.deep ? normalizeHex(cfg.deep) : darken(accent);
  const glyph = normalizeGlyph(cfg.glyph || 'JS');
  const name = cfg.name || 'Site';

  const pub = path.resolve(cwd, publicDir);
  mkdirSync(pub, { recursive: true });

  const rendered = await renderMarkSet({ hex: accent, onColor: onAccent, glyph });
  const write = (file: string, content: string | Buffer): void => writeFileSync(path.join(pub, file), content);

  write('favicon.svg', rendered.faviconSvg);
  write('favicon-32.png', rendered.favicon32);
  write('favicon-192.png', rendered.favicon192);
  write('apple-touch-icon.png', rendered.appleTouchIcon);
  write('favicon.ico', rendered.faviconIco);
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
