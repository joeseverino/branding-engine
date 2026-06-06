# branding-engine

Generate a complete, self-consistent brand kit from one accent color and a
monogram: a favicon set, a vector mark, wordmark lockups, social cards, a brand
sheet, and drop-in web tokens. The mark and wordmark are real font outlines
(pure vector, no raster source); only the social cards and brand sheet render
live text via a headless browser.

One monogram, one accent color, every brand surface.

## Install

```sh
npm install branding-engine
```

`sharp` (used everywhere) installs automatically. `@playwright/test` is an
**optional** dependency: it's only needed for the brand sheet and social cards.
The mark, wordmark, and icon generation path needs neither Playwright nor Python.
To enable sheets and cards:

```sh
npm i -D @playwright/test && npx playwright install chromium
```

## Plug into a site (Astro, Eleventy, plain HTML)

The fastest path for a website: scaffold a config, set your color, generate a
favicon set into `public/`. No headless browser, no python.

```sh
npm i -D branding-engine
npx branding-engine init        # writes brand.config.json + a `brand` npm script
# edit accent, glyph, name in brand.config.json, then:
npm run brand                   # generates into public/, prints the <head> snippet
```

`brand.config.json` is flat:

```json
{ "name": "My Site", "accent": "#2563EB", "glyph": "MS", "wordmark": "My Site" }
```

`generate` writes these to `public/` at the root paths a static site expects, and
prints the `<head>` block to paste in (its `theme-color` reflects your accent):

```text
public/favicon.ico  favicon.svg  favicon-32.png  favicon-192.png
public/apple-touch-icon.png  site.webmanifest  brand-tokens.css
```

Commit those files; they are deterministic, so re-running `npm run brand` after a
color change reproduces them exactly. Optional flags: `--public <dir>`,
`--config <file>`.

## CLI

```sh
# A one-off kit (mark, wordmark, sheet, web) from an accent + initials
branding-engine kit acme ff5733 AC "Acme Corp"

# Just the lean, browser-free pieces (what a website needs)
branding-engine kit acme ff5733 AC "Acme Corp" --only mark,wordmark,web

# A whole brand (primary identity + surfaces + cards) from a config
branding-engine build --config ./brand --out ./kits
```

Flags: `--config <dir|brand.json>`, `--out <dir>`, `--font <file>`,
`--only mark,wordmark,sheet,web,cards` (`mark` includes the favicon set).

## Brand config

`build` reads a `brand.json` (and an optional sibling `surfaces.json`). Paths
inside it (`font`, `portrait`) are resolved relative to the config's directory;
omit `font` to use the bundled Inter.

```jsonc
{
  "name": "Acme",
  "wordmarkWeight": 700,            // wordmark text weight (mark uses `weight`, default 800)
  "identity": {
    "slug": "acme",
    "color": "#1E3A8A",            // accent
    "deep": "#14245C",            // optional; falls back to a darkened accent
    "onColor": "#ffffff",         // optional; color on the accent
    "glyph": "AC",
    "wordmark": "Acme Corp"
  },
  "cardPalette": { "accent": "#5B82D6", "textSoft": "#DDE6FB", "textMuted": "#A9C0E8" },
  "cards": [ /* { file, width, height, photoWidth, eyebrow, name, tagline, meta, url } */ ]
}
```

`surfaces.json` lists other surfaces that inherit the font and glyph and override
only color (and optionally wordmark):

```json
{ "support": { "color": "#1f4d57", "wordmark": "Acme Support" } }
```

## Programmatic API

```js
import { buildBrand, buildKit, markSvg, wordmarkSvg } from 'branding-engine';

await buildKit({ slug: 'acme', hex: '#ff5733', glyph: 'AC', wordmark: 'Acme', only: 'mark,wordmark', outDir: 'public/brand' });
const svg = markSvg({ size: 64, bg: '#ff5733', glyph: 'AC' }); // pure string, no I/O
```

## Output

Each kit is `<out>/<slug>/`:

- `icons/`: `favicon.svg/.ico`, `favicon-32/192.png`, `apple-touch-icon.png`
- `mark/`: `mark.svg`, `mark-512/1024.png`, transparent light/dark
- `wordmark/`: `wordmark.svg` + light/dark PNGs, plus all-caps `wordmark-caps.*`
- `sheet/`: `overview.png` poster + section images, and a `README.md`
- `web/`: `tokens.css`, `site.webmanifest`, `head.html`

Social cards land in `<out>/cards/`.

## Fonts and python

The bundled Inter ships with prebuilt glyph outlines, so the default font needs
**no python**. A custom font (or a glyph outside the bundled set) is extracted on
demand and requires `python3` + `fonttools` (`pip install -r requirements.txt`);
the extracted cache is written under `.brand-cache/` (or `$BRAND_CACHE_DIR`),
never into the installed package.
