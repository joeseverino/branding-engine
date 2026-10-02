// Render one figure spec (a .fig text file or a JSON file) to a PNG. The CLI
// entry point and a programmatic helper; the templates and the renderer live in
// lib/figure/. Brand color comes from a tokens.css file (the `brand` tool
// passes the kit's), an inline `colors` block in the spec, or built-in defaults.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseFig, renderFigure } from './lib/figure.mjs';
import { withBrowser } from './lib/render.mjs';

// Pull the brand-* custom properties the palette uses out of a tokens.css.
export function readTokens(cssPath) {
  if (!cssPath) return {};
  const css = readFileSync(cssPath, 'utf8');
  const get = (name) => (css.match(new RegExp(`--brand-${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`, 'i')) || [])[1];
  const out = {};
  for (const [k, v] of [['accent', get('accent')], ['deep', get('deep')], ['onAccent', get('on-accent')], ['ink', get('ink')], ['paper', get('paper')]]) {
    if (v) out[k] = v;
  }
  return out;
}

// Default output path: the spec file with a .png extension.
function defaultOut(specPath) {
  return specPath.replace(/\.figure\.json$/i, '').replace(/\.(json|fig)$/i, '') + '.png';
}

// A spec file: `.fig` is the text format, anything else is JSON.
export function readSpec(specPath) {
  const text = readFileSync(specPath, 'utf8');
  return /\.fig$/i.test(specPath) ? parseFig(text) : JSON.parse(text);
}

export async function makeFigure({ specPath, spec, out, tokens, tokensPath, scale, browser, strict = false, quiet = false }) {
  const resolved = spec || readSpec(specPath);
  const outPath = out || (specPath ? defaultOut(specPath) : undefined);
  const tok = tokens || readTokens(tokensPath);
  const render = (b) => renderFigure(b, resolved, { outPath, tokens: tok, scale: scale ? Number(scale) : 2 });
  const res = browser ? await render(browser) : await withBrowser(render);
  if (!quiet) {
    for (const w of res.warnings) console.warn(`  warn      ${w}`);
    if (outPath) console.log(`  figure    ${path.basename(outPath)} (${res.width}×${res.height})`);
  }
  if (strict && res.warnings.length) {
    throw new Error(`${res.warnings.length} figure warning(s) with --strict:\n${res.warnings.map((w) => `  - ${w}`).join('\n')}`);
  }
  return { ...res, outPath };
}
