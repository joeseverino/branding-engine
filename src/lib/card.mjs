// Shared social-card renderer: a "text panel + photo" card rendered in real Inter
// via headless Chromium (full-text Inter is beyond the glyph-outline mark pipeline).
// Self-contained: the Inter woff2 is bundled in the kit and embedded as a data URI,
// and the palette is passed in, so no dependency on any other repo.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { esc } from './html.mjs';
import { fontFaceCss, withPage } from './render.mjs';

/**
 * Render a card to a PNG on the given (caller-owned) browser.
 * @param {import('@playwright/test').Browser} browser
 * @param {object} o  width, height, photoWidth, eyebrow, name, tagline, meta, url,
 *                    photoPath, outPath, and colors { panel, panelDeep, onPanel,
 *                    accent, textSoft, textMuted }.
 */
export async function renderCard(browser, o) {
  const c = o.colors;
  const photoB64 = readFileSync(o.photoPath).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFaceCss('Inter')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${o.width}px;height:${o.height}px}
body{display:flex;font-family:Inter,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}
.panel{width:${o.width - o.photoWidth}px;height:${o.height}px;
  background:linear-gradient(135deg,${c.panel},${c.panelDeep});
  padding:72px;display:flex;flex-direction:column;justify-content:center;color:${c.onPanel}}
.eyebrow{font-size:24px;font-weight:600;letter-spacing:3.5px;color:${c.textMuted};text-transform:uppercase}
.name{font-size:78px;font-weight:800;letter-spacing:-2px;line-height:1.05;margin-top:18px}
.rule{width:64px;height:5px;border-radius:2.5px;background:${c.accent};margin-top:26px}
.tagline{font-size:30px;font-weight:400;color:${c.textSoft};margin-top:30px}
.meta{font-size:24px;font-weight:600;letter-spacing:.5px;color:${c.textMuted};margin-top:14px}
.url{font-size:25px;font-weight:600;letter-spacing:.5px;color:${c.textMuted};margin-top:34px}
.photo{width:${o.photoWidth}px;height:${o.height}px;object-fit:cover;object-position:top}
</style></head><body>
<div class="panel">
  <div class="eyebrow">${esc(o.eyebrow)}</div>
  <div class="name">${esc(o.name)}</div>
  <div class="rule"></div>
  <div class="tagline">${esc(o.tagline)}</div>
  <div class="meta">${esc(o.meta)}</div>
  <div class="url">${esc(o.url)}</div>
</div>
<img class="photo" src="data:image/jpeg;base64,${photoB64}">
</body></html>`;

  const shot = await withPage(
    browser,
    { html, viewport: { width: o.width, height: o.height } },
    (page) => page.screenshot({ type: 'png' }),
  );
  // Rendered at 2x for crisp text; downscale to the exact card size.
  await sharp(shot).resize(o.width, o.height).png().toFile(o.outPath);
}
