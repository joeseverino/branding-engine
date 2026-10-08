// Designed-graphic renderer: brand-themed covers and figures for writeups,
// READMEs, and social/OG cards, driven by a small JSON (or .fig) spec.
//
// Classic templates (title, flow, diamond, nodes) draw a fixed W×H canvas.
// The graph template (topology, alias diagram) measures its text in the page
// first, lays out (ELK or fixed geometry), places labels, fits the drawing to
// the canvas, and reports anything a reviewer would catch by eye as warnings.
import { Buffer } from 'node:buffer';
import sharp from 'sharp';
import { fontFaceCss, type Browser, type Page } from '../render.ts';
import { tplDiamond, tplFlow, tplNodes, tplTitle } from './classic.ts';
import { renderGraph, type Measure } from './graph/index.ts';
import { graphLayout, isRadial } from './graph/normalize.ts';
import { palette, resolveSize, SIZES, type Dimensions, type Palette, type Tokens } from './palette.ts';
import { validateSpec } from './schema.ts';
import type { FigureSpec, GraphSpec } from './spec.ts';

export { palette, resolveSize, SIZES };
export { parseFig } from './dsl.ts';
export { FigureSpecError } from './schema.ts';
export type { FigureSpec, GraphSpec } from './spec.ts';
export type { Dimensions, Palette, Tokens } from './palette.ts';

const GRAPH = 'graph';
export const TEMPLATES = {
  title: tplTitle, flow: tplFlow, diamond: tplDiamond, nodes: tplNodes, topology: GRAPH, diagram: GRAPH,
} as const;

const isGraph = (spec: FigureSpec): spec is GraphSpec => TEMPLATES[spec.template] === GRAPH;

// Canvas size for a spec. Classic templates default to the 16:9 cover and
// radial graphs (star, ring) to the 3:2 `topo` frame; any other graph with no
// `size` is sized to its content and returns null.
export function figureSize(spec: FigureSpec): Dimensions | null {
  if (spec.size != null) return resolveSize(spec.size);
  if (!isGraph(spec)) return resolveSize('cover');
  return isRadial(graphLayout(spec)) ? resolveSize('topo') : null;
}

function page(W: number, H: number, c: Palette, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('Inter')}
*{margin:0;padding:0;box-sizing:border-box}
:root{--line:${c.line}}
html,body{width:${W}px;height:${H}px}
body{font-family:Inter,sans-serif;background:${c.pageBg};-webkit-font-smoothing:antialiased;position:relative;overflow:hidden}
.fig-node{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 22px}
.fig-topo-node{position:absolute;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center}
.fig-lines{position:absolute;inset:0}
</style></head><body>${body}</body></html>`;
}

async function load(pg: Page, html: string): Promise<void> {
  await pg.setContent(html, { waitUntil: 'load' });
  await pg.evaluate(async () => { await document.fonts.ready; });
}

function classicBody(spec: Exclude<FigureSpec, GraphSpec>, W: number, H: number, c: Palette): string {
  switch (spec.template) {
    case 'title': return tplTitle(spec, W, H, c);
    case 'flow': return tplFlow(spec, W, H, c);
    case 'diamond': return tplDiamond(spec, W, H, c);
    case 'nodes': return tplNodes(spec, W, H, c);
  }
}

export interface RenderFigureOptions {
  /** Also write the PNG here. */
  outPath?: string;
  tokens?: Tokens;
  /** Device scale factor of the PNG (default 2). */
  scale?: number;
}

export interface FigureRender {
  /** Pixel size of the PNG: the logical canvas times the scale. */
  width: number;
  height: number;
  buffer: Buffer;
  warnings: string[];
}

// Render one figure spec to a PNG on the given (caller-owned) browser.
export async function renderFigure(browser: Browser, spec: unknown, { outPath, tokens, scale = 2 }: RenderFigureOptions = {}): Promise<FigureRender> {
  validateSpec(spec);
  const c = palette(spec.theme === 'dark' ? 'dark' : 'light', { ...tokens, ...spec.colors });
  const pg = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: scale });
  try {
    let W: number, H: number, body: string, warnings: string[] = [];
    if (isGraph(spec)) {
      const measure: Measure = async (fragments) => {
        await load(pg, page(4000, 4000, c, fragments
          .map((h) => `<div data-m style="position:absolute;left:0;top:0;width:max-content">${h}</div>`).join('')));
        return pg.evaluate(() => [...document.querySelectorAll('[data-m]')].map((e) => {
          const r = e.getBoundingClientRect();
          return { w: Math.ceil(r.width) + 1, h: Math.ceil(r.height) };
        }));
      };
      ({ html: body, W, H, warnings } = await renderGraph(spec, c, measure));
    } else {
      [W, H] = resolveSize(spec.size);
      body = classicBody(spec, W, H, c);
    }
    await pg.setViewportSize({ width: W, height: H });
    await load(pg, page(W, H, c, body));
    const shot = await pg.screenshot({ type: 'png' });
    if (outPath) await sharp(shot).png().toFile(outPath);
    return { width: W * scale, height: H * scale, buffer: shot, warnings };
  } finally {
    await pg.close();
  }
}
