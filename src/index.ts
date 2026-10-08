// Programmatic API. The CLI (cli.ts) is a thin wrapper over buildBrand /
// buildKit; import these directly to embed the engine in a build pipeline.
export { buildBrand, buildKit } from './build.ts';
export type { BuildBrandOptions, BuildKitOptions, Only, Stage } from './build.ts';
export type { BrandConfig, CardPalette, Identity, Surface } from './config.ts';
export { initSite, generateSite } from './site.ts';
export type { GenerateOptions, GenerateResult, InitResult, SiteConfig } from './site.ts';
export { makeMark } from './make-mark.ts';
export type { MarkKitOptions } from './make-mark.ts';
export { renderMarkSet } from './render-mark-set.ts';
export type { MarkSet, MarkSetOptions } from './render-mark-set.ts';
export { makeWordmark } from './make-wordmark.ts';
export type { WordmarkKitOptions } from './make-wordmark.ts';
export { makeSheet } from './make-sheet.ts';
export type { SheetOptions } from './make-sheet.ts';
export { makeWeb } from './make-web.ts';
export type { WebOptions } from './make-web.ts';
export { makeCards } from './make-cards.ts';
export type { CardSpec, CardsOptions } from './make-cards.ts';
export { makeFigure, readSpec } from './make-figure.ts';
export type { MakeFigureOptions } from './make-figure.ts';
export { isPictogramFiles, makePictogram, makePictograms, resolveColor, tintSvg } from './make-pictogram.ts';
export type { PictogramFiles, PictogramInput, PictogramVariants } from './make-pictogram.ts';
export { markSvg } from './lib/mark.ts';
export type { MarkOptions } from './lib/mark.ts';
export { pictogramSvg, PICTOGRAMS } from './lib/pictogram.ts';
export type { PictogramName, PictogramOptions } from './lib/pictogram.ts';
export { wordmarkSvg } from './lib/wordmark.ts';
export type { WordmarkOptions } from './lib/wordmark.ts';
export { normalizeGlyph } from './lib/identity.ts';
// Lower-level primitives for embedding the renderers in a custom pipeline (e.g.
// a site that writes brand assets to its own paths).
export { renderCard } from './lib/card.ts';
export type { CardColors, CardOptions } from './lib/card.ts';
export { renderFigure, palette, SIZES, TEMPLATES, figureSize, parseFig, FigureSpecError } from './lib/figure/index.ts';
export type { Dimensions, FigureRender, FigureSpec, GraphSpec, Palette, RenderFigureOptions, Tokens } from './lib/figure/index.ts';
export { launchBrowser } from './lib/render.ts';
export type { Browser } from './lib/render.ts';
