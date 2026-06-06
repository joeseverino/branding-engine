# branding-engine

Generate a consistent brand kit from a compact alphanumeric mark and one accent
color. Outputs include favicons, vector and raster marks, wordmark lockups,
brand sheets, social cards, manifests, and CSS tokens.

The mark and wordmark use real font outlines. The common website path requires
only Node.js; browser rendering is optional.

## Example

Illustrative input using a non-production sample palette:

```json
{
  "name": "Severino Labs",
  "identity": {
    "slug": "severino-labs",
    "color": "#6D5EF7",
    "deep": "#352A8A",
    "onColor": "#FFFFFF",
    "glyph": "SL",
    "wordmark": "Severino Labs"
  },
  "portrait": "./studio.jpg",
  "cardPalette": {
    "accent": "#9B8CFF",
    "textSoft": "#E3DEFF",
    "textMuted": "#B7AFE8"
  },
  "cards": [
    {
      "file": "social-card.png",
      "width": 1200,
      "height": 630,
      "photoWidth": 420,
      "eyebrow": "Severino Labs",
      "name": "Brand systems, generated.",
      "tagline": "Marks, wordmarks, sheets, web assets, and social cards from one config.",
      "meta": "Illustrative branding-engine example",
      "url": "github.com/jseverino/branding-engine"
    }
  ]
}
```

Generated mark:

![Severino Labs generated mark](./examples/severino-labs/generated/severino-labs/mark/mark-512.png)

Generated wordmark:

![Severino Labs generated wordmark](./examples/severino-labs/generated/severino-labs/wordmark/wordmark-light.png)

Generated brand sheet:

![Severino Labs generated brand sheet](./examples/severino-labs/generated/severino-labs/sheet/overview.png)

Generated social card:

![Severino Labs generated social card](./examples/severino-labs/generated/cards/social-card.png)

The complete input and committed generated output are in
[`examples/severino-labs`](./examples/severino-labs/).

## Requirements

- Node.js 18 or newer
- `sharp`, OpenType.js, and the WOFF2 decoder, installed automatically
- Optional: `@playwright/test` plus Chromium for brand sheets and social cards

Install:

```bash
npm install branding-engine
```

For sheets and social cards:

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

## Glyph Rules

`glyph` is the compact mark rendered inside the tile.

- Accepts 1-3 ASCII letters or digits
- Lowercase letters are normalized to uppercase
- Spaces, punctuation, symbols, and strings longer than three characters fail
- Layout dynamically adjusts by character count and caps narrow marks by height

Valid:

```text
A
AC
A3X
7
R2
```

Invalid:

```text
ABCD
A C
A-C
@
```

## Quick Start: Add Branding to a Website

Use `init` and `generate` when a site needs favicons, a manifest, and CSS
tokens in its public directory.

```bash
npm install --save-dev branding-engine
npx branding-engine init
```

Edit the generated `brand.config.json`:

```json
{
  "name": "My Site",
  "accent": "#2563EB",
  "deep": "#173B8F",
  "onColor": "#FFFFFF",
  "glyph": "MS"
}
```

Then generate the files:

```bash
npm run brand
```

Default output:

```text
public/
├── apple-touch-icon.png
├── brand-tokens.css
├── favicon-32.png
├── favicon-192.png
├── favicon.ico
├── favicon.svg
└── site.webmanifest
```

The command also prints the `<head>` links to add to the site.

### Website Config Reference

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Application name used in `site.webmanifest` |
| `accent` | yes | Six-digit hex accent, with or without `#` |
| `glyph` | yes | One to three alphanumeric mark characters |
| `deep` | no | Dark palette shade; derived from `accent` when omitted |
| `onColor` | no | Glyph color on the accent; defaults to `#FFFFFF` |

Options:

```bash
branding-engine generate --config path/to/brand.config.json --public path/to/public
```

Generated files are deterministic and intended to be committed with the site.

## Full Brand Kit

Use `build` for a reusable config-driven kit:

```bash
branding-engine build --config ./brand --out ./kits
```

`--config` accepts either a `brand.json` path or a directory containing
`brand.json`. An optional `surfaces.json` can live beside it.

Minimal `brand.json`:

```json
{
  "name": "Acme",
  "identity": {
    "slug": "acme",
    "color": "#1E3A8A",
    "glyph": "AC",
    "wordmark": "Acme Corp"
  }
}
```

Expanded `brand.json`:

```json
{
  "name": "Acme",
  "font": "./AcmeSans.ttf",
  "weight": 800,
  "wordmarkWeight": 700,
  "identity": {
    "slug": "acme",
    "color": "#1E3A8A",
    "deep": "#14245C",
    "onColor": "#FFFFFF",
    "glyph": "A3C",
    "wordmark": "Acme Corp"
  },
  "portrait": "./portrait.jpg",
  "cardPalette": {
    "accent": "#5B82D6",
    "textSoft": "#DDE6FB",
    "textMuted": "#A9C0E8"
  },
  "cards": [
    {
      "file": "social-card.png",
      "width": 1200,
      "height": 630,
      "photoWidth": 420,
      "eyebrow": "Acme Corp",
      "name": "Acme",
      "tagline": "Built for what comes next.",
      "meta": "Brand systems and engineering",
      "url": "acme.example"
    }
  ]
}
```

### Full Config Reference

| Field | Required | Description |
|---|---:|---|
| `name` | no | Human-readable brand name used in logs and fallbacks |
| `identity` | yes | Primary brand identity object |
| `identity.slug` | yes | Output directory name |
| `identity.color` | yes | Six-digit accent color |
| `identity.glyph` | yes | One to three alphanumeric mark characters |
| `identity.wordmark` | no | Text used for wordmark lockups and sheet title |
| `identity.deep` | no | Curated dark shade |
| `identity.onColor` | no | Glyph color on accent |
| `font` | no | Font path relative to `brand.json`; defaults to bundled Inter |
| `weight` | no | Mark font weight; defaults to `800` |
| `wordmarkWeight` | no | Wordmark font weight; defaults to `700` |
| `surfaces` | no | Inline additional surfaces; `surfaces.json` takes precedence |
| `portrait` | for cards | JPEG path relative to `brand.json` |
| `cardPalette` | for cards | Card accent and supporting text colors |
| `cards` | no | Social-card definitions rendered to `<out>/cards/` |

Additional surfaces inherit the primary glyph unless they override it:

```json
{
  "support": {
    "color": "#1F4D57",
    "wordmark": "Acme Support"
  },
  "labs": {
    "color": "#7C3AED",
    "glyph": "A3",
    "wordmark": "Acme Labs"
  }
}
```

## One-Off Kit

Create a kit without a config file:

```bash
branding-engine kit acme ff5733 AC "Acme Corp"
```

Three-character example:

```bash
branding-engine kit prism 635bff P3X "Prism Works" \
  --only mark,wordmark,web \
  --out ./kits
```

Syntax:

```text
branding-engine kit <slug> <hex> <glyph> ["Wordmark"] [options]
```

## Stages

Select stages with a comma-separated `--only` value:

```bash
branding-engine build \
  --config ./brand.json \
  --out ./kits \
  --only mark,wordmark,web
```

| Stage | Browser needed | Output |
|---|---:|---|
| `mark` | no | Favicons, vector mark, PNG marks, transparent variants |
| `wordmark` | no | Vector and PNG title-case/all-caps lockups |
| `web` | no | CSS tokens, web manifest, and `<head>` snippet |
| `sheet` | yes | Brand overview poster, sections, and generated kit README |
| `cards` | yes | Configured social-card PNGs |

Without `--only`, all stages run.

## Output Layout

Each kit is written under `<out>/<slug>/`:

```text
<out>/<slug>/
├── icons/
├── mark/
├── sheet/
├── web/
└── wordmark/
```

Social cards are written to `<out>/cards/`.

## Programmatic API

```js
import {
  buildBrand,
  buildKit,
  generateSite,
  markSvg,
  normalizeGlyph,
  wordmarkSvg,
} from 'branding-engine';

await buildKit({
  slug: 'acme',
  hex: '#FF5733',
  glyph: 'a3x',
  wordmark: 'Acme',
  only: 'mark,wordmark,web',
  outDir: 'public/brand',
});

const glyph = normalizeGlyph('a3x'); // "A3X"
const mark = markSvg({ size: 64, bg: '#FF5733', glyph });
const lockup = wordmarkSvg({
  tileHex: '#FF5733',
  text: 'Acme',
  glyph,
});
```

Main exports:

- `buildBrand(options)`
- `buildKit(options)`
- `initSite(options)`
- `generateSite(options)`
- `makeMark(options)`
- `makeWordmark(options)`
- `makeSheet(options)`
- `makeWeb(options)`
- `makeCards(options)`
- `markSvg(options)`
- `wordmarkSvg(options)`
- `normalizeGlyph(glyph)`
- `renderCard(browser, options)`
- `launchBrowser()`

## Fonts and Glyph Extraction

Bundled Inter caches include uppercase letters and digits for marks, plus
uppercase, lowercase, digits, and spaces for wordmarks.

Custom fonts and missing characters are extracted entirely in Node with
OpenType.js and a WebAssembly WOFF2 decoder. No Python, fonttools, native
binding, or system font utility is required. Supported input formats are TTF,
OTF, WOFF, and WOFF2.

Extracted caches are written under `.brand-cache/`, or the directory specified
by `BRAND_CACHE_DIR`. The installed package is never modified. If a variable
font cannot be instantiated at the requested `weight`, the build exits with the
font filename and parser error; use a static font file or another supported
variable font.

## Errors

The CLI exits nonzero with an actionable message for invalid glyphs, invalid
colors, missing configs, unavailable font glyphs, or missing optional browser
dependencies.

Example:

```text
Invalid glyph: "ABCD". Expected 1-3 letters or digits, e.g. A, AC, or A3X.
```

## License

MIT. The bundled Inter font includes its own notice under
`assets/fonts/inter/NOTICE.md`.
