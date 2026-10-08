// Render one figure spec (a .fig text file or a JSON file) to a PNG. The CLI
// entry point and a programmatic helper; the templates and the renderer live in
// lib/figure/. Brand color comes from a tokens.css file (the `brand` tool
// passes the kit's), an inline `colors` block in the spec, or built-in defaults.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import path from 'node:path';
import { parseJson } from './lib/guards.ts';
import { parseFig, renderFigure, type FigureRender, type Tokens } from './lib/figure/index.ts';
import { withBrowser, type Browser } from './lib/render.ts';

// Pull the brand-* custom properties the palette uses out of a tokens.css.
export function readTokens(cssPath?: string): Tokens {
  if (!cssPath) return {};
  const css = readFileSync(cssPath, 'utf8');
  const get = (name: string): string | undefined => css.match(new RegExp(`--brand-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'i'))?.[1];
  const out: Tokens = {};
  const accent = get('accent'), deep = get('deep'), onAccent = get('on-accent'), ink = get('ink'), paper = get('paper');
  if (accent) out.accent = accent;
  if (deep) out.deep = deep;
  if (onAccent) out.onAccent = onAccent;
  if (ink) out.ink = ink;
  if (paper) out.paper = paper;
  return out;
}

// Default output path: the spec file with a .png extension.
function defaultOut(specPath: string): string {
  return specPath.replace(/\.figure\.json$/i, '').replace(/\.(json|fig)$/i, '') + '.png';
}

// A spec file: `.fig` is the text format, anything else is JSON.
export function readSpec(specPath: string): unknown {
  const text = readFileSync(specPath, 'utf8');
  return /\.fig$/i.test(specPath) ? parseFig(text) : parseJson(text);
}

export interface MakeFigureOptions {
  /** A `.fig` or JSON spec file; also names the default output. */
  specPath?: string;
  /** A spec object, used instead of reading `specPath`. */
  spec?: unknown;
  /** PNG path; defaults to the spec file with a .png extension. */
  out?: string;
  tokens?: Tokens;
  tokensPath?: string;
  /** Device scale factor (default 2). */
  scale?: number;
  /** Reuse a caller-owned browser; one is launched and closed otherwise. */
  browser?: Browser;
  /** Fail on any layout warning and write nothing. */
  strict?: boolean;
  quiet?: boolean;
}

export async function makeFigure({ specPath, spec, out, tokens, tokensPath, scale, browser, strict = false, quiet = false }: MakeFigureOptions): Promise<FigureRender & { outPath: string | undefined }> {
  if (spec === undefined && specPath === undefined) throw new Error('makeFigure needs a spec or a specPath.');
  const resolved = spec ?? (specPath === undefined ? undefined : readSpec(specPath));
  const outPath = out || (specPath ? defaultOut(specPath) : undefined);
  const tok = tokens || readTokens(tokensPath);
  // Render to a buffer and write only once the strict check has passed, so a
  // figure that failed review never lands on disk.
  const render = (b: Browser): Promise<FigureRender> => renderFigure(b, resolved, { tokens: tok, scale: scale || 2 });
  const res = browser ? await render(browser) : await withBrowser(render);
  if (!quiet) for (const w of res.warnings) console.warn(`  warn      ${w}`);
  if (strict && res.warnings.length) {
    throw new Error(`${res.warnings.length} figure warning(s) with --strict; nothing written:\n${res.warnings.map((w) => `  - ${w}`).join('\n')}`);
  }
  if (outPath) {
    await sharp(res.buffer).png().toFile(outPath);
    if (!quiet) console.log(`  figure    ${path.basename(outPath)} (${res.width}×${res.height})`);
  }
  return { ...res, outPath };
}
