// Shared headless-Chromium plumbing for the renderers that need live text (the
// social cards and the brand sheet; the mark and wordmark are pure SVG and need
// none of this). Centralizes the @font-face embed and the launch / fonts-ready /
// close dance, and lets a whole build reuse one browser instead of launching one
// per kit.
import { readFileSync } from 'node:fs';
import { fontPath } from './font.mjs';

// The bundled font embedded as a data URI, as an @font-face for `family`.
export function fontFaceCss(family) {
  const b64 = readFileSync(fontPath()).toString('base64');
  return `@font-face{font-family:${family};font-weight:200 900;font-display:block;` +
    `src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
}

// Playwright is an optional dependency: only the sheet and social-card renderers
// need a browser, so it's imported lazily. The mark/wordmark/icons path never
// touches this and installs lean.
export async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    throw new Error(
      'Brand sheets and social cards need Playwright. Install it with:\n' +
        '  npm i -D @playwright/test && npx playwright install chromium\n' +
        'The mark, wordmark, and icons need none of this.',
    );
  }
  return chromium.launch();
}

// Open a page on `browser`, load `html`, wait for webfonts, hand the page to
// `fn` (which takes the screenshots), and always close the page. The browser is
// the caller's to own and reuse.
export async function withPage(browser, { html, viewport, deviceScaleFactor = 2 }, fn) {
  const page = await browser.newPage({ viewport, deviceScaleFactor });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.ready; });
    return await fn(page);
  } finally {
    await page.close();
  }
}

// For one-off CLIs: launch a browser just for `fn`, then close it. The build
// passes its own shared browser to withPage directly instead.
export async function withBrowser(fn) {
  const browser = await launchBrowser();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
