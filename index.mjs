// Programmatic API. The CLI (bin/cli.mjs) is a thin wrapper over buildBrand /
// buildKit; import these directly to embed the engine in a build pipeline.
export { buildBrand, buildKit } from './src/build.mjs';
export { initSite, generateSite } from './src/site.mjs';
export { makeMark } from './src/make-mark.mjs';
export { makeWordmark } from './src/make-wordmark.mjs';
export { makeSheet } from './src/make-sheet.mjs';
export { makeWeb } from './src/make-web.mjs';
export { makeCards } from './src/make-cards.mjs';
export { markSvg } from './src/lib/mark.mjs';
export { wordmarkSvg } from './src/lib/wordmark.mjs';
// Lower-level primitives for embedding the renderers in a custom pipeline (e.g.
// a site that writes brand assets to its own paths).
export { renderCard } from './src/lib/card.mjs';
export { launchBrowser } from './src/lib/render.mjs';
