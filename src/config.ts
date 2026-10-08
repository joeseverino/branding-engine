// Brand config (brand.json plus an optional surfaces.json), validated up front
// so a bad file reports every problem at once.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { errorMessage, isFiniteNumber, isRecord, parseJson, type JsonObject } from './lib/guards.ts';
import type { CardSpec } from './make-cards.ts';

export type { CardSpec };

export interface Identity {
  slug: string;
  /** Six-digit accent color. */
  color: string;
  /** One to three alphanumeric mark characters. */
  glyph: string;
  /** Text for wordmark lockups and the sheet title. */
  wordmark?: string;
  /** Curated dark shade. */
  deep?: string;
  /** Glyph color on the accent. */
  onColor?: string;
}

/** An additional kit; it inherits the primary glyph unless it sets its own. */
export interface Surface {
  color: string;
  glyph?: string;
  wordmark?: string;
  deep?: string;
  onColor?: string;
}

export interface CardPalette {
  accent: string;
  textSoft: string;
  textMuted: string;
}

export interface BrandConfig {
  name?: string;
  /** Font path, relative to the config's directory. */
  font?: string;
  weight?: number;
  wordmarkWeight?: number;
  identity: Identity;
  /** Inline surfaces; a surfaces.json beside the config takes precedence. */
  surfaces?: Record<string, Surface>;
  /** JPEG path, relative to the config's directory. */
  portrait?: string;
  cardPalette?: CardPalette;
  cards?: CardSpec[];
}

export interface LoadedConfig {
  brand: BrandConfig;
  surfaces: Record<string, Surface>;
  /** Directory the config's relative paths resolve against. */
  brandDir: string;
}

class Problems {
  readonly list: string[] = [];

  add(message: string): void {
    this.list.push(message);
  }

  string(obj: JsonObject, key: string, where: string, required: boolean): string | undefined {
    const value = obj[key];
    if (typeof value === 'string' && value !== '') return value;
    if (value !== undefined || required) this.add(`${where}.${key}: expected ${required ? 'a' : 'a non-empty'} string`);
    return undefined;
  }

  text(obj: JsonObject, key: string, where: string): string | undefined {
    const value = obj[key];
    if (value === undefined || typeof value === 'string') return value;
    this.add(`${where}.${key}: expected a string`);
    return undefined;
  }

  positive(obj: JsonObject, key: string, where: string): number | undefined {
    const value = obj[key];
    if (value === undefined) return undefined;
    if (isFiniteNumber(value) && value > 0) return value;
    this.add(`${where}.${key}: expected a positive number`);
    return undefined;
  }

  object(value: unknown, where: string): JsonObject | undefined {
    if (isRecord(value)) return value;
    this.add(`${where}: expected an object`);
    return undefined;
  }
}

function readSurface(raw: unknown, where: string, p: Problems): Surface | undefined {
  const o = p.object(raw, where);
  if (!o) return undefined;
  const color = p.string(o, 'color', where, true);
  const surface: Surface = { color: color ?? '' };
  for (const key of ['glyph', 'wordmark', 'deep', 'onColor'] as const) {
    const value = p.text(o, key, where);
    if (value !== undefined) surface[key] = value;
  }
  return surface;
}

function readCard(raw: unknown, where: string, p: Problems): CardSpec | undefined {
  const o = p.object(raw, where);
  if (!o) return undefined;
  const card: CardSpec = {
    file: p.string(o, 'file', where, true) ?? '',
    width: p.positive(o, 'width', where) ?? 0,
    height: p.positive(o, 'height', where) ?? 0,
    photoWidth: p.positive(o, 'photoWidth', where) ?? 0,
  };
  for (const key of ['width', 'height', 'photoWidth'] as const) {
    if (o[key] === undefined) p.add(`${where}.${key}: expected a positive number`);
  }
  for (const key of ['eyebrow', 'name', 'tagline', 'meta', 'url'] as const) {
    const value = p.text(o, key, where);
    if (value !== undefined) card[key] = value;
  }
  return card;
}

/** `source` names where the config came from, for error messages. */
function parseBrandConfig(raw: unknown, source: string): BrandConfig {
  const p = new Problems();
  const root = p.object(raw, 'config');
  if (!root) throw new Error(`Invalid brand config (${source}):\n  - ${p.list.join('\n  - ')}`);

  const identityRaw = p.object(root.identity, 'identity');
  const identity: Identity = { slug: '', color: '', glyph: '' };
  if (identityRaw) {
    identity.slug = p.string(identityRaw, 'slug', 'identity', true) ?? '';
    identity.color = p.string(identityRaw, 'color', 'identity', true) ?? '';
    identity.glyph = p.string(identityRaw, 'glyph', 'identity', true) ?? '';
    for (const key of ['wordmark', 'deep', 'onColor'] as const) {
      const value = p.text(identityRaw, key, 'identity');
      if (value !== undefined) identity[key] = value;
    }
  }

  const config: BrandConfig = { identity };
  const name = p.text(root, 'name', 'config');
  if (name !== undefined) config.name = name;
  const font = p.text(root, 'font', 'config');
  if (font !== undefined) config.font = font;
  const portrait = p.text(root, 'portrait', 'config');
  if (portrait !== undefined) config.portrait = portrait;
  const weight = p.positive(root, 'weight', 'config');
  if (weight !== undefined) config.weight = weight;
  const wordmarkWeight = p.positive(root, 'wordmarkWeight', 'config');
  if (wordmarkWeight !== undefined) config.wordmarkWeight = wordmarkWeight;

  if (root.surfaces !== undefined) config.surfaces = readSurfaces(root.surfaces, 'surfaces', p);

  if (root.cardPalette !== undefined) {
    const o = p.object(root.cardPalette, 'cardPalette');
    if (o) {
      config.cardPalette = {
        accent: p.string(o, 'accent', 'cardPalette', true) ?? '',
        textSoft: p.string(o, 'textSoft', 'cardPalette', true) ?? '',
        textMuted: p.string(o, 'textMuted', 'cardPalette', true) ?? '',
      };
    }
  }

  if (root.cards !== undefined) {
    if (Array.isArray(root.cards)) {
      config.cards = root.cards.flatMap((card, i) => {
        const read = readCard(card, `cards[${i}]`, p);
        return read ? [read] : [];
      });
    } else {
      p.add('cards: expected a list of card definitions');
    }
  }

  if (p.list.length) throw new Error(`Invalid brand config (${source}):\n  - ${p.list.join('\n  - ')}`);
  return config;
}

function readSurfaces(raw: unknown, where: string, p: Problems): Record<string, Surface> {
  const surfaces: Record<string, Surface> = {};
  const o = p.object(raw, where);
  for (const [slug, entry] of Object.entries(o ?? {})) {
    const surface = readSurface(entry, `${where}.${slug}`, p);
    if (surface) surfaces[slug] = surface;
  }
  return surfaces;
}

function readJson(file: string, what: string): unknown {
  if (!existsSync(file)) throw new Error(`No ${what} at ${file}.`);
  try {
    return parseJson(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${file}: ${errorMessage(error)}`, { cause: error });
  }
}

function rejectSlugClash(brand: BrandConfig, surfaces: Record<string, Surface>, source: string): void {
  if (Object.hasOwn(surfaces, brand.identity.slug)) {
    throw new Error(`Invalid brand config (${source}):\n  - surface "${brand.identity.slug}" has the same slug as identity.slug, so the two kits would overwrite each other`);
  }
}

/** Resolve a config: an object, a brand.json path, or a directory holding one. */
export function loadConfig(config?: string | BrandConfig): LoadedConfig {
  if (config && typeof config === 'object') {
    const brand = parseBrandConfig(config, 'config object');
    const surfaces = brand.surfaces ?? {};
    rejectSlugClash(brand, surfaces, 'config object');
    return { brand, surfaces, brandDir: process.cwd() };
  }
  let file = config || process.cwd();
  let dir: string;
  if (existsSync(file) && !file.endsWith('.json')) {
    dir = path.resolve(file);
    file = path.join(dir, 'brand.json');
  } else {
    file = path.resolve(file);
    dir = path.dirname(file);
  }
  const brand = parseBrandConfig(readJson(file, 'brand config'), file);
  const surfacesFile = path.join(dir, 'surfaces.json');
  const surfaces = existsSync(surfacesFile)
    ? parseSurfacesFile(readJson(surfacesFile, 'surfaces file'), surfacesFile)
    : brand.surfaces ?? {};
  rejectSlugClash(brand, surfaces, file);
  return { brand, surfaces, brandDir: dir };
}

function parseSurfacesFile(raw: unknown, source: string): Record<string, Surface> {
  const p = new Problems();
  const surfaces = readSurfaces(raw, 'surfaces', p);
  if (p.list.length) throw new Error(`Invalid surfaces file (${source}):\n  - ${p.list.join('\n  - ')}`);
  return surfaces;
}
