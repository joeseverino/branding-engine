# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should start
with [README.md](./README.md) and [CONTRIBUTING.md](./CONTRIBUTING.md); this file
is the operational quick reference an agent needs to make a safe change.

## What this is

`branding-engine` generates a brand kit — favicons, vector/raster marks,
wordmark lockups, brand sheets, social cards, web manifests, and CSS tokens —
from one accent color and a 1–3 character glyph. TypeScript (strict), published as
compiled ESM with `.d.ts`, Node 24+. Marks and
wordmarks are built from real font outlines entirely in Node (OpenType.js + a
WebAssembly WOFF2 decoder); there is no Python, fonttools, or native font
dependency.

## Setup & commands

```bash
npm ci                # install
npm run typecheck     # tsc, strict, over src/, test/ and scripts/
npm test              # node --test on the .ts tests: browser-free tests + the example snapshot test
npm run build         # tsc -> dist/ (gitignored), then declarations rewritten to .js
npm run check         # typecheck + build + test + npm pack --dry-run
```

Tests run the `.ts` source directly through Node's type stripping, so no build
precedes `npm test`. Node does not strip types inside `node_modules`, so the
package ships `dist/`, never `.ts`. Keep relative imports ending in `.ts`
(`rewriteRelativeImportExtensions` turns them into `.js`), use only erasable
syntax (no `enum`, no parameter properties), and keep `any`, `@ts-*` and
silencing casts out of `src/`.

The browser-free path needs no Chromium. The `sheet` and `cards` stages and
`test/browser.test.ts` need Playwright Chromium:

```bash
npm i -D @playwright/test && npx playwright install chromium
```

## Layout

- `src/index.ts`: the public API surface (re-exports from `src/`, types included).
  Update this when adding or renaming an export.
- `src/cli.ts`: CLI entry: `init`, `generate`, `build`, `kit`, `figure`, `pictogram`.
  Built to `dist/cli.js`, which is the `bin`.
- `src/`: one module per concern: `build.ts` (`buildBrand` / `buildKit`),
  `config.ts` (brand.json types and validation), `make-mark.ts`, `make-wordmark.ts`,
  `make-sheet.ts`, `make-web.ts`, `make-cards.ts`, plus glyph/font helpers in `lib/`.
- `src/lib/figure/`: the figure renderer. `index.ts` (render: measure pass,
  then final page), `spec.ts` (the spec types) and `schema.ts` (a validator for
  every spec key, with suggestions, checked against the types), `dsl.ts`
  (the `.fig` parser), `classic.ts` (title/flow/diamond/nodes), and `graph/`
  for topology/diagram: `model` (node, link, group types) → `normalize` → measure →
  `layout-elk` (auto) or `layout-geo` (star/ring/row/grid/free) → `place` (labels) →
  `frame` (groups, fit, warnings) → `draw`. `parts.ts` renders each text piece for both
  measuring and drawing, so reserved and painted boxes match.
- `examples/severino-labs/` — a sample `brand.json` plus its committed
  `generated/` output, used as a snapshot in tests.
- `examples/figures/` — showcase `.fig` sources and their renders. Re-render
  after a visual change: `for f in examples/figures/*.fig; do node src/cli.ts
  figure "$f" --strict; done`. Keep them generic: no real hosts or services.
- `test/`: `smoke.test.ts`, `regressions.test.ts` and `cli.test.ts` (browser-free),
  `browser.test.ts` (snapshot), `figure.test.ts` and `figure-graph.test.ts` (DSL,
  validation, layout, placement, fit, render).
- `scripts/rewrite-declarations.ts`: build step that points `dist/**/*.d.ts` at `.js`.

## Conventions & gotchas

- **Figures check themselves.** A graph render returns `warnings` (overlaps,
  text below 70%); look at the PNG anyway after any layout change, and keep the
  showcase renders free of warnings.

- **Output is deterministic.** A given config must always produce identical
  bytes. `test/browser.test.ts` rebuilds the Severino Labs example and compares
  it to `examples/severino-labs/generated/` — text files byte-exact, PNG/ICO by
  format + dimensions (browser rasterization varies by OS, so pixels are not
  compared).
- **If you change anything that affects rendering, regenerate the example and
  commit the result:**
  ```bash
  node src/cli.ts build --config examples/severino-labs/brand.json \
    --out examples/severino-labs/generated
  ```
- **Glyph rules:** 1–3 ASCII letters or digits; lowercase is normalized to
  uppercase; anything else must fail with an actionable message. See
  `normalizeGlyph`.
- Font glyph caches are written under `.brand-cache/` (or `$BRAND_CACHE_DIR`).
  Never modify files inside the installed package.
- Keep the `package.json` `files` list and `npm pack --dry-run` output tight:
  `dist`, `assets` and `examples` ship intentionally; nothing else should (no
  `.ts` source).
- GitHub Actions are pinned to commit SHAs. Keep them pinned.

## Before you finish

```bash
npm run check
```

Confirm new behavior has focused tests, the example still regenerates
identically, and the README/CHANGELOG describe any user-facing change.

## Releasing (maintainers)

Signed tags only. Publishing is automatic via npm Trusted Publishing (OIDC, with
SLSA provenance) in `.github/workflows/release.yml`:

```bash
npm version <patch|minor|major>
git push --follow-tags
```

Never add an npm token to the repository or to GitHub Actions.
