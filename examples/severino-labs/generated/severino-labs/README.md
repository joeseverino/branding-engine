# Severino Labs Brand Kit

The full kit: the poster up top, each section's own image below, then the files,
all generated from the brand's mark, color, and font.

![Severino Labs brand overview](sheet/overview.png)

## Mark

![mark](sheet/sheet-mark.png)

Rounded accent tile with a white glyph (default); accent glyph and white glyph on
transparent for light and dark surfaces. In `mark/`: `mark.svg`,
`mark-512/1024.png`, `mark-transparent-light/dark.png`.

## Color

![palette](sheet/palette.png)

| Role | Hex |
|---|---|
| Accent | `#6D5EF7` |
| Deep | `#352A8A` |
| Ink | `#0b0620` |
| Paper | `#ffffff` |

CSS custom properties in `web/tokens.css`.

## Type

![type specimen](sheet/type-specimen.png)

Inter (`inter-variable-latin.woff2`).

## Wordmark

![wordmark](wordmark/wordmark-light.png)

![wordmark caps](wordmark/wordmark-caps-light.png)

Vector-first: `wordmark.svg` (text in `currentColor`) is the source; the `-light/-dark` PNGs rasterize from it. Title case and all-caps both ship.

## Folders

- `icons/` favicons + apple-touch
- `mark/` the mark: vector, raster, transparent light/dark
- `wordmark/` horizontal lockups: `wordmark.svg` + light/dark PNGs, title + caps
- `sheet/` this overview and its section images
- `web/` `tokens.css`, `site.webmanifest`, `head.html` (drop-in wiring)
