// Render one figure spec (a small JSON file) to a PNG. The CLI entry point and a
// programmatic helper; the layout templates and the renderer live in
// lib/figure.mjs. Brand color comes from a tokens.css file (the `brand` tool
// passes the kit's), an inline `colors` block in the spec, or built-in defaults.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderFigure } from './lib/figure.mjs';
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
  return specPath.replace(/\.figure\.json$/i, '').replace(/\.json$/i, '') + '.png';
}

export async function makeFigure({ specPath, spec, out, tokens, tokensPath, scale, browser }) {
  const resolved = spec || JSON.parse(readFileSync(specPath, 'utf8'));
  const outPath = out || (specPath ? defaultOut(specPath) : undefined);
  const tok = tokens || readTokens(tokensPath);
  const render = (b) => renderFigure(b, resolved, { outPath, tokens: tok, scale: scale ? Number(scale) : 2 });
  const res = browser ? await render(browser) : await withBrowser(render);
  if (outPath) console.log(`  figure    ${path.basename(outPath)} (${res.width}×${res.height})`);
  return { ...res, outPath };
}
