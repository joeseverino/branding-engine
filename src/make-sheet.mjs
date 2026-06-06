// Generate a brand sheet for one kit into <outDir>/<slug>/: a rendered one-pager
// (overview.png, in the kit's own font) plus a README.md that inlines the poster
// and the kit's assets from the same folder. Reads BRAND_FONT (live text) and
// BRAND_GLYPHS (mark outlines) like the others.
import { Buffer } from 'node:buffer';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { markSvg } from './lib/mark.mjs';
import { normalizeGlyph } from './lib/identity.mjs';
import { fontPath } from './lib/font.mjs';
import { darken, normalizeHex } from './lib/color.mjs';
import { esc } from './lib/html.mjs';
import { fontFaceCss, withBrowser, withPage } from './lib/render.mjs';

const b64 = (s) => Buffer.from(s).toString('base64');

// "inter-variable-latin.woff2" -> "Inter"; "Arial Unicode.ttf" -> "Arial".
function prettyFont(file) {
  const stem = file.replace(/\.[^.]+$/, '').split(/[-_ ]/)[0];
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

export async function makeSheet({ slug, hex, glyph = 'JS', wordmark, deep, browser, outDir }) {
  glyph = normalizeGlyph(glyph);
  const fill = normalizeHex(hex);
  const deepShade = deep ? normalizeHex(deep) : darken(fill);
  const title = wordmark || glyph;

  const font = fontPath();
  const fontFile = path.basename(font);
  const fontLabel = prettyFont(fontFile);

  const rounded = b64(markSvg({ size: 512, rounded: true, bg: fill, glyph }));
  const tLight = b64(markSvg({ size: 512, rounded: true, bg: null, fg: fill, glyph }));
  const tDark = b64(markSvg({ size: 512, rounded: true, bg: null, fg: '#ffffff', glyph }));

  const kitDir = path.join(outDir, slug);
  const sheetDir = path.join(kitDir, 'sheet');
  mkdirSync(sheetDir, { recursive: true });

  const wordmarkBlock = wordmark
    ? '\n## Wordmark\n\n![wordmark](wordmark/wordmark-light.png)\n\n' +
      '![wordmark caps](wordmark/wordmark-caps-light.png)\n\n' +
      'Vector-first: `wordmark.svg` (text in `currentColor`) is the source; the ' +
      '`-light/-dark` PNGs rasterize from it. Title case and all-caps both ship.\n'
    : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('Brand')}
*{margin:0;padding:0;box-sizing:border-box}
:root{--accent:${fill};--deep:${deepShade};--ink:#0b0620;--muted:#6b6b73;--line:#ececf0}
html,body{width:1200px}
body{font-family:Brand,system-ui,sans-serif;background:#fff;color:var(--ink);-webkit-font-smoothing:antialiased;padding:84px 88px}
.eyebrow{font-size:18px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:var(--accent)}
header{display:flex;align-items:center;gap:34px;padding-bottom:40px;border-bottom:3px solid var(--accent)}
header>img{width:120px;height:120px}
.name{font-size:84px;font-weight:800;letter-spacing:-3px;line-height:1}
.sub{font-size:21px;font-weight:500;color:var(--muted);margin-top:8px}
section{padding:46px 0;border-bottom:1px solid var(--line)}
h2{font-size:15px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--muted);margin-bottom:28px}
.marks{display:flex;align-items:center;gap:28px}
.marks>img,.chip{width:132px;height:132px;border-radius:26px}
.chip{display:flex;align-items:center;justify-content:center}
.chip img{width:100%;height:100%;display:block}
.chip.paper{border:1px solid var(--line)}
.chip.dark{background:#0b1220}
.swatches{display:flex;gap:22px}
.sw{flex:1}
.box{height:118px;border-radius:16px;border:1px solid var(--line)}
.lab{margin-top:12px;font-size:18px;font-weight:700}
.hex{font-size:15px;color:var(--muted);font-variant-numeric:tabular-nums}
.big{font-size:128px;font-weight:800;letter-spacing:-5px;line-height:1}
.alpha{font-size:33px;font-weight:600;letter-spacing:1px;margin-top:22px;line-height:1.5}
.row{font-size:28px;margin-top:14px}
.w4{font-weight:400}.w6{font-weight:600}.w8{font-weight:800}
footer{padding-top:38px;font-size:16px;color:var(--muted);display:flex;justify-content:space-between}
</style></head><body>
<header>
  <img src="data:image/svg+xml;base64,${rounded}">
  <div><div class="eyebrow">Brand Kit</div><div class="name">${esc(title)}</div><div class="sub">${esc(slug)} &middot; ${esc(fill)} &middot; ${esc(fontLabel)}</div></div>
</header>
<section class="sec-mark">
  <h2>Mark</h2>
  <div class="marks">
    <img src="data:image/svg+xml;base64,${rounded}">
    <div class="chip paper"><img src="data:image/svg+xml;base64,${tLight}"></div>
    <div class="chip dark"><img src="data:image/svg+xml;base64,${tDark}"></div>
  </div>
</section>
<section class="sec-color">
  <h2>Color</h2>
  <div class="swatches">
    <div class="sw"><div class="box" style="background:${fill}"></div><div class="lab">Accent</div><div class="hex">${fill}</div></div>
    <div class="sw"><div class="box" style="background:${deepShade}"></div><div class="lab">Deep</div><div class="hex">${deepShade}</div></div>
    <div class="sw"><div class="box" style="background:#0b0620"></div><div class="lab">Ink</div><div class="hex">#0b0620</div></div>
    <div class="sw"><div class="box" style="background:#fff"></div><div class="lab">Paper</div><div class="hex">#ffffff</div></div>
  </div>
</section>
<section class="sec-type">
  <h2>Type &middot; ${esc(fontLabel)}</h2>
  <div class="big">Aa</div>
  <div class="alpha">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz 0123456789</div>
  <div class="row w4">Regular: hands-on security and infrastructure.</div>
  <div class="row w6">Semibold: hands-on security and infrastructure.</div>
  <div class="row w8">Black: hands-on security and infrastructure.</div>
</section>
<footer><span>${esc(title)} &middot; Brand Kit</span><span>${esc(fontLabel)}</span></footer>
</body></html>`;

  // The poster, plus each section as its own library image the README inlines.
  const shoot = (b) =>
    withPage(b, { html, viewport: { width: 1200, height: 800 } }, async (page) => ({
      overview: await page.screenshot({ type: 'png', fullPage: true }),
      mark: await page.locator('.sec-mark').screenshot(),
      palette: await page.locator('.sec-color').screenshot(),
      type: await page.locator('.sec-type').screenshot(),
    }));
  // Reuse the build's browser when given one; otherwise launch our own.
  const shots = browser ? await shoot(browser) : await withBrowser(shoot);

  const save = (buf, name, w) => sharp(buf).resize({ width: w }).png().toFile(path.join(sheetDir, name));
  await save(shots.overview, 'overview.png', 1200);
  await save(shots.mark, 'sheet-mark.png', 1024);
  await save(shots.palette, 'palette.png', 1024);
  await save(shots.type, 'type-specimen.png', 1024);

  const md = `# ${title} Brand Kit

The full kit: the poster up top, each section's own image below, then the files,
all generated from the brand's mark, color, and font.

![${title} brand overview](sheet/overview.png)

## Mark

![mark](sheet/sheet-mark.png)

Rounded accent tile with a white glyph (default); accent glyph and white glyph on
transparent for light and dark surfaces. In \`mark/\`: \`mark.svg\`,
\`mark-512/1024.png\`, \`mark-transparent-light/dark.png\`.

## Color

![palette](sheet/palette.png)

| Role | Hex |
|---|---|
| Accent | \`${fill}\` |
| Deep | \`${deepShade}\` |
| Ink | \`#0b0620\` |
| Paper | \`#ffffff\` |

CSS custom properties in \`web/tokens.css\`.

## Type

![type specimen](sheet/type-specimen.png)

${fontLabel} (\`${fontFile}\`).
${wordmarkBlock}
## Folders

- \`icons/\` favicons + apple-touch
- \`mark/\` the mark: vector, raster, transparent light/dark
- \`wordmark/\` horizontal lockups: \`wordmark.svg\` + light/dark PNGs, title + caps
- \`sheet/\` this overview and its section images
- \`web/\` \`tokens.css\`, \`site.webmanifest\`, \`head.html\` (drop-in wiring)
`;
  writeFileSync(path.join(kitDir, 'README.md'), md);
  console.log(`  sheet     ${slug.padEnd(12)} sheet/ + README.md`);
}
