// Shared headless-Chromium plumbing for the renderers that need live text (the
// social cards and the brand sheet; the mark and wordmark are pure SVG and need
// none of this). Centralizes the @font-face embed and the launch / fonts-ready /
// close dance, and lets a whole build reuse one browser instead of launching one
// per kit.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import type { BrowserType } from '@playwright/test';
import { fontPath } from './font.ts';

export interface ViewportSize {
  width: number;
  height: number;
}

/** The part of a Playwright page the renderers drive. */
export interface Page {
  setContent(html: string, options?: { waitUntil?: 'load' }): Promise<void>;
  evaluate<R>(pageFunction: () => R | Promise<R>): Promise<R>;
  screenshot(options?: { type?: 'png'; fullPage?: boolean }): Promise<Buffer>;
  locator(selector: string): { screenshot(): Promise<Buffer> };
  setViewportSize(size: ViewportSize): Promise<void>;
  close(): Promise<void>;
}

/**
 * The part of a Playwright browser the renderers drive. A Playwright `Browser`
 * satisfies it, so the declarations need no Playwright types of their own.
 */
export interface Browser {
  newPage(options: { viewport: ViewportSize; deviceScaleFactor: number }): Promise<Page>;
  close(): Promise<void>;
}

// The bundled font embedded as a data URI, as an @font-face for `family`.
export function fontFaceCss(family: string): string {
  const font = fontPath();
  const ext = path.extname(font).slice(1).toLowerCase();
  const formats: Record<string, readonly [mime: string, format: string]> = {
    otf: ['font/otf', 'opentype'],
    ttf: ['font/ttf', 'truetype'],
    woff: ['font/woff', 'woff'],
    woff2: ['font/woff2', 'woff2'],
  };
  const [mime, format] = formats[ext] || ['application/octet-stream', ext];
  const b64 = readFileSync(font).toString('base64');
  return `@font-face{font-family:${family};font-weight:200 900;font-display:block;` +
    `src:url(data:${mime};base64,${b64}) format('${format}')}`;
}

// Playwright is an optional dependency: only the sheet and social-card renderers
// need a browser, so it's imported lazily. The mark/wordmark/icons path never
// touches this and installs lean.
export async function launchBrowser(): Promise<Browser> {
  let chromium: BrowserType;
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
export interface PageOptions {
  html: string;
  viewport: { width: number; height: number };
  deviceScaleFactor?: number;
}

export async function withPage<T>(
  browser: Browser,
  { html, viewport, deviceScaleFactor = 2 }: PageOptions,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
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
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await launchBrowser();
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
