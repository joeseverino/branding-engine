# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should start
with [README.md](./README.md) and [CONTRIBUTING.md](./CONTRIBUTING.md); this file
is the operational quick reference an agent needs to make a safe change.

## What this is

`branding-engine` generates a brand kit — favicons, vector/raster marks,
wordmark lockups, brand sheets, social cards, web manifests, and CSS tokens —
from one accent color and a 1–3 character glyph. Pure ESM, Node 18+. Marks and
wordmarks are built from real font outlines entirely in Node (OpenType.js + a
WebAssembly WOFF2 decoder); there is no Python, fonttools, or native font
dependency.

## Setup & commands

```bash
npm ci            # install
npm test          # node --test: browser-free tests + the example snapshot test
npm run check     # npm test + npm pack --dry-run
```

The browser-free path needs no Chromium. The `sheet` and `cards` stages and
`test/browser.test.mjs` need Playwright Chromium:

```bash
npm i -D @playwright/test && npx playwright install chromium
```

## Layout

- `index.mjs` — the public API surface (re-exports from `src/`). Update this when
  adding or renaming an export.
- `bin/cli.mjs` — CLI entry: `init`, `generate`, `build`, `kit`, `figure`.
- `src/` — one module per concern: `build.mjs` (`buildBrand` / `buildKit`),
  `make-mark.mjs`, `make-wordmark.mjs`, `make-sheet.mjs`, `make-web.mjs`,
  `make-cards.mjs`, plus glyph/font helpers.
- `examples/severino-labs/` — a sample `brand.json` plus its committed
  `generated/` output, used as a snapshot in tests.
- `test/` — `smoke.test.mjs` (browser-free) and `browser.test.mjs` (snapshot).

## Conventions & gotchas

- **Output is deterministic.** A given config must always produce identical
  bytes. `test/browser.test.mjs` rebuilds the Severino Labs example and compares
  it to `examples/severino-labs/generated/` — text files byte-exact, PNG/ICO by
  format + dimensions (browser rasterization varies by OS, so pixels are not
  compared).
- **If you change anything that affects rendering, regenerate the example and
  commit the result:**
  ```bash
  node bin/cli.mjs build --config examples/severino-labs/brand.json \
    --out examples/severino-labs/generated
  ```
- **Glyph rules:** 1–3 ASCII letters or digits; lowercase is normalized to
  uppercase; anything else must fail with an actionable message. See
  `normalizeGlyph`.
- Font glyph caches are written under `.brand-cache/` (or `$BRAND_CACHE_DIR`).
  Never modify files inside the installed package.
- Keep the `package.json` `files` list and `npm pack --dry-run` output tight:
  `bin`, `src`, `assets`, `examples`, `index.mjs` ship intentionally — nothing
  else should.
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
