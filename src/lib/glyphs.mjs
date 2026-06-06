// Shared glyph-outline cache management. A cache is the JSON that
// extract-glyphs.py writes: { font, unitsPerEm, weight, glyphs }. Both the mark
// (uppercase monogram at the brand weight) and the wordmark (mixed case at the
// lighter wordmark weight) sit on this, so extraction logic lives in one place.
//
// Two cache locations: the read-only set BUNDLED with this package (the default
// Inter, full alphabet: so the common case needs no python and never writes),
// and a writable directory (BRAND_CACHE_DIR, else <cwd>/.brand-cache) used when a
// custom font or a missing glyph forces a fresh extraction. The package install
// itself is never written to.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FONT, fontPath } from './font.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DIR = path.resolve(here, '..', '..', 'assets', 'glyphs');

function cacheDir() {
  return process.env.BRAND_CACHE_DIR || path.join(process.cwd(), '.brand-cache');
}

// Where loadGlyphs would read `file` from: the writable cache if present, else the
// bundled set. Custom fonts only ever land in the writable cache.
function resolveRead(file) {
  const writable = path.join(cacheDir(), file);
  return existsSync(writable) ? writable : path.join(BUNDLED_DIR, file);
}

// The wordmark cache bundles the whole alphabet (both cases), digits, and space,
// so any name renders from the default-font cache without re-extracting: the
// same reason the mark cache bundles A-Z/0-9. Text-driven extraction would let a
// one-off ("kit chris-blake …") overwrite the shared set with just its own chars.
export const WORDMARK_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';

// True when a readable cache covers this font, weight, and every character (a
// missing glyph or a font/weight change forces a re-extract).
export function cacheCovers({ file, font, weight, chars }) {
  const p = resolveRead(file);
  if (!existsSync(p)) return false;
  try {
    const g = JSON.parse(readFileSync(p, 'utf8'));
    if (font && g.font !== path.basename(font)) return false;
    if (weight != null && Number(g.weight) !== Number(weight)) return false;
    return [...chars].every((ch) => g.glyphs && g.glyphs[ch]);
  } catch {
    return false;
  }
}

// Extract `chars` from `font` at `weight` into the writable cache unless a
// readable cache already covers them. Throws (with an actionable message) only if
// extraction is actually needed and python3/fonttools is missing.
export function ensureGlyphs({ file, font = fontPath(), weight, chars, label = file }) {
  if (cacheCovers({ file, font, weight, chars })) return;
  const dir = cacheDir();
  const out = path.join(dir, file);
  const charset = [...new Set([...chars])].join('');
  mkdirSync(dir, { recursive: true });
  console.log(`Extracting ${label} "${charset}" @ ${weight} from ${path.basename(font)}`);
  try {
    execFileSync(
      'python3',
      [path.resolve(here, 'extract-glyphs.py'), charset, String(weight), font, out],
      { stdio: 'inherit' },
    );
  } catch {
    throw new Error(
      `Could not extract glyphs into ${out}. A custom font or new glyph needs ` +
        `python3 + fonttools (pip install -r requirements.txt). The bundled Inter ` +
        `needs none of this.`,
    );
  }
}

export function loadGlyphs(file) {
  return JSON.parse(readFileSync(resolveRead(file), 'utf8'));
}

// The wordmark's outline cache filename. Defaults to wordmark-glyphs.json (the
// bundled Inter set); a one-off in a custom font gets its own file so Inter's
// cache is never clobbered. Both the extractor and the renderer call this so they
// always agree on the filename.
export function wordmarkGlyphFile() {
  if (process.env.BRAND_WORDMARK_GLYPHS) return process.env.BRAND_WORDMARK_GLYPHS;
  const f = process.env.BRAND_FONT;
  if (f && path.basename(f) !== path.basename(DEFAULT_FONT)) {
    return `${path.basename(f).replace(/\.[^.]+$/, '')}-wordmark-glyphs.json`;
  }
  return 'wordmark-glyphs.json';
}
