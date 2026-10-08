// Shared glyph-outline cache management. A cache is the JSON that
// extract-glyphs.ts writes: { font, unitsPerEm, weight, glyphs }. Both the mark
// (uppercase monogram at the brand weight) and the wordmark (mixed case at the
// lighter wordmark weight) sit on this, so extraction logic lives in one place.
//
// Two cache locations: the read-only set BUNDLED with this package (the default
// Inter, full alphabet: so the common case never writes),
// and a writable directory (BRAND_CACHE_DIR, else <cwd>/.brand-cache) used when a
// custom font or a missing glyph forces a fresh extraction. The package install
// itself is never written to.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractGlyphs, type Glyph, type GlyphSet } from './extract-glyphs.ts';
import { DEFAULT_FONT, fontPath } from './font.ts';
import { isFiniteNumber, isRecord, parseJson } from './guards.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_DIR = path.resolve(here, '..', '..', 'assets', 'glyphs');

function cacheDir(): string {
  return process.env.BRAND_CACHE_DIR || path.join(process.cwd(), '.brand-cache');
}

// Where loadGlyphs would read `file` from: the writable cache if present, else the
// bundled set. Custom fonts only ever land in the writable cache.
function resolveRead(file: string): string {
  const writable = path.join(cacheDir(), file);
  return existsSync(writable) ? writable : path.join(BUNDLED_DIR, file);
}

// The wordmark cache bundles the whole alphabet (both cases), digits, and space,
// so any name renders from the default-font cache without re-extracting: the
// same reason the mark cache bundles A-Z/0-9. Text-driven extraction would let a
// one-off ("kit chris-blake …") overwrite the shared set with just its own chars.
export const WORDMARK_CHARS: string =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';

function isGlyph(value: unknown): value is Glyph {
  return isRecord(value)
    && typeof value.path === 'string'
    && isFiniteNumber(value.advance)
    && isRecord(value.bounds)
    && [value.bounds.xMin, value.bounds.yMin, value.bounds.xMax, value.bounds.yMax].every(isFiniteNumber);
}

function isGlyphSet(value: unknown): value is GlyphSet {
  return isRecord(value)
    && typeof value.font === 'string'
    && isFiniteNumber(value.unitsPerEm)
    && isFiniteNumber(value.weight)
    && isRecord(value.glyphs)
    && Object.values(value.glyphs).every(isGlyph);
}

function readGlyphSet(file: string): GlyphSet {
  const parsed = parseJson(readFileSync(file, 'utf8'));
  if (!isGlyphSet(parsed)) {
    throw new Error(`${file} is not a glyph cache. Delete it so it is extracted again.`);
  }
  return parsed;
}

export interface CacheQuery {
  file: string;
  font?: string;
  weight?: number;
  chars: string;
}

// True when a readable cache covers this font, weight, and every character (a
// missing glyph or a font/weight change forces a re-extract).
function cacheCovers({ file, font, weight, chars }: CacheQuery): boolean {
  const p = resolveRead(file);
  if (!existsSync(p)) return false;
  try {
    const set = readGlyphSet(p);
    if (font && set.font !== path.basename(font)) return false;
    if (weight != null && set.weight !== weight) return false;
    return [...chars].every((ch) => Object.hasOwn(set.glyphs, ch));
  } catch {
    return false;
  }
}

export interface EnsureOptions {
  file: string;
  font?: string;
  weight: number;
  chars: string;
  label?: string;
}

// Extract `chars` from `font` at `weight` into the writable cache unless a
// readable cache already covers them.
export async function ensureGlyphs({ file, font = fontPath(), weight, chars, label = file }: EnsureOptions): Promise<void> {
  if (cacheCovers({ file, font, weight, chars })) return;
  const dir = cacheDir();
  const out = path.join(dir, file);
  const charset = [...new Set(chars)].join('');
  mkdirSync(dir, { recursive: true });
  console.log(`Extracting ${label} "${charset}" @ ${weight} from ${path.basename(font)}`);
  await extractGlyphs({ chars: charset, weight, fontPath: font, outPath: out });
}

const loaded = new Map<string, { stamp: string; set: GlyphSet }>();

// The cache is parsed once per file version: it is re-read when the file under
// that path is rewritten (a new font or weight), so a long-lived process never
// renders from outlines that were since replaced.
export function loadGlyphs(file: string): GlyphSet {
  const p = resolveRead(file);
  const { mtimeMs, size } = statSync(p);
  const stamp = `${mtimeMs}:${size}`;
  const hit = loaded.get(p);
  if (hit?.stamp === stamp) return hit.set;
  const set = readGlyphSet(p);
  loaded.set(p, { stamp, set });
  return set;
}

// The wordmark's outline cache filename. Defaults to wordmark-glyphs.json (the
// bundled Inter set); a one-off in a custom font gets its own file so Inter's
// cache is never clobbered. Both the extractor and the renderer call this so they
// always agree on the filename.
export function wordmarkGlyphFile(): string {
  if (process.env.BRAND_WORDMARK_GLYPHS) return process.env.BRAND_WORDMARK_GLYPHS;
  const f = process.env.BRAND_FONT;
  if (f && path.basename(f) !== path.basename(DEFAULT_FONT)) {
    return `${path.basename(f).replace(/\.[^.]+$/, '')}-wordmark-glyphs.json`;
  }
  return 'wordmark-glyphs.json';
}
